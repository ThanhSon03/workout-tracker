/* Build bản production: minify src/ -> static/.
   Chạy: npm install && npm run build */
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..");
const targets = [
  { from: "src/app.js", to: "static/app.js", loader: "js" },
  { from: "src/i18n.js", to: "static/i18n.js", loader: "js" },
  { from: "src/styles.css", to: "static/styles.css", loader: "css" },
];

(async () => {
  for (const item of targets) {
    const source = fs.readFileSync(path.join(root, item.from), "utf8");
    const result = await esbuild.transform(source, {
      loader: item.loader,
      minify: true,
      legalComments: "none",
      charset: "utf8",
      target: ["es2020"],
    });
    const outPath = path.join(root, item.to);
    fs.writeFileSync(outPath, result.code);
    const before = Buffer.byteLength(source);
    const after = Buffer.byteLength(result.code);
    console.log(
      `${item.from} -> ${item.to}  ${(before / 1024).toFixed(1)} KB -> ${(
        after / 1024
      ).toFixed(1)} KB (-${Math.round((1 - after / before) * 100)}%)`
    );
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
