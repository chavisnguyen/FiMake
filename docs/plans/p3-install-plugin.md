# P3 Plan: `fimake install-plugin` — cài Figma dev plugin không sideload tay

Scope đã chốt với user:
- **Chỉ macOS** cho P3 (Figma Desktop không có bản Linux native; project cũng
  chưa có binary Windows trong `release.yml`). Windows/Linux registration là
  out-of-scope, xem §7.
- Thay flow hiện tại (download zip → unzip tay → Import plugin from manifest trong Figma)
  bằng 1 lệnh: `fimake install-plugin`.
- Nguyên lý: Figma Desktop không copy file plugin, chỉ lưu pointer `manifestPath`
  tuyệt đối trong `settings.json > localFileExtensions`. Lệnh này tái hiện đúng
  thao tác "Import from manifest" bằng code.
- Giữ invariant: plugin zip + binary cùng version (vd đều `v1.0.x`), cùng default
  port `10101` hai phía.
- Nếu Figma đang chạy: **hỏi xác nhận rồi tự quit giúp user** (graceful quit qua
  `osascript`, không force-kill), thay vì chặn cứng bắt user tự quit tay — xem §3.

## 1. Bối cảnh / phát hiện đã verify

- `plugin/manifest.json:1-11`: `id: 1572223324912824909`, `main: dist/main.js`,
  `ui: dist/index.html` → 1 plugin = 3 file vật lý.
- Máy user thật (`~/Library/Application Support/Figma/settings.json`) đang lưu:
  ```json
  "localFileExtensions": [
    { "id": 1, "manifestPath": ".../plugin/manifest.json",
      "lastKnownName": "FiMake", "lastKnownPluginId": "1572223324912824909",
      "fileMetadata": { "type": "manifest", "codeFileId": 2, "uiFileIds": [3] } },
    { "id": 2, "manifestPath": ".../plugin/dist/main.js",
      "fileMetadata": { "type": "code", "manifestFileId": 1 } },
    { "id": 3, "manifestPath": ".../plugin/dist/index.html",
      "fileMetadata": { "type": "ui", "manifestFileId": 1 } }
  ]
  ```
- Vì sao 3 record (§ đã giải thích cho user): Figma flatten path tương đối
  (`main`/`ui`) thành absolute path để file-watcher/sandbox load + reload khi
  rebuild. Linkage qua `codeFileId` / `uiFileIds` / `manifestFileId`. Plugin
  không UI thì chỉ 2 record — FiMake có UI nên luôn 3.
- `mcp/src/index.ts:10-23`: CLI hiện chỉ có `--version` và `doctor`, parse bằng
  `args.includes`. Thêm subcommand mới đi theo pattern này (không thêm framework CLI).
- `release.yml:48-67,124-146`: mỗi release đã publish đủ 3 binaries + `fimake-plugin.zip`.
  Binary `caxa` (`release.yml:94-107`) chỉ bundle `mcp/` — KHÔNG chứa file plugin.
  Nên `install-plugin` phải download zip từ Releases theo đúng version của binary.

## 2. Contract CLI

```
fimake install-plugin [--dir <path>] [--no-register] [--version-tag <vX.Y.Z>]
```

- Mặc định:
  1. Lấy version từ `SERVER_VERSION` (single-source `mcp/package.json`, như `--version`).
  2. Download `https://github.com/chavisnguyen/FiMake/releases/download/v<V>/fimake-plugin.zip`
     (cho phép `--version-tag` override để test / downgrade).
  3. Unzip vào `<dir>` mặc định `~/.fimake/plugin/<V>/` (ổn định, user không xóa
     nhầm như `~/Downloads`). `--dir` override cho contributor muốn trỏ vào
     `FiMake/plugin` build local.
  4. Verify giải nén ra `manifest.json` + `dist/main.js` + `dist/index.html`,
     và `manifest.id === 1572223324912824909` (fail sớm nếu lộn zip).
  5. Đăng ký vào Figma `settings.json` (trừ khi `--no-register`):
     nếu Figma đang chạy, hỏi xác nhận rồi tự quit giúp (§3 bước 2), sau đó
     patch `localFileExtensions` như §3. Xong in: "Reopen Figma > Plugins > Development > Fimake".
- `--no-register` (Nấc 1 fallback): chỉ download + unzip + `open` folder, user tự
  Import 2 click. Không đụng `settings.json`, không đụng tiến trình Figma. Dùng
  khi user không muốn CLI tự quit app của họ, hoặc format settings đổi trong tương lai.
