import z from "zod";

/** Text layout/typography fields shared by create-text and set-text-style. */
export const TextStyleFields = {
    width: z.number().positive().optional()
        .describe("Fixed width px: text wraps inside it and grows in height. Omit = auto width (single line)"),
    lineHeight: z.number().positive().optional().describe("Line height px"),
    letterSpacing: z.number().optional().describe("Letter spacing in % of font size, e.g. -2"),
    textAlign: z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"]).optional().describe("Horizontal text alignment"),
    maxLines: z.number().int().min(1).optional().describe("Truncate with an ellipsis after N lines (use with width)"),
    fontStyle: z.string().min(1).optional()
        .describe("Exact font style name from list-fonts (e.g. \"Semibold\" for SF Pro). Overrides fontWeight"),
};
