// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Firebase ships CommonJS builds with the .cjs extension (already a default
// in recent Expo SDKs; kept for safety).
if (!config.resolver.sourceExts.includes("cjs")) {
  config.resolver.sourceExts.push("cjs");
}

// Keep generated output (web builds, native projects) and test tooling at the project root out of Metro's
// file map. Paths are anchored to this directory so folders with the same
// name inside node_modules (e.g. package `dist/` builds) are unaffected.
const escape = (value) => value.replace(/[/\\^$.*+?()[\]{}|-]/g, "\\$&");
const projectOnly = ["dist", "dist-e2e", "android", "ios", "e2e", "tests", "test-results", "playwright-report", ".firebase"].map(
  (dir) => new RegExp(`^${escape(path.join(__dirname, dir))}\\/.*$`),
);
const defaults = config.resolver.blockList
  ? Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  : [];
config.resolver.blockList = [...defaults, ...projectOnly];

module.exports = config;
