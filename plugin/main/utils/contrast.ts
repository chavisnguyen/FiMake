// WCAG relative luminance + contrast for the design audit.
// Pure math on Figma RGB (0..1) — no FIGMA globals, fully unit-testable.

export interface Rgb {
    r: number;
    g: number;
    b: number;
}

function linearize(c: number): number {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** 0 (black) .. 1 (white). */
export function luminance({ r, g, b }: Rgb): number {
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** 1 (identical) .. 21 (black on white). */
export function contrastRatio(fg: Rgb, bg: Rgb): number {
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
}
