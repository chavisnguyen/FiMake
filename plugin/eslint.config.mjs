// Minimal guardrail: forbid the `any` type so the typed-test/source
// cleanup cannot regress. Run with `npm run lint`, enforced in CI.
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "build/**"],
  },
  {
    files: ["main/**/*.ts", "ui/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
