import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const restricted = {
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          group: [
            "**/admin",
            "**/admin/**",
            "@/admin",
            "@/admin/**",
            "../admin/**",
            "**/brain",
            "**/brain/**",
            "@/brain",
            "@/brain/**",
            "../brain/**",
          ],
          message: "src/features وsrc/core وsrc/shared وsrc/ui لا تستورد admin أو brain.",
        },
      ],
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "deliverables/**",
      "licenses/**",
      "node_modules/**",
      "tests/.generated/**",
      "src/assets/ocr/**",
    ],
  },
  {
    files: [
      "src/shared/**/*.{ts,tsx}",
      "src/ui/**/*.{ts,tsx}",
      "src/app/**/*.{ts,tsx}",
      "tests/unit/knowledge-schema.test.ts",
    ],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...restricted,
    },
  },
  {
    // Moved engines keep their original style. Do not "fix" them to satisfy new lint.
    files: [
      "src/core/solver/**/*.{ts,tsx}",
      "src/core/engines/**/*.{ts,tsx}",
      "src/features/scientific/**/*.{ts,tsx}",
    ],
    extends: [...tseslint.configs.recommended, prettier],
    rules: {
      ...restricted,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "prefer-const": "off",
      "no-useless-escape": "off",
      "no-empty": "off",
    },
  },
);