- `--yes` / `-y`: bỏ qua prompt xác nhận quit Figma (non-interactive, cho script/CI
  smoke test) — vẫn graceful quit qua `osascript`, không đổi cơ chế, chỉ bỏ câu hỏi.
- Exit code: 0 = xong (đã register hoặc `--no-register` xong), 1 = lỗi hoặc user
  từ chối quit Figma khi được hỏi (message actionable, kèm `fimake doctor` hint).
  In ra path manifest cuối cùng trong mọi case.

`fimake doctor` mở rộng (cùng commit hoặc commit kế tiếp):
- Thêm check `plugin`: đọc `settings.json`, tìm `lastKnownPluginId === <manifest id>`,
  verify 3 `manifestPath` tồn tại trên disk. Thiếu → `[!!] plugin: not registered — run fimake install-plugin`.
  Không làm doctor fail vì port (giữ `ok` semantics hiện tại: chỉ port free mới ok).

## 3. Logic patch `settings.json` (Nấc 2, full-auto)

Path (macOS only cho P3): `~/Library/Application Support/Figma/settings.json`.
`findSettingsPath()` vẫn nhận `process.platform` làm tham số (không hardcode
`darwin` trong logic patch) để thêm `win32`/`linux` sau này chỉ là thêm 1
nhánh, nhưng P3 chỉ implement + test nhánh `darwin`; nhánh khác throw
"unsupported platform, use --no-register" thay vì đoán path sai.

Steps (mới `mcp/src/install-plugin.ts`, pure functions để unit test):
1. `findSettingsPath(platform)`: `darwin` → path trên; khác → throw (xem trên).
2. `quit Figma guard` (best-effort, chỉ macOS):
   - Detect Figma đang chạy: `pgrep -x Figma` (không shell-out chuỗi user input).
   - Không chạy → bỏ qua bước này, sang bước 3 luôn.
   - Đang chạy + không có `--yes` → prompt trên stdin: `"Figma is running and
     will overwrite settings.json on quit. Quit it now to continue? [y/N]"`.
     - Không phải TTY (stdin không interactive, vd chạy trong script không
       `--yes`) → không đoán, exit 1 với message nhắc dùng `--yes` hoặc
       `--no-register`.
     - User từ chối (`N`/Enter) → exit 1, KHÔNG patch, KHÔNG quit Figma.
   - User đồng ý (hoặc có `--yes`) → `osascript -e 'quit app "Figma"'` (graceful
     quit — nếu Figma có state riêng cần xác nhận, Figma tự hiện dialog của nó,
     không phải mình xử lý mất dữ liệu).
   - Poll tối đa ~10s (`pgrep -x Figma` mỗi 500ms) chờ tiến trình biến mất.
     Timeout (user bấm Cancel ở dialog của Figma, hoặc quit treo) → exit 1 với
     message: `"Figma did not quit — finish any pending dialog in Figma, then
     re-run this command."`. KHÔNG patch khi chưa chắc Figma đã thoát hẳn.
3. Đọc + `JSON.parse` settings. Backup `settings.json.bak-<ts>` trước khi ghi.
4. `localFileExtensions ??= []`. Tìm record `type: manifest` có
   `lastKnownPluginId === manifest.id`:
   - Có → update 3 `manifestPath` sang dir mới (giữ nguyên `id`), update `lastKnownName`.
   - Chưa → `maxId = max(...ids, 0)`, append 3 record mới `maxId+1/+2/+3` đúng shape §1
     (`codeFileId`/`uiFileIds`/`manifestFileId` linkage).
5. Ghi JSON giữ nguyên các key khác (không reformat toàn file ngoài `JSON.stringify(..., 2)` —
   chấp nhận diff whitespace, vì Figma tự normalize khi mở lại).
6. Verify sau ghi: parse lại + check 3 paths tồn tại.

Edge cases:
- settings.json không tồn tại (chưa từng mở Figma Desktop) → báo user mở Figma 1 lần trước.
- `localFileExtensions` chứa entry FiMake cũ trỏ vào `figma-mcp/` (như máy user hiện tại)
  → update-in-place, không duplicate.
- Figma đổi format (không có `localFileExtensions`) → fallback Nấc 1 + warning, không crash.

## 4. Thay đổi từng file (thứ tự implement)

0. **Deps giải nén**: Node 22 không có unzip built-in. Chọn `adm-zip` (pure JS, ~0 dep,
   đã đủ cho zip store/deflate của `make package-plugin`) thay vì gọi binary `unzip`
   hệ thống (không có sẵn trên mọi máy). Thêm vào `mcp/package.json:dependencies`.
   Alternative đã loại: `yauzl` (callback API cũ), `unzip` CLI (không portable).
