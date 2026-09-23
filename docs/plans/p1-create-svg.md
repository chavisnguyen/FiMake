# P1 Plan: `create-svg` — đẩy SVG vào Figma

Scope đã chốt với user:
- Nhận cả 3 nguồn: `svg` inline | `url` | `filePath` (exactly-one).
- Giữ size gốc của SVG (chỉ `x, y, name, parentId`, KHÔNG `width/height`).
- Cap 5MB. Chặn `<!ENTITY`. KHÔNG strip `<script>` (Figma vốn ignore — strip
  bằng regex là code thừa, không đổi kết quả).

## 1. Bối cảnh

- `export-asset SVG` hiện có chỉ là chiều RA (Figma → ngoài).
- `create-image` chỉ nhận JPG/PNG/GIF và từ chối SVG tường minh
  (`mcp/src/tools/create/create-image.ts:89-90`).
- `plugin/main/tools/create/` chưa có handler SVG nào.
- Figma Plugin API có sẵn: `figma.createNodeFromSvg(svg: string): FrameNode`
  (`plugin/node_modules/@figma/plugin-typings/plugin-api.d.ts:1703`).
- Mục tiêu P1: round-trip `export SVG → AI sửa → đẩy lại vào Figma` dưới dạng
  vector editable (khác `create-image` là raster fill trên rectangle).

## 2. Contract tool

Tên: `create-svg` (side: `node+plugin`, như `create-image`).

Mô tả cho Agent:

> "Create an editable vector node from SVG. Provide exactly one of: `svg`
> (inline markup), `url` (http(s) .svg, fetched in Node), `filePath` (local
> .svg, read in Node). Preserves intrinsic SVG size (no resize); use x/y/parentId
> to place. Prefer over create-image when you need editable vectors; use
> create-image for JPG/PNG/GIF photos. Max ~5MB. Accepts
> targetFileKey/targetFileName."

Schema mới `mcp/src/shared/types/params/create/create-svg.ts`:

```ts
CreateSvgParamsSchema = z.object({
  svg: z.string().optional(),
  url: z.string().optional(),
  filePath: z.string().optional(),
  name: z.string().optional().default("SVG"),
  x: z.number().optional().default(0),
  y: z.number().optional().default(0),
  parentId: z.string().regex(/^\d*:\d*$/).optional(),
});
```

KHÔNG dùng `.refine()` trên schema shared: `.refine` trả `ZodEffects` (không có
`.shape`), mà registry đăng ký tool bằng `withTarget(Schema.shape)` (xem
`create-image.ts:141`) → typecheck vỡ. Check exactly-one đặt trong Node handler
(bước 3): đếm `[svg, url, filePath]` có string non-empty, khác 1 → `isError`
`"Provide exactly one of svg, url, filePath"`.

Validation:
- `svg`: phải match
  `/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i`
  (file export từ Illustrator/Inkscape thường có `<?xml` + comment đứng trước),
  `Buffer.byteLength <= 5MB`, chặn `/<!ENTITY/i` (billion-laughs). Dùng chung 1
  hàm `validateSvg(s): string | null` (trả message lỗi) cho cả 3 nguồn.
- `url`: KHÔNG copy guard. Logic fetch hiện nằm inline trong `createImage()`
  (`create-image.ts:34-137`: `isBlockedHost`, redirect tay 5 hop re-check mỗi hop,
  timeout 15s, rate-limit 20/phút, UA). Tách thành helper dùng chung
  `fetchGuarded(url, { accept, maxBytes })` → trả `{ bytes, contentType }` hoặc
  lỗi. `create-image` gọi lại helper (không đổi behavior, test cũ phải xanh);
  `create-svg` gọi với `Accept: image/svg+xml`, chấp nhận
  `content-type: image/svg+xml / text/plain / application/octet-stream` + sniff
  prefix `<svg` thay vì magic bytes raster. P2.2 `set-image-fill` dùng lại helper này.
  Rate-limit counter dùng chung giữa các tool (1 budget / process).
- `filePath`: copy guard của `export-asset.ts:resolveAssetPath` — cấm `\0`,
  cấm filesystem root, `path.resolve`, chỉ nhận `.svg`, `stat.size <= 5MB`,
  đọc utf-8 rồi validate như `svg`.
