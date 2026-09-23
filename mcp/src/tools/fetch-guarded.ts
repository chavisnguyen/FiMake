/** Abort a fetch chain that hangs (no timeout in undici by default). Total budget for all redirect hops. */
const FETCH_TIMEOUT_MS = 15000;
/** Max redirect hops to follow manually (each hop re-checked for SSRF). */
const MAX_REDIRECTS = 5;
/** Wikimedia / many CDNs return 403 without a browser-like UA. */
const FETCH_USER_AGENT = "Fimake/1.0 (+https://github.com/chavisnguyen/FiMake)";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function isBlockedHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    if (host === "localhost" || host === "metadata.google.internal" || host === "metadata.google.internal.") return true;
    if (host === "0.0.0.0" || host === "::" || host === "::ffff:127.0.0.1") return true;
    if (/^127\./.test(host) || host === "::1" || host === "[::1]") return true;
    if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    if (/^169\.254\./.test(host)) return true;
    if (/^fc00:/.test(host) || /^fd00:/.test(host) || /^fe80:/.test(host)) return true;
    // AWS/GCP/Azure instance metadata endpoints
    if (host === "169.254.169.254" || host === "metadata.google.internal" || host === "169.254.169.253") return true;
    return false;
}

type HeaderGetter = { get?: (n: string) => string | null };

function getHeader(response: Response, name: string): string {
    const headers = (response as unknown as { headers?: HeaderGetter }).headers;
    if (!headers || typeof headers.get !== "function") return "";
    try {
        return headers.get(name) ?? "";
    } catch {
        return "";
    }
}

function hasHeaders(response: Response): boolean {
    const headers = (response as unknown as { headers?: HeaderGetter }).headers;
    return !!headers && typeof headers.get === "function";
}

// Simple in-memory rate limiter: max 20 fetches per minute per process (shared by every tool).
const fetchTimestamps: number[] = [];
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
function isRateLimited(now: number = Date.now()): boolean {
    while (fetchTimestamps.length > 0 && now - fetchTimestamps[0]! > RATE_LIMIT_WINDOW_MS) {
        fetchTimestamps.shift();
    }
    if (fetchTimestamps.length >= RATE_LIMIT_MAX) return true;
    fetchTimestamps.push(now);
    return false;
}

export type FetchGuardedResult =
    | {
          ok: true;
          bytes: Uint8Array;
          /** Lowercased MIME without parameters ("" when absent). */
          mime: string;
          /** False when the response carried no headers object (unit mocks). */
          withHeaders: boolean;
      }
    | { ok: false; message: string };

/**
 * SSRF-guarded fetch: http(s) only, no credentials, blocked private hosts,
 * manual redirects (each hop re-checked), timeout, rate limit, size cap.
 * Never throws — failures come back as `{ ok: false, message }`.
 */
export async function fetchGuarded(url: string, opts: { accept: string; maxBytes: number }): Promise<FetchGuardedResult> {
    const fail = (message: string): FetchGuardedResult => ({ ok: false, message });
    let currentUrl: URL;
    try {
        currentUrl = new URL(url);
    } catch {
        return fail("Invalid image URL");
    }
    if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
        return fail("Only http(s) image URLs are allowed");
    }
    if (currentUrl.username || currentUrl.password) {
        return fail("Image URL must not contain credentials");
    }
    if (isBlockedHost(currentUrl.hostname)) {
        return fail("Image host is blocked (private/internal network)");
    }
    if (isRateLimited()) {
        return fail("Rate limited: too many image fetches, try again shortly");
    }
    const init = (signal: AbortSignal): RequestInit => ({
        signal,
        redirect: "manual",
        headers: {
            "User-Agent": FETCH_USER_AGENT,
            Accept: opts.accept,
            "Accept-Language": "en-US,en;q=0.9",
        },
    });
    let response: Response | undefined;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            let res: Response;
            try {
                res = await fetch(currentUrl, init(ctrl.signal));
            } catch (error) {
                const msg = error instanceof Error ? error.message : JSON.stringify(error);
                return fail(`Failed to fetch image: ${msg}`);
            }
            const status = res.status ?? 200;
            if (REDIRECT_STATUSES.has(status)) {
                if (hop === MAX_REDIRECTS) return fail(`Too many redirects (>${MAX_REDIRECTS})`);
                const location = getHeader(res, "location");
                if (!location) return fail(`Image redirect (${status}) without Location header`);
                let next: URL;
                try {
                    next = new URL(location, currentUrl);
                } catch {
                    return fail("Image redirect has invalid Location URL");
                }
                if (next.protocol !== "http:" && next.protocol !== "https:") {
                    return fail("Image redirect target protocol must be http(s)");
                }
                if (next.username || next.password) return fail("Image redirect target must not contain credentials");
                if (isBlockedHost(next.hostname)) return fail("Image redirect target is blocked (private/internal network)");
                // Drain body before next hop (avoids socket leak on some runtimes).
                try {
                    await res.arrayBuffer();
                } catch {
                    // ignore drain errors
                }
                currentUrl = next;
                continue;
            }
            response = res;
            break;
        }
    } finally {
        clearTimeout(timer);
    }
    if (!response) return fail("Failed to fetch image: no response");
    if (!response.ok) return fail(`Failed to fetch image: HTTP ${response.status}`);
    // Defense-in-depth: re-check the final URL actually fetched.
    try {
        const finalUrl = new URL(response.url || currentUrl.toString());
        if (isBlockedHost(finalUrl.hostname)) return fail("Image redirect target is blocked (private/internal network)");
    } catch {
        // ignore parse errors
    }
    const withHeaders = hasHeaders(response);
    const contentType = withHeaders ? getHeader(response, "content-type").toLowerCase() : "";
    const mime = contentType.split(";")[0]?.trim() ?? "";
    const len = withHeaders ? Number(getHeader(response, "content-length") || 0) : 0;
    if (len > opts.maxBytes) return fail(`Image exceeds ${opts.maxBytes} bytes`);
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > opts.maxBytes) return fail(`Image exceeds ${opts.maxBytes} bytes`);
    return { ok: true, bytes: new Uint8Array(arrayBuffer), mime, withHeaders };
}
