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
    // Alternate IP literal encodings (bypass the dotted-decimal checks above):
    // decimal (2130706433), hex (0x7f000001), octal (017700000001),
    // mixed (0x7f.0.0.1, 0177.0.0.1) and IPv4-mapped IPv6 (::ffff:7f00:1).
    const mapped = ipv4MappedTail(host);
    if (mapped !== null) return isBlockedIPv4(mapped);
    const bytes = parseIPv4Literal(host);
    if (bytes !== null) return isBlockedIPv4(bytes);
    return false;
}

/**
 * Parse an IPv4 literal in any common encoding (inet_aton semantics):
 * single decimal/hex/octal number, or 2–4 dot-separated parts where each
 * part may be decimal, 0x-hex or 0-octal and the last part absorbs the
 * remaining bytes. Returns null when `host` is not an IP literal at all
 * (e.g. a DNS name) — never throws.
 */
export function parseIPv4Literal(host: string): [number, number, number, number] | null {
    const partValue = (p: string): number | null => {
        if (/^0x[0-9a-f]+$/i.test(p)) return bounded(parseInt(p, 16));
        if (/^0[0-7]+$/.test(p) && p.length > 1) return bounded(parseInt(p, 8));
        if (/^\d+$/.test(p)) return bounded(Number(p));
        return null;
    };
    const bounded = (n: number): number | null =>
        Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff ? n : null;
    // Leading 0 means octal (inet_aton) — check before decimal, whose
    // Number() would swallow the digits and overflow the 32-bit range.
    if (/^0[0-7]+$/.test(host) && host.length > 1) {
        const n = bounded(parseInt(host, 8));
        if (n === null) return null;
        return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    }
    if (/^\d+$/.test(host)) {
        const n = bounded(Number(host));
        if (n === null) return null;
        return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    }
    if (/^0x[0-9a-f]+$/i.test(host)) {
        const n = bounded(parseInt(host, 16));
        if (n === null) return null;
        return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    }
    const parts = host.split(".");
    if (parts.length < 2 || parts.length > 4) return null;
    const nums: number[] = [];
    for (const p of parts) {
        if (p.length === 0) return null;
        const v = partValue(p);
        if (v === null) return null;
        nums.push(v);
    }
    if (nums.length === 4) {
        if (nums.some((n) => n > 255)) return null;
        return [nums[0]!, nums[1]!, nums[2]!, nums[3]!];
    }
    if (nums.length === 3) {
        const [a, b, c] = nums as [number, number, number];
        if (a > 255 || b > 255 || c > 65535) return null;
        return [a, b, (c >> 8) & 255, c & 255];
    }
    const [a, b] = nums as [number, number];
    if (a > 255 || b > 16777215) return null;
    return [a, (b >> 16) & 255, (b >> 8) & 255, b & 255];
}

/** Extract the embedded IPv4 from ::ffff: mapped forms (dotted or hex tail). */
function ipv4MappedTail(host: string): [number, number, number, number] | null {
    const prefix = "::ffff:";
    if (!host.startsWith(prefix)) return null;
    const tail = host.slice(prefix.length);
    if (tail.includes(".")) return parseIPv4Literal(tail);
    // Hex tail: last 32 bits as one or two hextets (7f00:1, 7f00:0001).
    const groups = tail.split(":");
    if (groups.length === 0 || groups.length > 2) return null;
    if (!groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
    const n = parseInt(groups.join("").padStart(8, "0").slice(-8), 16);
    if (!Number.isSafeInteger(n)) return null;
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

/** True when IPv4 bytes fall in a non-public range. */
function isBlockedIPv4([a, b]: [number, number, number, number]): boolean {
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 0) return true; // "this network"
    if (a >= 224) return true; // multicast + reserved + broadcast
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
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

// Per-host rate limiter: max 20 fetches per minute per host (a single abusive
// host used to starve the whole process under the old global bucket).
const fetchTimestamps = new Map<string, number[]>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
function isRateLimited(host: string, now: number = Date.now()): boolean {
    let stamps = fetchTimestamps.get(host);
    if (!stamps) {
        stamps = [];
        fetchTimestamps.set(host, stamps);
    }
    while (stamps.length > 0 && now - stamps[0]! > RATE_LIMIT_WINDOW_MS) {
        stamps.shift();
    }
    if (stamps.length >= RATE_LIMIT_MAX) return true;
    stamps.push(now);
    return false;
}

/** Test hook: clear rate-limit state between cases. */
export function resetFetchRateLimit(): void {
    fetchTimestamps.clear();
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
    if (isRateLimited(currentUrl.hostname)) {
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
    // One budget for the whole hop chain AND the body download: clearing the
    // timer before arrayBuffer() used to let a slowloris body stream forever.
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
        if (!response) return fail("Failed to fetch image: no response");
        if (!response.ok) return fail(`Failed to fetch image: HTTP ${response.status}`);
        // Defense-in-depth: re-check the final URL actually fetched.
        // (Full DNS-rebinding pinning would need a custom dispatcher; the
        // per-hop + final re-checks close the cheap variants.)
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
        // Still inside try: the abort signal stays armed during the body
        // download, so a slowloris body can't stream past the budget.
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > opts.maxBytes) return fail(`Image exceeds ${opts.maxBytes} bytes`);
        return { ok: true, bytes: new Uint8Array(arrayBuffer), mime, withHeaders };
    } finally {
        clearTimeout(timer);
    }
}
