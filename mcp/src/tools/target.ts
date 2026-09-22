import { z, type ZodRawShape } from "zod";

/**
 * Routing fields merged into EVERY tool shape at registration time (never
 * into the shared zod schemas — the plugin validates with those and must
 * not see them; the orchestrator strips them into the envelope instead).
 *
 * - `targetFileKey`: stable Figma file id (see `list-clients`). Wins when set.
 * - `targetFileName`: human fallback, e.g. "Landing page". May collide —
 *   then every matching window executes, same as broadcast for them.
 * - Both omitted = broadcast to all connected plugin windows (old behavior).
 */
export const TARGET_SHAPE = {
  targetFileKey: z
    .string()
    .optional()
    .describe(
      "Pin this task to one open Figma file by its stable id (see list-clients). Omit to broadcast to all connected windows.",
    ),
  targetFileName: z
    .string()
    .optional()
    .describe(
      "Pin this task to one open Figma file by name, e.g. \"Landing page\". Prefer targetFileKey (names can collide). Omit to broadcast.",
    ),
} satisfies ZodRawShape;

/** Merge routing fields into a tool shape (registration layer only). Generic
 *  so zod keeps inferring exact param types for `server.tool()` overloads. */
export function withTarget<T extends ZodRawShape>(shape: T): T & typeof TARGET_SHAPE {
  return { ...shape, ...TARGET_SHAPE };
}

/** Routing fields as they arrive in validated tool params. */
export interface TargetParams {
  targetFileKey?: string | undefined;
  targetFileName?: string | undefined;
}

/** Pull routing fields out of already-validated params (for fan-out tools). */
export function pickTargetParams(params: TargetParams): TargetParams {
  const out: TargetParams = {};
  if (typeof params.targetFileKey === "string" && params.targetFileKey.length > 0) {
    out.targetFileKey = params.targetFileKey;
  }
  if (typeof params.targetFileName === "string" && params.targetFileName.length > 0) {
    out.targetFileName = params.targetFileName;
  }
  return out;
}
