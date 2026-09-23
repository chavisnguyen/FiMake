import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      utils: path.resolve(__dirname, "main/utils"),
      tools: path.resolve(__dirname, "main/tools"),
      serialization: path.resolve(__dirname, "main/serialization"),
      "@shared": path.resolve(__dirname, "../mcp/src/shared"),
    },
  },
  define: {
    __FIMAKE_BUILD__: JSON.stringify("v0.0.0-test"),
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
