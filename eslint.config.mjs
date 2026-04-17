import js from "@eslint/js"
import react from "eslint-plugin-react"
import globals from "globals"
import tseslint from "typescript-eslint"

const browserAndNodeGlobals = {
  ...globals.browser,
  ...globals.node,
}

const vitestGlobals = {
  describe: "readonly",
  expect: "readonly",
  it: "readonly",
  vi: "readonly",
}

export default [
  {
    ignores: ["out/", "dist/", "node_modules/"],
  },
  {
    files: ["**/*.{js,jsx,mjs}"],
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: browserAndNodeGlobals,
    },
    plugins: {
      react,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "react/jsx-uses-vars": "error",
    },
  },
  ...tseslint.config({
    files: ["**/*.{ts,tsx}"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        projectService: false,
      },
      globals: browserAndNodeGlobals,
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  }),
  {
    files: ["**/*.test.js"],
    languageOptions: {
      globals: {
        ...browserAndNodeGlobals,
        ...vitestGlobals,
      },
    },
  },
]
