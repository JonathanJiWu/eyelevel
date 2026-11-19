// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: "expo",
  ignorePatterns: ["/dist/*", "/dist-*/*", "/android/*", "/ios/*", "/test-results/*", "/.expo/*"],
  overrides: [
    {
      files: ["scripts/**/*.js", "server/**/*.js", "api/**/*.js", "*.config.js", ".eslintrc.js"],
      env: { node: true },
    },
    {
      files: ["tests/**/*.ts", "e2e/**/*.ts"],
      env: { jest: true, node: true },
    },
  ],
};
