import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/test-results/**", "**/playwright-report/**", "samples/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Numbers and strings are checked by the types; a leading underscore marks an argument that is deliberately unused.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // The hooks rules that catch real bugs. The React Compiler's stricter rules are off: this app does not use the compiler.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  // Tests read JSON responses and fixtures whose shape the test itself asserts.
  { files: ["**/test/**/*.ts", "e2e/**/*.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
  { files: ["services/**/*.ts", "packages/**/*.ts", "e2e/**/*.ts", "*.config.{js,ts}"], languageOptions: { globals: globals.node } },
);
