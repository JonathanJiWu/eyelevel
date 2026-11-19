// Vercel serverless entry: serves the statically rendered pages and the
// /api/* routes from the Expo export (static assets come from dist/client
// via Vercel's CDN). See DEPLOYMENT.md.
const path = require("path");
const { createRequestHandler } = require("@expo/server/adapter/vercel");

module.exports = createRequestHandler({
  build: path.join(__dirname, "../dist/server"),
});