- LƯU Ý (bài học `imageData` ở `create-image.ts:11-16`): field `svg` PHẢI nằm
  trong shared schema vì plugin dispatch `safeParse` strip unknown keys.

## 3. Thay đổi từng file (thứ tự implement)

0. **Refactor trước** `mcp/src/tools/create/create-image.ts`: tách phần URL
   validate + fetch (protocol/credentials/`isBlockedHost`/rate-limit/redirect loop/
   timeout/size cap, hiện inline trong handler từ `:146`) ra
   `mcp/src/tools/fetch-guarded.ts` (cấp `tools/`, vì P2 `update/` cũng dùng):
   ```ts
   export async function fetchGuarded(
     url: string,
     opts: { accept: string; maxBytes: number },
   ): Promise<{ ok: true; bytes: Uint8Array; contentType: string } | { ok: false; message: string }>;
   ```
   Giữ nguyên message lỗi hiện tại (test cũ assert theo text). Check định dạng
   raster (`hasFigmaMagic`, `unsupportedFormatMessage`, …) VẪN ở `create-image.ts`.
   Commit riêng; `make check` xanh rồi mới làm tiếp.
1. **Mới** `mcp/src/shared/types/params/create/create-svg.ts` (schema trên).
2. `mcp/src/shared/types/index.ts`: thêm `export * from './params/create/create-svg';`.
3. **Mới** `mcp/src/tools/create/create-svg.ts`:
   `export function createSvg(server, taskManager)` — resolve 1 trong 3 nguồn
   thành `svgString`, mọi lỗi network/fs/validate trả `{isError: true}` (không throw),
   forward CHỈ các key cần thiết:
   `taskManager.runTask("create-svg", { svg: svgString, name, x, y, parentId, targetFileKey, targetFileName })`
   qua `safeToolProcessor` — KHÔNG spread `...params` (sẽ gửi kèm `url`/`filePath`
   thừa xuống plugin). Pattern tham chiếu: `create-image.ts:285`. Preview lỗi cắt
   ~200 chars, không echo payload MBs.
4. `mcp/src/tools/registry.ts`: thêm `"create-svg"` vào `NODE_WRAPPED_TOOLS`,
   gọi `createSvg(server, taskManager)` trong `registerAllTools`, update comment block.
   KHÔNG cho vào `SIMPLE_TOOL_DEFS` (vì cần logic Node-side).
5. **Mới** `plugin/main/tools/create/create-svg.ts`:
   ```ts
   export async function createSvg(args: CreateSvgParams): Promise<ToolResult> {
     if (!args.svg) return { isError: true, content: "Missing svg..." };
     let node: FrameNode;
     try {
       node = figma.createNodeFromSvg(args.svg);
     } catch (e) {
       return { isError: true, content: "Invalid SVG: ..." };
     }
     node.name = args.name ?? "SVG";
     node.x = args.x ?? 0;
     node.y = args.y ?? 0;
     const err = await appendToParent(node, args.parentId); // reuse node-helper.ts
     if (err) return err;
     return { isError: false, content: serializeFrame(node) };
   }
   ```
   Không `resize`. Không validate lại ở plugin (Node đã validate; SVG hỏng thì
   `createNodeFromSvg` throw → nhánh catch). `createNodeFromSvg` tự append vào
   currentPage; `appendToParent` sau đó re-parent nếu có `parentId`, còn không
   thì append lại currentPage (vô hại).
6. `plugin/main/tools/dispatch.ts`: import schema, thêm
   `PARAM_SCHEMAS["create-svg"]` + `TOOL_HANDLERS["create-svg"] = wrap("create-svg", createSvg)`.
7. E2E replay fixture: `mcp/tests/e2e/mcp-replay.test.ts:162` FAIL nếu tool đã
   đăng ký mà thiếu `mcp/tests/e2e/fixtures/<tool>.json`. Fixture chỉ record được từ
   Figma thật (`pnpm record:e2e`, xem `mcp/tests/e2e/README.md`). Agent làm:
   - thêm case `create-svg` (inline SVG nhỏ, trong sandbox frame) vào
     `mcp/tests/e2e/record-fixtures.ts`;
   - tạm thêm `"create-svg"` vào `INTENTIONALLY_UNRECORDED` (`mcp-replay.test.ts:77`)
     kèm comment `// TODO: record fixture` để `make check` xanh;
   - người có Figma record xong → xoá khỏi set đó.
