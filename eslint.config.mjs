import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  ...tseslint.configs.recommended,
  {
    rules: {
      // TypeScript strict mode handles this better than ESLint
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Allow explicit any with inline disable comments (existing codebase pattern)
      "@typescript-eslint/no-explicit-any": "warn",
      // These are noisy in a Next.js codebase
      "@typescript-eslint/no-require-imports": "off",
      // Downgrade to warn — existing code uses let in some places
      "prefer-const": "warn",
    },
  },
];

export default eslintConfig;
