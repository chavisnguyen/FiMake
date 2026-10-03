# P4 Plan: Fix tổng thể — correctness + reliability + security + perf (token vô hạn)

> Nguồn: review full `mcp/src` (69 files), `plugin/{main,ui,shared}`, `Makefile`, `.github/`, `docs/plans`, `pnpm outdated`, grep `TODO|as any|console.log`.
> Hiện trạng: repo khỏe (CI 2 jobs, `make check`, 0 TODO, release đều tới `v1.0.39`). Nợ còn lại là bug logic + security + perf dưới đây.
> Tự đánh giá độ tin cậy (đã đối chiếu code 03/10/2026): ~90% claim đã verify trực tiếp file:line. 5 điểm đã đính chính trong plan: (1) `listen.ts` không phải typo mà là thiết kế gây hiểu nhầm, (2) `main.ts` bug chính là im lặng không phải `TypeError`, (3) lộ `socketId` hạ xuống low, (4) `COMPONENT_SET` cần verify Figma docs, (5) số liệu perf là ước lượng phải benchmark. Broadcast storm nâng lên P0 với mutating tools.
> Tiến độ (03/10/2026): Phase 0 xong (`v1.0.40` đã publish từ 02/10, chỉ cần push commit plan) + Phase 8.0 xong (description `export-asset`) + Phase 1 batch 1 xong (create-instance/create-image/BOOLEAN+SET/corner-0/get-selection/main-malformed/MCP-envelope/unicast). Đính chính sau verify typings: `clone-node` KHÔNG detached (`clone()` auto-parent currentPage, `plugin-api.d.ts`) — không cần fix, chỉ thừa gán name; `color-conversion` fallback đen không tới được qua API (schema `ColorHex` khóa 8-digit + test `schemas.test.ts:117` lock) — thu lại thành cải tiến LLM-UX (chấp nhận `#RRGGBB`), không phải P0.

Execution rules (giữ như P2/V2):
- 1 item = 1 commit, `make check` xanh (typecheck+lint+test+build).
- Verify trên Figma thật trong frame sandbox `(-5000,-5000)` rồi xóa. Không `pnpm record:e2e` full trên file khách khi chưa hỏi.
- Không bump version cho tới khi user yêu cầu release (hiện `mcp/plugin package.json =1.0.40` > tag `v1.0.39`, cần `make release V=1.0.40` riêng).
- Xóa/ignore `prompt.txt` untracked đang làm bẩn tree (làm fail guard `git diff --quiet` của `make release`).

---

## Phase 0 — Hygiene (5 phút)

- [ ] Xóa hoặc thêm `prompt.txt` vào `.gitignore`.
- [ ] Cắt tag `v1.0.40`: verify `mcp/package.json == plugin/package.json == 1.0.40`, `make check`, `push`, `gh release create`.
- [ ] `pnpm outdated --recursive` patch nhẹ an toàn: `hono 4.13.7→.12`, `socket.io 4.8.3→.4`, `eslint 10.10→.12`, `@figma/plugin-typings 1.138→1.140`.

Acceptance: `git status` sạch, `make check` xanh.

## Phase 1 — P0 correctness (làm trước, sai mà vẫn `success`)

