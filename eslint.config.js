// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const globals = require("globals");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "dist-*/*", "android/*", "ios/*", "test-results/*", "playwright-report/*", ".expo/*"],
  },
  {
    files: ["scripts/**/*.js", "server/**/*.js", "api/**/*.js", "*.config.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["tests/**/*.ts", "e2e/**/*.ts"],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
    // Playwright fixtures receive a `use` callback, which is not React's use().
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    rules: {
      // React Compiler readiness rule (the app doesn't use the compiler). The
      // flagged effects deliberately reset state when their inputs change
      // (subscriptions, fetches) or flag hydration, and are covered by E2E tests.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
