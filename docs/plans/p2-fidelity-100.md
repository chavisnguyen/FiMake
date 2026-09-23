# P2 Plan: Fidelity 100% — closing tool gaps found in Apple + Netflix clones

Scope agreed with user:
- Single aggregate doc (not split per tool), work-items ordered by ROI.
- Language: English. Implementation order: P2.0 → P2.5.
- Evidence comes from two real clone sessions in Figma Draft
  (`Apple.com Clone - Desktop 1440`, `Netflix Clone - Desktop 1440`).
- Depends on P1: the `fetchGuarded` helper extracted from `create-image`
  (see `p1-create-svg.md` §3 step 0) is reused by P2.2 `set-image-fill`.

Execution rules for the implementing agent:
- One work-item = one commit, `make check` green before the next item. No version
  bump, no push. Do P1 first (P2.2 needs `mcp/src/tools/fetch-guarded.ts`).
- Anything needing Figma Desktop (fixture recording, manual E2E §10, manifest
  re-import) is handed to a human — see §9 "E2E fixtures" and §13 Handoff.
- If a Figma API behavior below is marked *verify in E2E*, implement as written,
  keep the unit test on the mock, and list it in the handoff notes.

Path conventions (verified against repo): shared schemas live in
`mcp/src/shared/types/params/{create,read,update,delete,shared}/`, plugin handlers in
`plugin/main/tools/{create,read,update,delete}/`. Color = `ColorHexSchema`
(`params/shared/color-hex.ts`, `#RRGGBBAA`). Node id = inline
`z.string().regex(/^\d*:\d*$/)` (no shared `nodeId` schema).

## 1. Background

Two full-page clones (~80 tool calls for Apple, ~120 for Netflix) hit the same
ceiling: layout + copy + colors reach ~80–90% fidelity, but fine typography,
effects, and layering cannot be reproduced with current tools. Concrete evidence:

- **`set-layout` resets sizing to HUG.** Every `set-layout` on a FIXED frame
  (navbar, email rows, FAQ rows) required a follow-up `resize-node` fixup.
- **Append-only children, no reorder.** In the Netflix Hero, a batched
  (parallel) `create-text` + `create-frame` put the frame first; the fix was
  delete + rebuild `Email Row` (9 calls wasted). Same for `Trending Now` /
  `More Reasons` title-vs-row ordering. `set-parent-id` only `appendChild`s.
- **No layering (absolute / z-order).** Netflix hero background image cannot sit
  *behind* text in auto-layout; Top-10 numbers cannot overlap posters.
- **Solid fills only.** Netflix reason-cards, Apple "Pro" neon text, and all
  gradients are unreachable via `set-fill-color`. (Translucent solid fills ARE
  reachable today via the hex alpha channel, except alpha = 0 — see P2.2 bug.)
- **Stroke color only, no effects.** `set-stroke-color` exists but cannot set
  weight/align; no effect setter at all (button shadows missing) — although
  serialization already reads `strokeWeight`, `strokeAlign`, `effects`.
- **Typography.** No font upload (SF Pro, Netflix Sans → Inter), no
  line-height / letter-spacing / align / fixed-width controls, and no way to
  restyle an existing text node. Small text visibly diverges.
- **Heavy-file timeouts.** After the Apple clone (~15 full-res images),
  `get-pages` timed out repeatedly. NOTE: `get-pages` only serializes top-level
  nodes at depth 0 (`serialize-page.ts`), so this is NOT whole-file
  serialization — the prime suspect is `figma.loadAllPagesAsync()`
  (`plugin/main/main.ts:36`, run for every `get-pages` / `get-all-components`).

## 2. P2.0 Fix `set-layout` HUG reset (bug fix, cheapest, do first)

Root cause lives in `plugin/main/tools/update/set-layout.ts`: switching
`layoutMode` from `NONE` to `HORIZONTAL`/`VERTICAL` lets Figma apply its default
sizing (hug), shrinking a FIXED frame. **Verified on real Figma (2026-09-23):**
`layoutSizingHorizontal` flips FIXED → HUG. **Status: done** (plugin fix + unit
test; E2E re-checked 1440×80 navbar with a child stays FIXED).