### 1.1 Plugin `main/tools/create`
- [x] `create-instance.ts:20` — chỉ `getNodeByIdAsync` check null rồi không `appendChild` (nhánh `parentId` no-op, đã verify code). Fix: append vào `parentId` (dùng `appendToParent` ở `node-helper.ts:39`), fail nếu parent không chứa được. → DONE 03/10: validate parent TRƯỚC khi create (tránh leak instance auto-parent), guard type COMPONENT, append đúng parent.
- [x] `create-instance.ts:6` — cast `as ComponentNode` không check type, message `createInstance is not a function` khi truyền RECTANGLE gây hiểu lầm. VERIFIED 03/10 qua typings: `ComponentSetNode extends ComponentPropertiesMixin` (có `addComponentProperty`) nhưng KHÔNG có `createInstance` (chỉ `ComponentNode`) → create-instance từ chối non-COMPONENT rõ ràng; add/edit/delete-component-property mở cho `COMPONENT_SET`. DONE.
- [x] `socket-manager.ts:184-230` broadcast mọi task tới mọi window — **nâng severity lên P0 với mutating tools**: mở 2 window = `create-rectangle` chạy 2 lần, lần 2 log ồn ở `task-manager.ts:113`. Fix: unicast theo target, chỉ broadcast khi explicit (xem chi tiết Phase 5, làm cùng Phase 1 cho tool tạo node). → DONE 03/10: untargeted chỉ gửi 1 window (ưu tiên activeSocket), targeted giữ nguyên, docs/tools.md cập nhật, test single-delivery.
- [x] `create-image.ts:28` — thiếu `else append`: không `parentId` -> rectangle detached invisible. Thêm nhánh append default + test. → DONE 03/10: append currentPage khi không parentId; parent lạ → lỗi loud + cleanup node (đồng nhất createSvg).
- [ ] `clone-node.ts:12` — VERIFIED NO-FIX 03/10: `clone()` auto-parent currentPage theo typings, params không có `parentId`, node luôn visible. Không đổi behavior.
- [ ] `create-image.ts:5`, `set-image-fill.ts:5` — `imageData:number[]` JSON phình 3-4x (để Phase 5 đổi base64, ở đây chỉ fix orphan): `create-image.ts:14` `figma.createImage` xong parent fail chỉ `node.remove():33`, image còn trong storage -> cần cleanup + test.

### 1.2 Plugin `main/tools/update`
- [x] `set-corner-radius.ts:11,14,17,20` — `&& args.*` skip `0` **chỉ với 4 góc lẻ** (đã verify: `cornerRadius` chung ở `:8` gán trực tiếp nên `0` vẫn được). Đổi 4 nhánh lẻ sang `!==undefined`. Thêm test `0` cho từng góc lẻ. → DONE 03/10.
- [ ] `set-fill-color.ts:13` / `set-stroke-color.ts:11` / `export-asset.ts:8` — `"fills" in node` không đủ: TEXT `fills===mixed` sẽ overwrite per-segment runs (read path đã xử lý ở `serialization.ts:190`, write chưa). Fix: giữ runs hoặc báo lỗi explicit.
- [ ] `set-text-style.ts:17,26` — `getRangeAllFontNames(0,len)` khi `len==0 && mixed` -> fallback cứng `"Inter"`, mất font gốc. Fix: giữ font hiện tại / skip load khi rỗng.
- [ ] `set-parent-id.ts:6,30,35` — `loadAllPagesAsync` mỗi call dù cùng page (đắt, `getNodeByIdAsync` đã on-demand). Move xong mới set `layoutPositioning:35` -> partial-move nếu throw. Fix: set trước hoặc rollback + test.
- [ ] `set-layout.ts:9,12,24` — `[prop,value,transform?:(v:never)=>unknown]` + `as never` mất type check. Viết lại generic đúng + test.
- [ ] `set-effects.ts:8,27` — `toFigmaEffect` return thiếu `spread/offset` cho shadow rồi `as Effect`. Bổ sung field.
- [x] `add-component-property.ts:16` — `Boolean("false")===true`. Parse string `"true"/"false"` đúng. → DONE 03/10 (parse case-insensitive + mở COMPONENT_SET).
- [ ] `add-prototype-link.ts:33,40` — `duration/1000` có thể `NaN`, `easing/direction` cứng. Validate + default rõ.

