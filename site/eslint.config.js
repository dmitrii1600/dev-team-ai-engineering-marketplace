import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// Props whose value a visitor reads or hears: they must come from src/i18n/en.json through t().
const USER_VISIBLE_ATTRIBUTES =
  "/^(aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext|placeholder|title|alt|label)$/";

// Symbol-only strings that are not translatable copy: separators, icon glyphs, the "$" prompt.
const ALLOWED_STRINGS = ["·", "/", "$", "#", "×", "◆", "⌕", "☾", "☀", "☰", "✓", "⌘K", "…", "←", "→", "↗", "📦", "🔍"];

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "public/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["vite.config.ts", "vite/**/*.ts", "vitest.setup.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/ui/**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...reactHooks.configs.flat.recommended.rules,
    },
  },
  {
    // Every user-visible string comes from src/i18n/en.json (see src/i18n/index.ts).
    files: ["src/**/*.tsx"],
    rules: {
      // Text and string expressions in JSX children. Attribute values are covered by the selector rule below.
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true, allowedStrings: ALLOWED_STRINGS }],
      "no-restricted-syntax": [
        "error",
        {
          selector: `JSXAttribute[name.name=${USER_VISIBLE_ATTRIBUTES}] > Literal`,
          message: "User-visible attribute: use t() with a key from src/i18n/en.json.",
        },
        {
          selector: `JSXAttribute[name.name=${USER_VISIBLE_ATTRIBUTES}] > JSXExpressionContainer > :matches(Literal, TemplateLiteral)`,
          message: "User-visible attribute: use t() with a key from src/i18n/en.json.",
        },
      ],
    },
  },
  {
    files: ["tests/ui/**/*.{ts,tsx}"],
    rules: { "react/jsx-no-literals": "off", "no-restricted-syntax": "off" },
  },
);
