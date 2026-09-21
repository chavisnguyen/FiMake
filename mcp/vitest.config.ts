import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "./package.json" with { type: "json" };

const HERE = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  define: {
    __PACKAGE_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    // Mirrors tsconfig paths: `@shared/*` is the single source in src/shared.
    // (Previously only `import type` from @shared was used in tests, which
    // vite erases without resolving — value imports like the e2e mock's
    // socket-protocol need this real alias.)
    alias: {
      "@shared": path.resolve(HERE, "src/shared"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