### 1.3 Plugin read/misc
- [x] `color-conversion.ts:11` — VERIFIED 03/10: schema `ColorHex` khóa 8-digit (`color-hex.ts:4`, test `schemas.test.ts:117` lock) nên fallback đen không tới được qua API. Thu lại thành cải tiến LLM-UX (Phase 8.2: chấp nhận `#RRGGBB`), không fix ở Phase 1.
- [x] `get-selection.ts:5,8` — `if(selection)` với `[]` truthy nên nhánh `not found:11` chết + `serializeNode` mỗi node budget mới -> unbounded. Fix: check `length`, bound tổng payload. → DONE 03/10 (check `length` + message "Selection is empty"; bound payload để Phase 5).
- [ ] `delete-component-property.ts:8` — map `Node not found` thành `Component not found`, mất context. Giữ message gốc.
- [ ] `node-helper.ts:14,24,31` — `isErr` check `"isError" in value` dễ mis-classify + `withNode` serialize ngoài `try`. Fix: branded type / symbol guard, wrap serialize trong try.
- [ ] `batch-create.ts:13,43,47` — chỉ resolve `$ref` cho `id/parentId`, `componentId/instanceId/nodeId/destinationId` fail cross-ref. Check duplicate ref trước handler (hiện sau, tốn 1 call). Thêm op `create-svg` inline để giảm calls (V2.6).

### 1.4 MCP envelope
- [x] `tools/read/get-selection.ts:11-21` (nặng nhất MCP) — không dùng `safeToolProcessor`, `isError:false` cứng. Fix: dùng chung processor + envelope `{isError,content}` như 34 tools còn lại. Thêm contract test lock shape trong `mcp-tools.test.ts`. → DONE 03/10 (dùng `safeToolProcessor`, contract test assert forward `isError` cả 2 chiều).

Acceptance Phase 1: `plugin-tools.test.ts` assert `parent.children/appendChild`, không chỉ `isError`; thêm case `corner-radius=0`, hex 6-digit, `create-instance parent append`, `clone append`, `BOOLEAN("false")`.

## Phase 2 — Reliability (hết treo/crash) → DONE 03/10

- [ ] `shared/format-error.ts:1-3` — `JSON.stringify(error)` ném tiếp với circular/BigInt; `safe-tool-processor.ts:11,15-22` gọi lại `formatError` -> unhandled rejection crash server. Fix: `safeStringify` + giữ `stack`.
- [ ] `bridge/task-manager.ts:91-93,105-143` — `onTaskAdded` single-callback (ghi đè câm, `server.ts:27` comment singleton nhưng không guard). `updateTask` status lạ vẫn `delete:123` không resolve -> treo tới timeout. Fix: guard singleton + `else` reject/log.
- [ ] `bridge/orchestrator.ts:24-35,56-57` — `sendMessage` không `try/catch`, field khai báo sau constructor. Fix: try/catch + reorder.
- [x] `main/main.ts:32,62,108` — bug chính (đã verify): malformed `START_TASK:32-34` `return` im lặng không emit `TASK_FAILED` → server chờ ack/task settle tới timeout. `task.taskId:62` trong `catch` khó trigger `TypeError` vì `null` đã return sớm ở `:32` (chỉ là edge, tách severity thấp riêng). `prevOnMessage:108` floating promise. Fix: emit `TASK_FAILED` cho malformed + `task?.taskId ?? "unknown"` + `await`. → DONE 03/10 (emit `TASK_FAILED` với taskId thật khi còn, `"unknown"` khi mất; `prevOnMessage` để Phase 2 lint `no-floating-promises`).
- [ ] `transport/mcp-sessions.ts:94,117,140-189` — `setInterval` không `unref` (treo vitest), `stale?.close().catch()` không bắt sync-throw, duplicate POST error handling. Fix: `unref`, try/catch sync, gộp helper.
- [ ] `transport/socket-manager.ts:91,108-112,191,284,232-243` — `activeSocket` dead state (`deliver` không dùng), `pruneExpired` chỉ chạy khi connection/flush -> leak `pending` (chứa image 10MB). Fix: sweep interval như `McpSessionStore`.
- [ ] `config/config.ts:16-19,42` — `parse()` throw lúc import trước `try index.ts:51`, `TRANSPORT: z.string().transform` nuốt typo thành `stdio`, `JSON_BODY_LIMIT` fallback câm. Fix: `z.enum(["stdio","streamable-http"])`, refine format, friendly error.
- [ ] `index.ts:13,20,27,37,46` + `listen.ts:47` — `args.includes("doctor"/"stop"/...)` match cả value flag, `await import()` ngoài try, `process.exit()` rải khắp. Fix: parse `argv[2]` subcommand, try/catch import, gom exit + cleanup sessions/sockets. Thêm test được cho `index.ts`.
- [ ] `transport/stdio.ts:31-34` rethrow sau `console.error` -> log trùng ở `index.ts:58`. Chọn 1 nơi log.
- [ ] `doctor.ts:36-44,148-158` — `clientNames()` join không truncate, `isRefused()` match `"fetch failed"` nhầm timeout thành “brew start”. Fix: truncate + phân biệt refused/timeout/hung.
- [ ] `tools/read/export-file.ts:31-41,89,97,138-155` — `nodeStub.id.replace` ném nếu id không string (cast ở `safeParsePage`), ném trong `Promise.all:138` abort batch + orphan file (manifest chưa ghi). Fix: validate trước, fail-soft per-file, ghi manifest atomic.
- [ ] `ui/domain/tasks.ts:54`, `ui/adapters/taskSocket.ts:90`, `ui/app.tsx:92,101,125` — `describeContent` circular -> `"[object Object]"`, `announceFile` swallow + không retry trước `connect`, `scrollTop` + `map` cả list mỗi change. Fix: safe stringify, retry queue, throttle scroll.