1. **Mới** `mcp/src/install-plugin.ts`:
   - `PLUGIN_MANIFEST_ID = "1572223324912824909"` (mirror `plugin/manifest.json:3`,
     có assertion trong test để 2 bên không lệch).
   - `getSettingsPath(platform, env): string` (`darwin` only cho P3, throw khác).
   - `buildRecords(nextIds, paths): [manifest, code, ui]` (pure).
   - `patchSettings(settings, manifestDir): { settings, action: "insert"|"update" }` (pure).
   - `isFigmaRunning(exec)`: wrap `pgrep -x Figma`, trả `boolean` (mock `exec` trong test).
   - `quitFigma(exec)`: `osascript -e 'quit app "Figma"'` rồi poll `isFigmaRunning`
     tối đa 10s; trả `"quit" | "timeout"`.
   - `confirmQuit(readline)`: prompt y/N trên stdin, trả `boolean`; skip khi `--yes`
     hoặc `!process.stdin.isTTY` (non-TTY → treat như "no", không đoán).
   - `downloadPluginZip(version, destZip)`: `fetch` release URL → check status + size > 0.
   - `installPlugin(opts)`: orchestrate download → unzip (`adm-zip`) → verify → patch (trừ `--no-register`).
   - Message lỗi tiếng Anh, actionable, mỗi lỗi gợi ý 1 command (`fimake doctor`, `open <dir>`).
2. `mcp/src/index.ts`: thêm nhánh `args.includes("install-plugin")` (sau nhánh `doctor`),
   parse `--dir`/`--no-register`/`--version-tag`/`--yes` thủ công (giữ style hiện tại,
   không thêm yargs).
3. `mcp/src/doctor.ts`: thêm check `plugin` như §2 (đọc settings best-effort, never throw —
   lỗi đọc → check `ok: true` với detail "skip: ...").
4. Tests:
   - `mcp/tests/contract/install-plugin.test.ts` (mới): `buildRecords` linkage đúng;
     `patchSettings` insert khi trống, update khi đã có (không duplicate, giữ id);
     `maxId` rỗng → 1/2/3; manifest id mismatch → throw; `--no-register` không đụng settings
     (mock fs); `confirmQuit` skip prompt khi `--yes`/non-TTY; `quitFigma` trả `"timeout"`
     khi `isFigmaRunning` mock luôn `true` (mock `exec`, không gọi `osascript` thật trong test).
   - `mcp/tests/contract/mcp-tools.test.ts`: KHÔNG đổi count (không thêm tool MCP mới).
