/**
 * Jest projects:
 *  - unit:  pure logic + API proxy tests (no external services)
 *  - rules: Firestore security rules tests (need the Firestore emulator;
 *           run via `npm run test:rules`)
 */
const shared = {
  preset: "jest-expo/node",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  testEnvironment: "node",
  // jest-expo's platform presets (jest-expo/node) replace the base preset's
  // babel-jest options and drop its `configFile` fallback, so without a
  // babel.config.js no Babel preset is applied and TypeScript fails to parse.
  // Use babel-preset-expo (Metro's default) with the same caller options.
  transform: {
    "\\.[jt]sx?$": [
      "babel-jest",
      { caller: { name: "metro", bundler: "metro", platform: "web", isServer: true }, presets: ["babel-preset-expo"] },
    ],
  },
};

module.exports = {
  projects: [
    { ...shared, displayName: "unit", testMatch: ["<rootDir>/tests/unit/**/*.test.ts"] },
    { ...shared, displayName: "rules", testMatch: ["<rootDir>/tests/rules/**/*.test.ts"] },
  ],
};