Fix (one place, all callers benefit):
- Snapshot `width`/`height` before applying entries.
- If `mode` turned auto-layout on AND the caller passed no
  `layoutSizingHorizontal` / `layoutSizingVertical`, set the missing axis to
  `"FIXED"` and `resize(width, height)` back to the snapshot.
- Explicit `HUG`/`FILL` from the caller still wins.

Tests: `plugin-tools.test.ts` — FIXED frame 1440×80 + `mode: HORIZONTAL`
→ stays 1440×80 FIXED; with explicit `layoutSizingHorizontal: "HUG"` → HUG.
No schema change, no docs count change.

## 3. P2.1 Child index + absolute positioning (highest feature ROI)

Unlocks: correct ordering without delete+rebuild, hero overlays, Top-10 numbers
over posters. In Figma, children order IS z-order, so an index covers both.

Do NOT add a `reorder-children` tool and do NOT put `absolute` on `set-layout`:
`SetLayoutParamsSchema.mode` is required, so setting `absolute` on a child would
also overwrite the child's own `layoutMode`; and `set-layout`'s `apply` helper
skips `false` (`set-layout.ts:17`), so `absolute: false` could never reset.
`layoutPositioning` is a property of the child's placement in its parent — it
belongs with `set-parent-id`.

Contract — extend `SetParentIdParamsSchema` (`params/update/set-parent-id.ts`):

```ts
index: z.number().int().min(0).optional()
  .describe("Position among parent's children (0 = bottom/first). Omit = append. Same parent = reorder"),
absolute: z.boolean().optional()
  .describe("true = ABSOLUTE positioning inside an auto-layout parent (overlay); false = back to AUTO. Place with move-node"),
```

Plugin `plugin/main/tools/update/set-parent-id.ts`:
- `index` given → max = `parent.children.length` for a new parent, but
  `parent.children.length - 1` when `node.parent === parent` (reorder); out of
  range → `isError "index out of range (0..max)"`; then
  `parent.insertChild(index, node)`. Omitted → `appendChild` (today).
  **Verified on real Figma (2026-09-23):** `insertChild` counts the node's own
  old slot, so moving later in the same parent lands at `index - 1`. Handler adds
  +1 in that case so `index` is always the final position. **Status: done.**
- `absolute !== undefined` → requires parent `layoutMode !== "NONE"`, else
  `isError "absolute requires an auto-layout parent"`;
  `node.layoutPositioning = absolute ? "ABSOLUTE" : "AUTO"` (use `!== undefined`,
  not truthiness).
- Also add the missing `"appendChild" in parent` check (parity with
  `appendToParent` in `node-helper.ts`).

Update the tool description in `registry.ts` (`"Set the parent id of a node."`
→ mention reorder/z-order/absolute so the Agent discovers it). No new tool,
no count change.

Tests: insert at 0 / middle / end, out-of-range → isError, same-parent reorder,
absolute on auto-layout parent → `layoutPositioning === "ABSOLUTE"`, absolute on
NONE parent → isError, `absolute: false` → `"AUTO"`.

## 4. P2.2 Advanced fills (gradient, image-fill) + alpha bug

Unlocks: Netflix reason-card gradients, Apple neon text, image backgrounds on
existing frames.

**Bug first (same falsy-zero bug, two places):**
- `plugin/main/utils/get-solid-color-paint.ts`: `opacity: color.a || 1` →
  `color.a ?? 1` (`#RRGGBB00` currently renders fully opaque).
- `plugin/main/utils/color-conversion.ts` `convertToHex`: `color.a ? … : 'FF'` →
  `color.a !== undefined ? … : 'FF'` (alpha 0 currently serializes as `FF`).
Add cases to `plugin/tests/unit/utils.test.ts`. No `opacity` param needed on fill
tools: `ColorHexSchema` already carries alpha.

