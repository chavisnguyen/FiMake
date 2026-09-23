/**
 * Raster format guards shared by every tool that forwards image bytes to
 * figma.createImage() (JPG/PNG/GIF only).
 */
/** Refuse absurd payloads before they bloat the socket message (10MB). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/**
 * Prefer Figma-decodable formats. Deliberately de-prioritizes webp: many CDNs
 * (Unsplash/imgix) content-negotiate, and figma.createImage() only supports
 * JPG/PNG/GIF — asking jpeg/png first avoids a needless "unsupported" later.
 */
export const RASTER_ACCEPT = "image/png,image/jpeg,image/gif;q=0.9,image/bmp;q=0.5,*/*;q=0.1";

const FIGMA_MAGIC: Array<{ offset: number; bytes: number[] }> = [
    { offset: 0, bytes: [0xff, 0xd8, 0xff] }, // JPEG
    { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }, // PNG
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF
];

function hasFigmaMagic(buf: Uint8Array): boolean {
    return FIGMA_MAGIC.some(({ offset, bytes }) => bytes.every((b, i) => buf[offset + i] === b));
}

function isWebpBytes(buf: Uint8Array): boolean {
    // RIFF....WEBP
    return (
        buf.length >= 12 &&
        buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50
    );
}

function isBmpBytes(buf: Uint8Array): boolean {
    return buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d;
}

function looksLikeSvgOrHtml(buf: Uint8Array): boolean {
    const head = Buffer.from(buf.slice(0, 512)).toString("utf-8").trimStart().toLowerCase();
    return head.startsWith("<svg") || head.startsWith("<?xml") || head.startsWith("<!doctype html") || head.startsWith("<html");
}

function unsupportedFormatMessage(buf: Uint8Array, contentType: string): string {
    if (isWebpBytes(buf) || contentType.includes("webp") || contentType.includes("avif")) {
        return `Image format (${contentType || "webp/avif"}) is not supported by Figma — only JPG/PNG/GIF. Try a direct .jpg/.png URL (e.g. Unsplash/imgix with ?fm=jpg)`;
    }
    if (isBmpBytes(buf) || contentType.includes("bmp")) {
        return "Image format (bmp) is not supported by Figma — only JPG/PNG/GIF. Use a .jpg/.png URL";
    }
    if (looksLikeSvgOrHtml(buf) || contentType.includes("svg")) {
        return `Not a decodable image (content-type: ${contentType || "unknown"}). SVG/HTML cannot be used with create-image — use create-svg for SVG, or a direct .jpg/.png/.gif URL`;
    }
    return `Unsupported image format (content-type: ${contentType || "unknown"}) — Figma only decodes JPG/PNG/GIF`;
}

/**
 * Error message when fetched bytes can't be decoded by Figma, or null when OK.
 * Lenient when the response carried no headers (unit mocks omit them).
 */
export function rasterFormatError(bytes: Uint8Array, mime: string, withHeaders: boolean): string | null {
    if (!withHeaders || hasFigmaMagic(bytes)) return null;
    // Explicit non-image (text/html, application/octet-stream...) gets a terse message;
    // image/* (webp/svg/avif/bmp...) or missing content-type gets actionable guidance.
    return mime && !mime.startsWith("image/") ? `Not an image (content-type: ${mime})` : unsupportedFormatMessage(bytes, mime);
}
