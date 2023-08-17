module.exports = {
  env: {
    // 支持浏览器环境
    browser: true,
    // 识别 CommonJS
    node: true,
    es2021: true,
  },
  // parser: "@typescript-eslint/parser",
  // parserOptions: {
  //   project: ["./tsconfig.json"],
  // },
  // plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:prettier/recommended"],
  rules: {},
  overrides: [
    {
      files: ["**/*.{ts,tsx}"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: ["./tsconfig.json"],
      },
      excludedFiles: [".eslintrc.js"],
      extends: [
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
      ],
      plugins: ["@typescript-eslint"],
      rules: {
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-unsafe-assignment": "warn",
        "@typescript-eslint/no-unsafe-member-access": "warn",
        "@typescript-eslint/no-unsafe-argument": "warn",
      },
    },
    {
      files: ["**/*.{js,jsx}"],
      extends: ["eslint:recommended", "plugin:prettier/recommended"],
    },
  ],
};
