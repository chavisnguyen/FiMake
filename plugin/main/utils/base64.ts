// Pure-JS base64 decoder — no atob/Buffer dependency, so it also runs in
// the Figma plugin sandbox (whose globals are a subset of browsers/Node).
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function decodeBase64(b64: string): Uint8Array {
    const clean = b64.replace(/\s/g, "");
    if (clean.length % 4 === 1) throw new Error("Invalid base64 length");
    if (/[^A-Za-z0-9+/=]/.test(clean)) throw new Error("Invalid base64 characters");
    // Padding only allowed as the last 1-2 chars.
    const pad = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
    if (pad > 0 && /[=]/.test(clean.slice(0, -pad))) throw new Error("Invalid base64 padding");
    const outLen = Math.floor((clean.length * 3) / 4) - pad;
    const out = new Uint8Array(outLen);
    let o = 0;
    for (let i = 0; i < clean.length; i += 4) {
        const c0 = B64.indexOf(clean[i]!);
        const c1 = B64.indexOf(clean[i + 1]!);
        const c2 = clean[i + 2] === "=" ? 0 : B64.indexOf(clean[i + 2]!);
        const c3 = clean[i + 3] === "=" ? 0 : B64.indexOf(clean[i + 3]!);
        if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) throw new Error("Invalid base64 characters");
        const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
        if (o < outLen) out[o++] = (triple >> 16) & 255;
        if (o < outLen) out[o++] = (triple >> 8) & 255;
        if (o < outLen) out[o++] = triple & 255;
    }
    return out;
}