Contract — new simple tool `set-fill-gradient`:

```ts
SetFillGradientParamsSchema = z.object({
  id: z.string().regex(/^\d*:\d*$/),
  type: z.enum(["LINEAR", "RADIAL"]).optional().default("LINEAR"),
  stops: z.array(z.object({
    position: z.number().min(0).max(1),
    color: ColorHexSchema,
  })).min(2),
  angle: z.number().optional().default(0).describe("Degrees, LINEAR only. 0 = left-to-right, 90 = top-to-bottom"),
});
```

Plugin: stops → `{ position, color: {r,g,b,a} }` via existing `convertToRGBA`;
`angle` → `gradientTransform` (the non-trivial part). Rotation about the center:

```
c = cos(a), s = sin(a)
[[ c, s, 0.5 - 0.5c - 0.5s ],
 [-s, c, 0.5 + 0.5s - 0.5c ]]
```

Unit test: 0° = identity `[[1,0,0],[0,1,0]]`. Rotation direction must be confirmed
in E2E (flip sign of `s` if 90° renders bottom-to-top).

Contract — new node-wrapped tool `set-image-fill` (like `create-image`):

```ts
SetImageFillParamsSchema = z.object({
  id: z.string().regex(/^\d*:\d*$/),
  url: z.string().describe("JPG/PNG/GIF, same guards as create-image"),
  scaleMode: z.enum(["FILL", "FIT", "CROP", "TILE"]).optional().default("FILL"),
  // Must stay in the shared schema — plugin dispatch safeParse strips unknown keys
  // (same lesson as create-image imageData).
  imageData: z.array(z.number()).optional(),
});
```

Node side **new dir** `mcp/src/tools/update/set-image-fill.ts` = `fetchGuarded`
(`mcp/src/tools/fetch-guarded.ts`, from P1) + the raster format checks — move
`hasFigmaMagic` / `unsupportedFormatMessage` / `FIGMA_CONTENT_TYPES` from
`create-image.ts` into `fetch-guarded.ts` (or a sibling `raster-format.ts`) so
both tools import them — then forward only `{ id, scaleMode, imageData, target }`. Plugin: `figma.createImage` →
`node.fills = [{ type: "IMAGE", imageHash, scaleMode }]`.

File changes: 2 shared schemas → registry (`set-fill-gradient` in
`SIMPLE_TOOL_DEFS`; `set-image-fill` in `NODE_WRAPPED_TOOLS` + register call) →
2 plugin handlers → dispatch → docs (+2 tools).

## 5. P2.3 Stroke weight/align + effects

Unlocks: email-field borders, button shadows, card elevation.

Stroke — extend existing `SetStrokeColorParamsSchema` (no new tool):

```ts
weight: z.number().min(0).optional().describe("Stroke weight px"),
align: z.enum(["INSIDE", "OUTSIDE", "CENTER"]).optional(),
```

Plugin `set-stroke-color.ts`: set `strokeWeight` / `strokeAlign` only when
provided (existing callers unchanged). Update description to mention them.

Effects — new simple tool `set-effects`, **replace-all** semantics
(idempotent; `[]` clears). Use a discriminated union so invalid combos are
rejected by zod — `ToolResult` has no warning channel, so no "warn, don't fail":

```ts
const Shadow = z.object({
  type: z.enum(["DROP_SHADOW", "INNER_SHADOW"]),
  color: ColorHexSchema,
  offset: z.object({ x: z.number(), y: z.number() }).optional().default({ x: 0, y: 4 }),
  radius: z.number().min(0).optional().default(4),
  spread: z.number().optional().default(0),
});
const Blur = z.object({
  type: z.enum(["LAYER_BLUR", "BACKGROUND_BLUR"]),
  radius: z.number().min(0),
});
SetEffectsParamsSchema = z.object({
  id: z.string().regex(/^\d*:\d*$/),
  effects: z.array(z.union([Shadow, Blur])).max(8),
});
```

