import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const newTree = [
  "src/shared/**/*.{ts,tsx}",
  "src/ui/**/*.{ts,tsx}",
  "src/app/**/*.{ts,tsx}",
  "src/features/**/*.{ts,tsx}",
  "src/core/**/*.{ts,tsx}",
  "tests/unit/**/*.ts",
];

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
    files: newTree,
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
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
    },
  },
);