Acceptance: không còn promise treo tới timeout trong test; kill server cleanup đúng; `index.ts` test được.

## Phase 3 — Security hardening → DONE 03/10 (socket token + DNS-pin + adm-zip thay thế: deferred có lý do)

- [ ] `tools/fetch-guarded.ts:10-22,42-52,139-156` — blocklist bypass (`2130706433`, `0x7f.0.0.1`, `0177.0.0.1`, `::ffff:7f00:1`, DNS-rebinding), `arrayBuffer` sau `clearTimeout` bypass slowloris, rate-limit global 20/phút starve. Fix: allowlist + resolve+pin DNS + chặn alt-encoding, timeout cả download, rate-limit per-host + reset hook. Thêm test alt-IP + rebinding.
- [ ] `tools/read/export-asset.ts:12-18` + `tools/read/export-file.ts:43-59` — `resolveAssetPath/resolveExportDir` chỉ chặn `\0`+root -> arbitrary write (`~/.ssh/authorized_keys`). Fix: 1 helper `resolveInside()`, sandbox `cwd/exports` hoặc confirm, chặn symlink, collision case-insensitive (`sanitizeFileName:20-23` cho `..`, `.`, `Page` vs `page`).
- [ ] `transport/socket-server.ts:15-29` + `shared/types/transport/from-plugin.ts:3-7` — Socket.IO không auth, không `maxHttpBufferSize`, `content:unknown` không giới hạn -> settle task giả + OOM. Fix: token handshake, `maxHttpBufferSize`, validate size/length (hiện chỉ `typeof`, không length ở `socket-protocol.ts:79,102,118`, `doctor.ts:150`).
- [ ] `config.ts:35` + `transport/listen.ts:55-59` + `streamable-http.ts:17-35` — đính chính sau verify: `listen.ts:49-55` có comment chủ ý "never serve LAN unless CORS_ORIGIN set", **không phải typo ngẫu nhiên**. Vấn đề thật là semantics gây hiểu nhầm: default `"*"` vừa warn vừa lock loopback, còn set origin thật lại mở LAN mà không warn rõ. `isAllowedOrigin` không check scheme/port, tin `mcp-session-id` không bind origin -> hijack localhost. `/health:41-51` expose `clients/sessions/pendingTasks` cho mọi origin. Fix: giữ intent lock-local-by-default nhưng làm rõ docs + warn khi mở LAN, check scheme/port, bind session-origin, lock `/health`.
- [ ] `tools/create/create-svg.ts:18-31` — `validateSvg` chỉ check `<!ENTITY` + `SVG_START`, lọt external DTD, `<image href=169.254>`, `<script>` -> XXE/SSRF; TOCTOU `stat:29` rồi `readFile:30`, `resolveAssetPath` lexical-only. Fix: sanitize SVG thực sự + check symlink + read atomic.
- [ ] `install-plugin.ts:175-183,263-295,397-401` — `AdmZip.extractAllTo` Zip-Slip, download không size/timeout/checksum, `versionTag` không validate (`../../../evil`), `destZip` predictable `tmp/...` symlink-attack, `writeSettings` non-atomic, backup `*.bak-Date.now()` không dọn + collision cùng ms, `getFlagValue` không bound-check (`--dir --no-register` lấy flag làm dir), `stop.ts:34` hardcode port `10101`. Fix: `mkdtemp` + atomic rename + verify hash, parser chuẩn, dùng `config.PORT`, giữ N backup gần nhất.
- [ ] `transport/socket-manager.ts:46-47,127` — truncate 200 char không sanitize control chars -> log injection (P1). `getClients:263-273` lộ `socketId` — **hạ severity xuống low** (Socket.IO id vốn public với client đó, chỉ nhạy khi lộ cho MCP client khác; ẩn đi là hygiene, không phải vuln chính). Fix: sanitize log + ẩn internal id.