8. Docs: `docs/tools.md:3` ("23 … 5 have extra Node-side logic" → "… 6") + thêm
   dòng bảng `create-svg | node+plugin`; `README.md:133` và `:140` (28 → 29, 5 → 6);
   header count trong `record-fixtures.ts:1` và `mcp/tests/e2e/README.md`.
   Không đổi `manifest.json`.

## 4. Tests + gate

- `mcp/tests/contract/mcp-tools.test.ts`: có 2 assertion count phải bump cả hai —
  `:94` (`SIMPLE + 4` → `+ 5`, không bridge) và `:106` (`SIMPLE + 5` → `+ 6`, có
  bridge); thêm `describe("create-svg")`: inline forward đúng `svg`,
  `url` fetch → forward, `file` read → forward, 0/2 nguồn → isError, oversize →
  isError, non-svg → isError, SSRF redirect → blocked + không gọi runTask,
  fetch throw → isError, forward payload KHÔNG chứa `url`/`filePath`. Mock
  `fetch`/`fs` theo mẫu `create-image` hiện có trong cùng file.
- `mcp/tests/contract/schemas.test.ts`: case `CreateSvgParamsSchema` (defaults
  `name/x/y`, reject `parentId` sai regex).
- `plugin/tests/tools/plugin-tools.test.ts` + `plugin/tests/helpers.ts`: thêm
  `createNodeFromSvg: Mock` vào `MockFigma` (hiện chưa có), test: append currentPage,
  append parent, parent missing, invalid SVG (mock throw) → isError.
- `dispatch-parity.test.ts` tự cover (wrapped-non-only phải có handler, không orphan).
- Gate: `make check` (typecheck + lint + test + build).
- Sau build plugin phải **re-import manifest trong Figma** (Figma không hot-reload).

## 5. Handoff: agent làm gì, người làm gì

- **Agent (không cần Figma):** bước 0–8 ở §3, toàn bộ §4. Definition of done:
  `make check` xanh; commit tách: (1) refactor `fetchGuarded`, (2) `create-svg`
  + tests + docs. Không bump version, không push.
- **Người (cần Figma Desktop):** build plugin + re-import manifest, record fixture
  `create-svg` rồi gỡ khỏi `INTENTIONALLY_UNRECORDED`, chạy checklist §6.

## 6. Manual E2E checklist

1. SVG inline nhỏ (icon) → node vector edit được, đúng `x, y`.
2. `url` .svg public → đúng shape.
3. `filePath` local .svg → đúng shape.
4. SVG lỗi / `<!ENTITY` → `isError` rõ ràng. `<script>` / `foreignObject` → ghi
   nhận behavior thực tế của Figma (ignore hay throw) vào `docs/tools.md`.
5. `parentId` sai → `"Parent node not found"`.
6. File ~5MB → ok; >5MB → từ chối gọn trước khi gửi socket.
7. `list-clients` + `targetFileKey` → chỉ 1 file thực thi; omit → broadcast.

## 7. Rủi ro đã tính

- **Socket payload 2–5MB:** ok — `create-image` đã forward `imageData` tới 10MB
  (`MAX_IMAGE_BYTES`) qua cùng đường socket. Timeout mặc định 20s
  (`task-manager.ts:35`) có thể cắn với file lớn (`createNodeFromSvg` parse +
  build node đồng bộ). E2E §6 bước 6 phải đo thời gian với file ~5MB; nếu > ~15s
  thì hạ cap xuống 2MB thay vì chỉ document tăng `TASK_TIMEOUT_MS`.
- **Fonts trong `<text>`:** cần font có sẵn, khuyên outline text
  (giống `export-asset` dùng `svgOutlineText: true`).
- **Không echo input:** result chỉ trả serialized node (`id, name, type, x, y,
  width, height`).

## 8. Out of scope P1

`width/height` resize, batch import, `outputPath`, P3 `create-from-html` (làm riêng sau).