Plugin: map to Figma structs (`visible: true`, `blendMode: "NORMAL"` for shadows,
color via `convertToRGBA`), `node.effects = [...]`; node without `effects` →
isError.

File changes: extend 1 schema + 1 new schema → registry (`set-effects` simple) →
plugin handler → dispatch → docs (+1 tool).

## 6. P2.4 Text controls + fonts

Unlocks: small-text fidelity (the most visible remaining gap after P2.1–P2.3).

Shared text-style fields (one zod object, reused by two schemas):

```ts
TextStyleFields = {
  width: z.number().positive().optional().describe("Fixed width px → text wraps (textAutoResize HEIGHT). Omit = auto width"),
  lineHeight: z.number().positive().optional().describe("px"),
  letterSpacing: z.number().optional().describe("percent, e.g. -2"),
  textAlign: z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"]).optional(),
  truncate: z.boolean().optional().describe("Ellipsis on overflow (textTruncation ENDING); needs width"),
};
```

- `CreateTextParamsSchema`: add `TextStyleFields` (all optional, backwards
  compatible).
- New simple tool `set-text-style`: `{ id, ...TextStyleFields, fontSize?, fontName?, fontWeight?, fontColor? }`
  — restyle existing text nodes instead of delete+recreate.
- One plugin helper `applyTextStyle(node, args)` used by both handlers:
  `resize(width, node.height)` + `textAutoResize = "HEIGHT"`,
  `lineHeight: { value, unit: "PIXELS" }`, `letterSpacing: { value, unit: "PERCENT" }`,
  `textAlignHorizontal`, `textTruncation = "ENDING"`.
- `set-text-style` MUST load fonts before editing: `node.getRangeAllFontNames(0, len)`
  → `loadFontAsync` each (handles mixed fonts), else Figma throws.

Fonts — no spike needed: the plugin API cannot upload fonts at runtime
(`loadFontAsync` only loads fonts available to the file). Ship:
- New simple tool `list-fonts` (`figma.listAvailableFontsAsync()`), optional
  `family` substring filter to keep the payload small. Agent picks a real
  installed family (e.g. SF Pro if installed locally with the Figma font helper)
  instead of silently falling back.
- `create-text` font-load error message: suggest calling `list-fonts`.
- Docs: "install the font locally, then reference by family/style".

File changes: shared `text-style.ts` fields + extend create-text + new
`set-text-style` + `list-fonts` schemas → registry (both simple) → plugin
`applyTextStyle` + 2 handlers → dispatch → docs (+2 tools).

## 7. P2.5 Batch-create (call-count killer)

Unlocks: Netflix page (~120 calls → ~10), removes parallel-call ordering races.

Key requirement the original draft missed: ops must reference nodes created by
earlier ops in the same batch, otherwise nested trees (Email Row = frame + text
inside) are impossible.

Contract — new tool `batch-create` (side: `plugin`, simple — no Node-side logic;
zod on the MCP side validates the whole payload):

```ts
const Ref = z.string().regex(/^\$[A-Za-z0-9_-]+$/);           // "$row"
const IdOrRef = z.union([z.string().regex(/^\d*:\d*$/), Ref]);
const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("frame"),     ref: z.string().optional(), params: CreateFrameParamsSchema.extend({ parentId: IdOrRef.optional() }) }),
  z.object({ op: z.literal("text"),      ref: z.string().optional(), params: CreateTextParamsSchema.extend({ parentId: IdOrRef.optional() }) }),
  z.object({ op: z.literal("rectangle"), ref: z.string().optional(), params: CreateRectangleParamsSchema.extend({ parentId: IdOrRef.optional() }) }),
  z.object({ op: z.literal("set-layout"),       params: SetLayoutParamsSchema.extend({ id: IdOrRef }) }),
  z.object({ op: z.literal("set-fill-color"),   params: SetFillColorParamsSchema.extend({ id: IdOrRef }) }),
  z.object({ op: z.literal("set-stroke-color"), params: SetStrokeColorParamsSchema.extend({ id: IdOrRef }) }),
]);
BatchCreateParamsSchema = z.object({
  operations: z.array(Op).min(1).max(50),
});
```

