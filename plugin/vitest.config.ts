import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      utils: path.resolve(import.meta.dirname, "main/utils"),
      tools: path.resolve(import.meta.dirname, "main/tools"),
      serialization: path.resolve(import.meta.dirname, "main/serialization"),
      "@shared": path.resolve(import.meta.dirname, "../mcp/src/shared"),
    },
  },
  define: {
    __FIMAKE_BUILD__: JSON.stringify("v0.0.0-test"),
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