Acceptance: có test traversal/symlink, SSRF alt-IP, Socket auth, CORS, Zip-Slip, SVG sanitize.

## Phase 4 — Arch + type safety + de-dup → DONE 03/10 (serializers/ToolResult-as/UI-import: verified-intentional, ghi chú thay vì churn)

- [ ] Gộp 2 serializer song song (`serialize-frame.ts:3`, `serialize-rectangle.ts:3` vs `serialization.ts:318` lean). Chuẩn 1 shape cho `create/move/resize`.
- [ ] `tool-result.ts:1` `content:unknown` -> branded type, bỏ `as` ở `batch-create.ts:43` và mọi caller.
- [ ] `dispatch.ts:75,119` — `PARAM_SCHEMAS: Record<string,ZodTypeAny>` mất link command-schema, `wrap(... {} as T)` bypass khi `args===undefined`. Fix: mapped type command->schema.
- [ ] Bỏ cast Figma không check capability: `create-instance.ts:6`, `set-layout.ts:12`, `node-helper.ts:11`, `move/resize-node.ts:7`, `set-corner-radius.ts:8, set-fill-color.ts:14, set-effects.ts:27, set-image-fill.ts:13, set-stroke-color.ts:14, add-prototype-link.ts:21,29,37`. Thêm guard type trước cast.
- [ ] `serialize-text.ts:11`, `serialization.ts:177,190` — che `mixed` bằng `unknown`, `as unknown` so sánh. Xử lý `figma.mixed` explicit (giữ runs, không `JSON.stringify` mất field).
- [ ] `serialize-instance.ts:15` thêm `try` như `serialize-component.ts:12` (variant throw dưới `documentAccess:dynamic-page` sập cả `get-node-info`).
- [ ] De-dup: `fetchRaster(url)` cho `create-image.ts:17-24` ≡ `set-image-fill.ts:19-22` (+ `create-svg.ts:50-52` biến thể); `errorResult()` x2 ở `create-svg.ts:33-35`/`set-image-fill.ts:9-11`; `pickTargetParams (target.ts:41-50)` vs `splitTarget (socket-protocol.ts:114-125)`; `resolveAssetPath` vs `resolveExportDir+assertInsideDir`; `readRawBody` x2 ở `mcp-sessions.ts:24-55`; `jsonResponse 500` x2.
- [ ] Xóa `utils.ts:1-5` `generateUUID()` wrapper thừa; sửa `registry.ts:46-60,59-60` comment/const mâu thuẫn `NODE_ONLY/NODE_WRAPPED`; `stop.ts:34` dùng `config.PORT`.
- [ ] `ui/app.tsx:4` bỏ import `../main/types`, move sang `@shared/types`. Xóa `plugin/shared` chết (chỉ `icons/logo.ts`), gộp alias 3 nơi (`esbuild`, `vite`, `vitest`) về 1 config resolve `__dirname`. Đồng bộ target `es2020` vs `es2017`.
- [ ] Gộp font logic trùng `create-text.ts:26` vs `set-text-style.ts:25` (`resolveFontStyle+loadFontAsync`).
- [ ] `tests/helpers.ts:38,108` mock `[key:string]:unknown` + `as unknown as SceneNode` che lệch `PluginAPI`. Dùng real property names.

