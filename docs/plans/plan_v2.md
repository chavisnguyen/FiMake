# Plan v2: from "looks close" to the real ceiling — HTML → Figma fidelity + editability

Status after v1.0.37 (P1 + P2 shipped): 35 tools, all P2 items verified on real Figma.
This plan covers what is left between today's result and what Figma can actually do.

## 1. Where we are (measured, 2026-09-23)

Two real builds on the Draft page of the connected file:

| Build | How | Result |
|---|---|---|
| Netflix-style landing (original brand/copy/images) | hand-written `batch-create` script | 40 tool calls, ~10s, order correct first try |
| `sun-asterisk.us` replica (company site, original assets) | Playwright DOM extraction → absolute-positioned nodes | 409 items, 167 tool calls, ~85s, 0 failures |

Pixel comparison of the Sun* replica vs a Playwright screenshot, both at 360px width:
**95.5 %** of pixels match (≤24/255 diff), **98.0 %** after a 2px blur (ignores AA/1px shifts).
Weakest bands: header+hero **79 %** (video background captured as a still from a different
frame), footer **96 %** (marquee position is time-dependent). Every other band matched.

Honest reading: ~90–95 % at full resolution, and **structurally flat** (400+ absolute layers,
no auto-layout, no components) — it looks right but is hard for a designer to edit.

Prototype scripts that produced the replica (kept for V2.0):
- `docs/plans/prototypes/html-extract.mjs` — Playwright @1440: scroll for lazy content, freeze
  animations, screenshot, still frames for video/canvas/iframe, materialize `::before/::after`
  as real spans, effective opacity, fixed/sticky + outermost z-index, overflow clip rects,
  input placeholders / submit labels, natural image sizes.
- `docs/plans/prototypes/html-build.mjs` — maps the extraction to FiMake calls: boxes
  (fill/gradient/per-corner radius/border/shadow), text (font style map, half-leading y
  offset, letter-spacing px→%), images (FILL/FIT from `object-fit`), inline SVG (size set on
  root, `currentColor` resolved), media stills embedded as SVG `<image>`, clip frames for
  partially clipped items, paint order `(fixed, z, DOM order)`.
  Both hardcode `sun-asterisk.us` and `localhost:10101`; V2.0 turns them into a tool.

## 2. The three ceilings

1. **Figma hard ceiling (won't fix).** Figma's text engine ≠ Chrome's (kerning, rasterization,
   line breaking) → 1–2px drift per line at best. No real hover/JS/scroll behavior (only
   prototype approximations). WebGL/canvas only as bitmaps. Visual ceiling for a static
   comparison ≈ **98–99 %**.
2. **Plugin API ceiling — much wider than what we use.** The API supports video fills
   (`figma.createVideoAsync`, paid plans), masks, blend modes, dashed strokes (`dashPattern`),
   per-side stroke weights, rotation/skew (`relativeTransform`), image crop (`imageTransform`)
   and image filters, angular/diamond gradients, multiple paints per node, components,
   variants, styles, variables, constraints. Real limits: no runtime font upload; network only
   to manifest-declared domains.
3. **FiMake / converter ceiling — most of the remaining gap.** Missing paint features,
   flat structure, unmatched line breaks, throughput limits (20 image fetches/min, 20s task
   timeout — a full-page PNG export at scale 0.5 times out), single breakpoint.

## 3. Work items (ROI order)

Execution rules (same as P2): one item = one commit, `make check` green, verify on real
Figma in a sandbox frame at (-5000,-5000) and delete it, record fixtures for new tools in a
sandbox (never a full `pnpm record:e2e` on a client file without asking), no version bump
until the user asks for a release.

### V2.0 Productize the converter (`import-page`)

Goal: `node tools/html-to-figma/import.mjs <url> [--width 1440] [--x 5000]` works on any site.

- Move the prototypes to `tools/html-to-figma/` (new top-level folder, not part of the MCP npm
  package — Playwright is too heavy for the server). Parameterize URL, width, origin, MCP URL.
  Run Node with `--dns-result-order=ipv4first` (IPv6 to Cloudflare was unreachable here).
- Read `playwright` from `plugin/devDependencies` (already installed); document `npx
  playwright install chromium` in the folder README.
- Keep the existing guarantees: fail-soft per item, `build-result.json` with failures,
  delete partial roots on fatal errors.
- Acceptance: re-import `sun-asterisk.us` and one more site; ≥ 95 % (360px metric) on both.

### V2.1 Exact line breaks (biggest visual win left)

Browser already decided every line break; stop letting Figma re-wrap.
- Extractor: split each text node into lines (binary-search character offsets with
  `Range.getClientRects()`), emit `lines: string[]`.
- Builder: `create-text` with text joined by `\n`, **no** `width` (auto width), keep
  `lineHeight`; for centered/right text create the box at the measured width + `textAlign`.
