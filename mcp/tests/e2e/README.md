# E2E record-replay (MCP thật + Mock Figma Plugin)

Mock API nhưng data THẬT, để E2E chạy ở CI mà không cần mở Figma Desktop.

## Flow

```
vitest --spawn--> node dist/index.js (MCP thật, TRANSPORT=streamable-http)
   --socket.io--> MockFigmaPlugin (tests/e2e/mock-figma-plugin.ts)
vitest --POST /mcp (tools/call)--> server --> assert khớp fixtures/*.json
```

## Chạy

```bash
# 1. build 1 lần (test spawn dist/index.js)
make build
# 2. chạy E2E replay
cd mcp && pnpm test:e2e
# hoặc full suite (unit + contract + e2e)
cd mcp && pnpm test
```

## Record lại data thật

Khi Figma Desktop đang mở + plugin Connected:

```bash
# terminal 1: server nối với plugin THẬT
cd mcp && TRANSPORT=streamable-http PORT=10101 pnpm start
# terminal 2: dump response thật vào fixtures/
cd mcp && RECORD_PORT=10101 RECORD_NODE_ID=1:1 pnpm record:e2e
git diff mcp/tests/e2e/fixtures  # review thay đổi data thật sau khi sửa code
```

## Khi đổi code

- Thêm tool mới mà chưa có fixture -> E2E báo `No fixture for command "x"`
  thay vì timeout flaky. Chạy `pnpm record:e2e` để bổ sung.
- Đổi schema/shape response -> assert trong `mcp-replay.test.ts` fail ngay.
- Write-tools (`move-node`, `create-*`) được mock echo `x/y/width/height`
  từ request vào template, nên vẫn assert được round-trip qua socket.