Example: `{op:"frame", ref:"row", params:{...}}` then
`{op:"text", params:{parentId:"$row", ...}}` then
`{op:"set-layout", params:{id:"$row", mode:"HORIZONTAL"}}`.

Plugin `plugin/main/tools/create/batch-create.ts`:
- Sequential loop; resolve `$ref` in `id`/`parentId` from a `Map<ref, nodeId>`
  (unknown ref → fail at that index).
- Call the existing `TOOL_HANDLERS[op]` (it already re-validates with
  `PARAM_SCHEMAS[op]` inside `wrap`) — no duplicated create logic, no switch.
- Avoid the circular import by injection: `batch-create.ts` exports
  `batchCreate(args, handlers: Record<string, DispatchFn>)` and never imports
  `dispatch.ts`; in `dispatch.ts` register it AFTER the `TOOL_HANDLERS` literal:
  `TOOL_HANDLERS["batch-create"] = wrap("batch-create", (a: BatchCreateParams) => batchCreate(a, TOOL_HANDLERS));`
  (export `DispatchFn` type from `dispatch.ts` or move it to `tool-result.ts`).
- Record `content.id` of each created node under its `ref`.
- Result: `{ created: [{ index, ref?, id }] }` (no echo of params).
- Failure at op i → `isError` with `{ index, reason, created }` so the Agent can
  continue or clean up. Prior ops kept, no rollback (documented).

Out of v1: `image` op (needs Node-side fetch — keep using `create-image`).
Cap 50 ops/task; each create is fast, but `text` ops load fonts — E2E must time a
50-op batch against the 20s `TASK_TIMEOUT_MS`.

File changes: shared schema → registry (`SIMPLE_TOOL_DEFS`) → plugin handler →
dispatch → docs (+1 tool).

## 8. Infra spike (before P2.5 load testing)

Correct the premise first: `get-pages` does NOT serialize the whole file (depth 0
per top-level node). Spike steps:

1. Time `loadAllPagesAsync()` vs `dispatchTask` separately for `get-pages` on the
   heavy Apple Draft (add `pluginLog` timings in `main.ts:handleStartTask`).
2. If `loadAllPagesAsync` dominates: page list (`id`, `name`) is readable from
   `figma.root.children` without loading all pages — consider a fast path
   (e.g. `includeNodes: false`) while keeping the default for `export-file`,
   which consumes `get-pages` nodes (`mcp/src/tools/read/export-file.ts:89`).
3. If image weight dominates: add a downscale option to `create-image`.
4. If `TASK_TIMEOUT_MS` (default 20s, `task-manager.ts:35`) still bites, raise or
   make per-tool configurable — document, don't silently swallow.

Build only what the measurement justifies.

## 9. Tests + gate (per work-item)

- `mcp/tests/contract/mcp-tools.test.ts`: simple tools bump the count
  automatically via `SIMPLE_TOOL_DEFS.length`; `set-image-fill` is custom → bump
  both custom-count assertions again (after P1: `:94` `+5` → `+6`, `:106` `+6` → `+7`).
- `mcp/tests/contract/schemas.test.ts`: one case per new/extended schema
  (defaults, rejects; batch: unknown `op`, >50 ops, bad `$ref` format). Per-tool
  describes: forward correctness, validation rejects, SSRF/oversize guards for
  `set-image-fill` (reuse `create-image` test patterns / `fetchGuarded` mocks).
- `plugin/tests/tools/plugin-tools.test.ts` + `helpers.ts`: extend `MockFigma`
  (`listAvailableFontsAsync`, `insertChild`, `layoutPositioning`, `effects`,
  `getRangeAllFontNames`) and cover: HUG fix, index/absolute, gradient transform
  (0° identity), alpha-0 opacity, stroke weight/align, effects replace-all,
  text style + font loading, batch ref resolution + ordering + partial failure.