- Acceptance: text-heavy bands (services, testimonials, footer links) ≥ 99 % at **full
  resolution** (see V2.2).

### V2.2 Full-resolution verification harness

- Per-section export at scale 1 (sections are small enough to beat the timeout), stitched
  and diffed against the reference with PIL: per-band score + a heatmap PNG of diffs.
- Make `TASK_TIMEOUT_MS` overridable per tool (export-asset needs ~60s on heavy frames)
  instead of a single global value; document it (P2 §8 infra note).
- Output a short report (`report.md` + heatmaps) next to the import result.

### V2.3 Paint features the API has but our tools don't

Extend existing tools rather than adding many new ones:

| CSS | Figma API | Tool change |
|---|---|---|
| `object-position`, `background-position/size` | `ImagePaint.imageTransform` / `scalingFactor` | `set-image-fill` + `crop` / `offset` |
| `mix-blend-mode` | `node.blendMode` | new `set-blend-mode` (or field on `set-effects`) |
| `border-style: dashed/dotted` | `dashPattern` | `set-stroke-color` + `dash` |
| per-side `border-width` | `strokeTopWeight`… | `set-stroke-color` + `sides` (replaces the thin-rectangle hack) |
| `transform: rotate/skew` | `rotation` / `relativeTransform` | `move-node` + `rotation` |
| `conic-gradient` | `GRADIENT_ANGULAR` | `set-fill-gradient` type `ANGULAR` |
| multiple `background` layers | `fills: Paint[]` | new `set-fills` (ordered paints) |
| `text-shadow`, `text-decoration` | effects on TEXT, `textDecoration` | `set-text-style` + `decoration`, `set-effects` on text |
| element `opacity` | `node.opacity` | `set-opacity` (today we multiply into color alpha) |
| `clip-path: circle/ellipse/inset` | mask node (`isMask`) | `batch-create` op to mask a group |

Each row: shared schema → plugin handler → unit test on `MockFigma` with the *real* property
names (lesson: a stub using `clipContent` hid a broken `clip` for months) → real-Figma check.

### V2.4 Video fill

- New Node-side tool `set-video-fill` (fetch like `create-image`, 10MB cap, `.mp4`/`.webm`)
  → plugin `figma.createVideoAsync(bytes)` → `{ type: "VIDEO", videoHash }` paint.
- Free plans reject video: fall back to the still frame and say so in the result.
- Acceptance: Sun* hero band ≥ 95 % (static metric) and plays in Figma.

### V2.5 Structure: sections, auto-layout, components (editability)

- **Sections:** top-level blocks under `body`/`main` become frames (name from `id`/class/
  heading); items re-parented with relative coordinates.
- **Auto-layout inference:** `display:flex` → `layoutMode` (direction), `gap` →
  `itemSpacing`, padding → padding, `justify-content`/`align-items` → primary/counter align,
  `flex-wrap` → `wrap`; `position:absolute` children → `absolute: true` (P2.1). Only apply
  when the resulting layout reproduces the measured child boxes within 2px, otherwise keep
  absolute positioning for that container (never trade fidelity for structure silently).
- **Components:** repeated siblings with the same subtree shape (cards, logos, team members)
  → one `create-component` + instances with overridden text/images.
- Acceptance: visual score unchanged (±0.5 %) and an editability checklist: change a card
  title → layout reflows; edit the component → all instances update.

### V2.6 Throughput / infra

- Image fetch rate limit configurable (`FIMAKE_FETCH_PER_MIN`, default 20); a page import
  needs ~60 fetches.
- `batch-create` cap stays 50 ops, but add `create-svg` (inline only) as an op to cut calls.
- Close P2 §8 spike: time `loadAllPagesAsync` vs dispatch on the heavy Draft file (now even
  heavier after the two builds) before changing `get-pages`.

### V2.7 Breakpoints

- Extract at 1440 / 768 / 390 and build three sibling frames (`Desktop`, `Tablet`, `Mobile`).
- Acceptance: each frame meets the V2.2 per-band threshold of its own screenshot.

## 4. Lessons carried over (bug classes to test for)

- Node-side tools must forward payloads that pass the plugin's shared schema (contract test
  exists since P2.2 — extend it to every new Node-side tool).
- Mocks must use real Figma property names and real Figma behavior (HUG on auto-layout,
  `insertChild` counting the old slot, frames defaulting to white fill and clipping content).
- `false` is a value: never treat it as "omitted".
- Anything that creates a node before a fallible step must remove it on failure.
- Plugin rebuilds touch `manifest.json`, which makes Figma reload/close the dev plugin — note
  the build label (`v… · sha-dirty HH:MM`) before asking the user to re-run it.

## 5. Out of scope

Real interactivity (JS behavior, hover logic), pixel-identical text, CSS animations beyond a
still or a video, authenticated pages, and publishing replicas of third-party sites (use
original branding/copy/images unless the user owns the site).