## Phase 5 — Perf / throughput → DONE 03/10 (trừ serialize O(n²) + get-all-components pagination: đo sau trên file nặng)

- [ ] `create-image.ts:29`, `set-image-fill.ts:31`, `create-image plugin:5,14`, `debug.ts:13` — `Array.from(bytes)` ~10MB -> JSON phình to (ước ~3x, chưa đo) + log cả mảng. Fix: đo payload thực tế rồi chuyển base64 cả 2 phía, `PLUGIN_DEBUG` không log `imageData`, prod tắt debug (`main/debug.ts:6` đang hardcode `true`).
- [ ] `socket-manager.ts:184-230` broadcast (chi tiết đã nêu ở 1.1 — duplicate execute là P0 với mutating tools). Phần còn lại ở đây: thêm test single-execution N-window.
- [ ] `export-file.ts:29,136,165-173` — `EXPORT_CONCURRENCY=4` sequential batch + `depth:-1,maxNodes:5000` mỗi frame (500 frames ~125 round-trip theo tính toán lý thuyết, cần time thực tế), manifest nondeterministic (push theo completion). Fix: đo rồi chỉnh concurrency + sort manifest.
- [ ] `serialization.ts:362,418` bỏ `JSON.stringify` mỗi node để đo size; `getStyledTextSegments:190` chỉ cho text mixed cần thiết.
- [ ] `get-pages.ts:7`, `get-all-components.ts:7`, `list-fonts.ts:7` — `findAll` O(n) + load+sort mỗi call, không pagination/cache. Fix: `figma.root.children` cho pages, cache/dedup fonts, pagination components. Đo `loadAllPagesAsync` vs dispatch trên file Draft nặng trước khi đổi (V2.6 spike).
- [ ] `bridge/task-manager.ts:32,48`, `mcp-sessions.ts:94` — `Map` không bound + `TASK_TIMEOUT_MS` global. Fix: bound + per-tool timeout (export-asset ~60s, V2.2 yêu cầu), `FIMAKE_FETCH_PER_MIN` configurable (default 20, import cần ~60).
- [ ] `shared/log.ts:21-23`, `orchestrator.ts:19,42,50` — `infoLog` always-on mỗi task -> log spam. Thêm level/sample.

## Phase 6 — Build / lint / test infra → DONE 03/10 (trừ vite sourcemap/limits: verified-acceptable; vitest spec-include: cố ý loại playwright specs)

- [ ] `esbuild.config.mjs:patchManifestForPort` + `vite.config.mts:patchManifestForPort` cùng `writeFileSync+utimesSync` -> race khi `build:watch` concurrently + dirty git khi `PORT!=10101`. Fix: 1 nơi patch, không mutate source manifest.
- [ ] `vite.config.mts` — `assetsInlineLimit/chunkSizeWarningLimit=1e8` tắt cảnh báo, `sourcemap:true`, `viteSingleFile` vượt limit iframe Figma, `buildLabel()` `execSync git describe` mỗi build. Fix: hạ limit, tắt sourcemap prod, cache label.
- [ ] `taskSocket.ts:7` value-import `@shared/types` (schema) kéo zod vào UI bundle. Fix: type-import + validator nhẹ.
- [ ] `package.json:tsc:main|ui|tests` 3 project `baseUrl` khác nhau, alias trần chỉ vitest hiểu. Fix: 1 `tsconfig.base` + paths chuẩn, bỏ `skipLibCheck` che lệch typings (hoặc pin rõ).
- [ ] `eslint.config.mjs` chỉ `no-explicit-any`. Thêm `no-floating-promises`, hạn chế `as`.
- [ ] `vitest.config.ts:include tests/**/*.test.*` loại `*.spec.ts`, `test:full: tsc&&build&&vitest` không chạy `playwright`, `playwright.config.ts:channel:chrome` fail CI không Chrome. Fix: include spec, `test:full` chạy cả playwright hoặc tách `test:e2e` rõ, dùng chromium bundled cho CI.

