const fs = require("fs");
const path = require("path");

const distDir = path.resolve(__dirname, "..", "dist");
const assetsDir = path.join(distDir, "assets");
const assets = fs.readdirSync(assetsDir);

const css = assets.find((name) => /^index-.*\.css$/.test(name));
const polyfills = assets.find((name) => /^polyfills-legacy-.*\.js$/.test(name));
const legacy = assets.find((name) => /^index-legacy-.*\.js$/.test(name));

if (!css || !polyfills || !legacy) {
  throw new Error("Legacy Android assets were not found in dist/assets.");
}

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <link rel="icon" href="data:," />
    <title>Atlas NAS Monitor</title>
    <link rel="stylesheet" crossorigin href="/assets/${css}">
  </head>
  <body>
    <div id="root"></div>
    <script crossorigin src="/assets/${polyfills}"></script>
    <script>System.import("/assets/${legacy}");</script>
  </body>
</html>
`;

fs.writeFileSync(path.join(distDir, "index.html"), html);
