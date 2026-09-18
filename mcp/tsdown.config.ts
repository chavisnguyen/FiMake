import { defineConfig } from "tsdown";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm"],
  outExtensions: () => ({ js: ".js" }),
  sourcemap: true,
  alias: {
    "@shared": "./src/shared",
  },
  define: {
    __PACKAGE_VERSION__: JSON.stringify(pkg.version),
  },
});