5. Docs (cùng PR, sau khi code xanh) — đây là phần đổi nhiều nhất vì "Step 1"
   hiện đang lặp y hệt ở 2 file (4 bước tay: download zip → unzip → Import from
   manifest → run + keep window open). Mục tiêu: rút còn 1 lệnh cho user thường,
   giữ 4-bước-tay làm fallback có link rõ ràng chứ không xoá mất.
   - `docs/quickstart.md:7-16` (mục "1. Install the Figma plugin"): thay toàn bộ
     4 bước bằng:
     ```
     fimake install-plugin
     ```
     + 1 dòng: "If Figma is running, this asks to quit it for you (needed once —
     Figma only writes its plugin registry on quit)." + giữ nguyên 2 bước còn lại
     KHÔNG tự động hoá được: mở lại Figma, *Plugins > Development > Fimake* > Run
     (expected **Not connected** cho tới khi server chạy — step 2 không đổi).
     Giữ nguyên note "Compatibility: cùng release version" (không đổi, vẫn đúng).
   - `README.md:17-24` (mục "1. Install the Figma plugin"): y hệt thay đổi trên,
     đồng bộ 2 file (đã lặp nội dung sẵn, không phải thêm chỗ lặp mới).
   - `docs/troubleshooting.md`: thêm section mới **"Install the plugin manually
     (if `install-plugin` doesn't work for you)"** — chép nguyên 4 bước tay đang
     có ở quickstart/README trước khi bị thay, + khi nào cần: `install-plugin`
     lỗi (offline, EACCES, format `settings.json` đổi), hoặc dùng
     `fimake install-plugin --no-register` rồi tự Import 2 click.
   - `docs/usage.md`: thêm section CLI reference ngắn cho `install-plugin`:
     bảng flags `--dir/--no-register/--version-tag/--yes` + 1 dòng path
     `settings.json` (macOS only, không cần bảng nhiều OS).
   - `docs/tools.md`, `docs/architecture.md`, `docs/development.md`: không đổi
     (không liên quan tool/kiến trúc/contributor flow).
6. KHÔNG đổi: `plugin/manifest.json` (giữ `id` ổn định — đổi id là mọi user phải re-import),
   `release.yml` (chưa embed zip vào binary ở P3; download runtime là đủ),
   version bump (chỉ khi user yêu cầu release).

## 5. Gate + manual checklist

- Gate: `make check` (typecheck + lint + test + build). Thêm `adm-zip` vào `mcp/package.json`
  nên phải `pnpm install` lại + verify `release.yml` binary smoke test (`--version`) vẫn qua
  (caxa bundle thêm dep mới).
- Manual E2E (cần Figma Desktop, người làm):
  1. `fimake install-plugin` với Figma đang mở, trả lời `N` ở prompt → exit 1,
     Figma vẫn chạy, settings không đổi.
  2. Với Figma đang mở, trả lời `y` → Figma tự quit (graceful), lệnh patch
     xong, exit 0, `settings.json.bak-*` tồn tại, 3 records đúng dir mới.
  3. Với Figma đang mở có 1 file có thay đổi chưa sync xong (nếu tái hiện được) →
     xác nhận Figma tự hiện dialog của nó chứ không mất việc âm thầm.
  4. Mở Figma → Plugins > Development > Fimake hiện ra, chạy → `Not connected` (đúng).
  5. Chạy MCP server (stdio) → plugin flips `Connected`, `get-pages` round-trip ok.
  6. Chạy lại lần 2 (Figma đang mở, dùng `--yes`) → update-in-place, không
     duplicate records, không bị hỏi lại.
  7. `fimake install-plugin --no-register` với Figma đang mở → không hỏi gì,
     không đụng Figma/settings, chỉ unzip + in path.
  8. `fimake doctor` hiện check plugin (registered + files exist).

## 6. Rủi ro đã tính

- **Figma ghi đè settings khi thoát** → không patch cho tới khi `quitFigma` xác
  nhận process đã biến mất (poll, không phải "đã gọi osascript là coi như xong").
  Timeout → exit 1, không patch mù.
- **Tự quit làm mất việc của user** → graceful `osascript quit` (không `kill -9`):
  Figma tự lo dialog "unsaved changes" của chính nó nếu có. Luôn hỏi xác nhận
  trước (trừ `--yes` — user tự chọn bỏ qua an toàn này khi cần script hoá).
- **Detect sai tên process** (Figma đổi tên binary/helper process ở bản sau) →
  `isFigmaRunning` false negative nghĩa là bỏ qua bước 2, đi thẳng patch —
  quay lại đúng rủi ro "ghi đè khi thoát" ở trên nếu Figma thật ra đang chạy
  dưới tên khác. Chấp nhận cho P3 (best-effort), note lại nếu gặp trong thực tế.
- **Format internal đổi** → code defensively (`??= []`, validate shape trước khi patch),
  fallback Nấc 1 luôn khả dụng. Test assertion `PLUGIN_MANIFEST_ID` bắt lệch id sớm.
- **Download fail / offline** → message rõ + fallback: trỏ `--dir` vào bản unzip tay cũ.
  Không cache zip cũ quá 1 version để tránh lệch invariant cùng-version.
- **Quyền ghi `~/Library/Application Support/Figma/`** → nếu EACCES, báo chạy lại với quyền
  user sở hữu (không sudo bừa).
- **`settings.json.bak-*` tích tụ theo thời gian** (mỗi lần chạy install-plugin
  đều tạo backup mới) → chấp nhận cho P3, không tự xoá backup cũ (an toàn hơn
  là gọn), có thể thêm giới hạn giữ N bản gần nhất ở version sau nếu gây khó chịu.

## 7. Out of scope P3

- Windows/Linux cho bước register (§3) — Figma Desktop không native trên Linux,
  và project chưa có binary Windows trong `release.yml`. `--no-register`
  (download + unzip only) không phụ thuộc OS nên không bị chặn.
- Tự mở Figma lại sau khi patch xong, tự mở file Figma test.
- Embed plugin zip vào binary caxa (làm sau nếu muốn offline install).
- `fimake setup` gộp doctor + install-plugin + config MCP client (đề xuất P4).
- Publish Community listing (bị chặn bởi `localhost:10101` policy — giữ dev plugin model).