## Phase 7 — Deps major → DONE 03/10 (trừ typescript 7: revert, blocked; adm-zip: giữ + Zip-Slip-safe extract)

- [ ] `sdk 1.22.0 (pin exact) -> 1.32.0` — check protocol drift trước.
- [ ] `zod 3.25 -> 4.6` — liên quan SDK compat, làm cùng/cạnh SDK.
- [ ] `vitest 3.2.7 -> 5.0.3`, `vite 7.3.6 -> 8.3.2`, `@vitejs/plugin-react 4.7->6.1` — làm cùng nhau.
- [ ] `typescript 5.9 -> 7.0`, `dotenv 17->18`, `mermaid 11->12`, `@types/node 20.x -> 22.x` (runtime Node 22).
- [ ] Audit thay `adm-zip ^0.6.1` (lịch sử CVE, P3 chọn vì pure-JS) -> `fflate`/`yauzl` hoặc audit lock.

## Phase 8 — LLM experience (từ feedback LLM thực tế, đã đối chiếu code 03/10/2026)

> Kết luận đối chiếu: LLM mô tả đúng ~80%. Sai 20% ở tiền đề nhóm 1 ("mù hoàn toàn") — thực tế `export-asset` đã trả PNG/JPG base64 (`mcp/src/tools/read/export-asset.ts:23`, `plugin/.../export-asset.ts:36-39` dùng `exportAsync SCALE`, `scale` max 4) nên **nhìn được nhưng phải 2 bước thủ công**, thiếu audit tự động (`grep contrast|audit` = 0 hit). Nhóm 2+3 đúng: `MAX_BATCH_OPERATIONS=50` (`batch-create.ts:14`), 1 card ~12 ops, batch chỉ cho 11 op (không có `create-image/create-svg` trong `batch-create.ts:28-40` + `docs/tools.md:17`), `$ref` Map sống trong 1 call (`batch-create.ts:21`), `no rollback` by design (`docs/tools.md:17`, `registry.ts:76`), `create-text` whole-node style. Phần "check 70/30" đúng 90%: `export-asset` description chỉ nói icons/logos (`:23`), `grep verify|review|screenshot|critique|self-review` trong `mcp/src` = 0 hit, `docs/` không có pattern batch→export→fix — nhưng fix "sửa docs/tools.md" vô tác dụng runtime vì client chỉ đọc tool description lúc `list_tools`; phải sửa description + ghi rõ inline-base64 vs `outputPath` client nào render được.

### 8.0 Cheap — guidance (làm đầu, không code tool mới, thuộc P4) → DONE 03/10
- [x] Sửa description `export-asset` thêm 1 dòng: `... PNG/JPG returns a screenshot of the frame — use this after batch-create to visually self-review before finishing.` Đây là chỗ LLM đọc lúc `list_tools` (quyết định thành/bại).
- [x] Ghi rõ trong description: inline base64 trả về dạng gì, client nào đọc được bằng mắt, khi nào phải dùng `outputPath` + đọc file ảnh. Không ghi thì export xong vẫn "không thấy" tùy client render JSON khác nhau.
- [x] Thêm workflow mẫu vào description hoặc `help.ts` (không phải `docs/tools.md` vì docs không vào context runtime): `batch-create → export-asset PNG → critique → fix`. → DONE via description (`help.ts` là CLI help, sai chỗ — loop nằm trong description export-asset/batch-create/create-text).