- `plugin/tests/tools/dispatch-parity.test.ts` covers handler registration automatically.
- **E2E fixtures (blocks `make check`):** `mcp/tests/e2e/mcp-replay.test.ts:162`
  fails for any registered tool without `mcp/tests/e2e/fixtures/<tool>.json`, and
  fixtures can only be recorded against real Figma. Per new tool the agent:
  1. adds a recording case to `mcp/tests/e2e/record-fixtures.ts` (inside the
     sandbox frame, using refs to nodes created earlier in that script);
  2. adds the tool to `INTENTIONALLY_UNRECORDED` (`mcp-replay.test.ts:77`) with
     `// TODO: record fixture`;
  3. lists it in the handoff notes. `set-image-fill` stays permanently
     unrecorded (network fetch, same reason as `create-image`).
- Gate: `make check` (typecheck + lint + test + build).
- After plugin build: **re-import manifest in Figma** (no hot-reload).

Tool count after P1 + P2: 29 → 35. Simple (plugin): 23 → 28 (`set-fill-gradient`,
`set-effects`, `set-text-style`, `list-fonts`, `batch-create`); Node-side logic:
6 → 7 (`set-image-fill`). Per item update: `docs/tools.md:3` (both numbers) + a
table row, `README.md:133` and `:140`, header counts in
`mcp/tests/e2e/record-fixtures.ts:1` and `mcp/tests/e2e/README.md`; extended tools
(`set-parent-id`, `set-stroke-color`, `create-text`) → update their
`registry.ts` description + `docs/tools.md` row.

## 10. Manual E2E checklist (acceptance: Netflix clone deltas)

0. P2.0: `set-layout HORIZONTAL` on the 1440×80 navbar → stays 1440×80, no `resize-node`.
1. P2.1: reorder Trending title above row with `set-parent-id index`; Hero bg image
   *behind* text via `index: 0` + `absolute: true`; Top-10 number overlapping poster.
2. P2.2: reason-cards with real purple gradient (check 0°/90° direction);
   email field translucent fill (`#FFFFFF1A`); `#00000000` renders transparent;
   `set-image-fill` on an existing frame.
3. P2.3: email field 1px gray INSIDE stroke; Get Started drop shadow.
4. P2.4: footer 12–14px text with correct tracking/line-height vs netflix.com
   screenshot; fixed-width wrapping paragraph; `set-text-style` on an existing
   text; `list-fonts` returns installed families.
5. P2.5: rebuild full Email Row (frame + text + button, auto-layout) in 1 call and
   Trending section in ≤3 calls, order correct first try; 50-op batch timed.
6. Infra: `get-pages` + `get-node-info` succeed on the current heavy Draft file.

## 11. Risks

- **Socket payload:** image ops can approach MBs; existing 10MB image cap applies,
  batch has no image op. Never echo input payloads in results.
- **Figma API version drift:** `layoutPositioning`, `gradientTransform`, effect
  structs, `textTruncation` follow `@figma/plugin-typings` — pin and test against it.
- **Gradient direction:** matrix sign convention verified only in E2E.
- **Fonts:** no runtime font upload exists; `list-fonts` + docs is the ceiling.
- **No rollback in batch:** partial success is by design; result lists created ids.

## 12. Out of scope

Video/media nodes, responsive constraints/breakpoints, interactive prototyping
beyond existing `add-prototype-link`, HTML/screenshot import (separate P3
`create-from-html` track), `width/height` on `create-svg` (see P1 out-of-scope),
`image` op in `batch-create`, font upload.

## 13. Handoff (what the agent leaves for a human with Figma Desktop)

The agent finishes each item with `make check` green and writes a short handoff
list in the final message:
- tools added to `INTENTIONALLY_UNRECORDED` with TODO → record via
  `pnpm record:e2e` (see `mcp/tests/e2e/README.md`), then remove from the set;
- *verify in E2E* items: P2.2 gradient 90° direction, P2.5 50-op batch duration vs 20s timeout;
- infra spike (§8) measurements — needs the heavy Draft file, human-run;
- manual E2E checklist §10.