### 8.1 Medium — DX cho LLM (lỗi nhỏ nhưng tốn nhiều token, làm sau Phase 1-3 P4)
→ DONE 03/10 (không thêm tool mới): batch `atomic:true` + hints + `$ref` mở rộng; create-text `segments`.
- [x] Lỗi batch: giữ `{failedIndex, op, reason, created}` hiện có (`batch-create.ts:23-26`, `dispatch.ts:126` đã có `Invalid args for <cmd>: <path>`) nhưng thêm gợi ý fix (thiếu field nào, op nào thay thế). Hiện đúng nhưng chưa đủ.
- [ ] `named refs` persistent hoặc `query-node-by-name`: `$ref` hiện mất sau 1 batch, `get-node-info` bắt id regex `^\d*:\d*$`. Thêm cache name→id per-session hoặc tool query, đỡ nhầm ID `6:28`. — DEFERRED: tool mới cần fixture record với Figma Connected (e2e coverage gate).
- [ ] `validate-image {url}` pre-check độc lập: `fetch-guarded.ts:70-158` + `raster-format.ts:65-70` đã check SSRF/redirect/timeout/403/magic-bytes 70%, còn thiếu check kích thước + fallback tự động (vụ 403/watermark là ví dụ). Tách thành tool riêng để LLM gọi trước khi fill. — DEFERRED cùng lý do (tool mới).
- [x] Transaction: thêm `atomic: true` rollback cho batch (hiện `no rollback` by design). Làm sau correctness vì composite mà rollback sai còn tệ hơn.

### 8.2 Heavy — composite ops + audit (feature, làm sau P4, trước/song song V2)
→ DEFERRED 03/10 (trừ rich-text `segments` đã xong trong 8.1): `create-card/hero`, tokens, `get-design-audit` đều là tool MCP mới → e2e coverage gate (`mcp-replay.test.ts:163`) đòi fixture record với Figma Connected, không record được headless. Làm khi có Figma mở + `pnpm record:e2e`.
- [x] Rich text 1 node nhiều style (title đậm + venue xám): ~~hiện `create-text` whole-node~~ → DONE qua `segments` (setRangeFontName/Size/Fills, concat validated).
- [ ] Design tokens: `define-styles {colors,fonts,radius,shadows}` + tái dùng bằng ID thay vì lặp hex `#E8352CFF`. Tránh drift style giữa các batch.
- [ ] Rich text 1 node nhiều style (title đậm + venue xám): hiện `create-text` whole-node (`TextStyleFields` chỉ whole-node props). Thêm segments via `setRange*` + schema segments.
- [ ] `get-design-audit`: check tương phản chữ/nền, ảnh vỡ, text tràn, spacing lệch → trả list lỗi để LLM fix theo. `get-node-info` hiện chỉ trả JSON layout/màu, không chấm đẹp/xấu.
- [ ] Cho `create-image/create-svg` vào batch ops (hiện thiếu) + cân nhắc nâng cap 50 sau khi đo throughput (V2.6).

Acceptance Phase 8: cùng model vẽ lại test card/hero, số ops giảm ≥50%, có loop export→fix chạy được, audit bắt được 3 lỗi cơ bản (contrast/text-overflow/broken-image).

## Phase 9 — Sau khi hết nợ (mới tới V2)

Theo `docs/plans/plan_v2.md` ROI order: V2.0 `import-page` (parameterize `prototypes/html-*.mjs`, bỏ hardcode `sun-asterisk.us/localhost:10101`) -> V2.1 exact line-breaks -> V2.2 harness full-res + per-tool timeout -> V2.3 paint (`blend/dash/sides/rotation/ANGULAR/set-fills/opacity/mask`) -> V2.4 video fill -> V2.5 sections/auto-layout/components -> V2.6 throughput (`batch-create` + `create-svg` op) -> V2.7 breakpoints. Thêm Windows binary, `install-plugin` non-macOS, `fimake setup` (P3 §7).

---

## Checklist gate mỗi Phase

- `make check` xanh.
- Unit + contract mới cho mọi bug class §4 lessons: shared schema forward đúng, mock dùng real property names, `false` là value, tạo node trước fallible step phải cleanup, build không chạm `manifest.json` âm thầm.
