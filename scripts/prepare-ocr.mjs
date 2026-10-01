import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const files = {
  eng: ["440ae25b13cf07bf03b5ddf1e2cd6197f6c688c2eda2b8f04484ba4e124f89c5", "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2"],
  lit: ["ad7a309f06694fd9999d939c799166b941b094f7fab6f5c84819cd927ef315f7", "1e383df5b055583bc01cb5764ecdf74c540753f2cb3f8205e7105361da4bc989"]
};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const root = process.cwd();
const version = JSON.parse(await readFile(join(root, "node_modules/tesseract.js/package.json"), "utf8")).version;
const coreVersion = JSON.parse(await readFile(join(root, "node_modules/tesseract.js-core/package.json"), "utf8")).version;
if (version !== "7.0.0" || coreVersion !== "7.0.0") throw new Error("Unexpected OCR package version");
const target = join(root, "public/ocr");
await mkdir(join(target, "core"), { recursive: true });
await copyFile(join(root, "node_modules/tesseract.js/dist/tesseract.min.js"), join(target, "tesseract.min.js"));
await copyFile(join(root, "node_modules/tesseract.js/dist/worker.min.js"), join(target, "worker.min.js"));
for (const file of await readdir(join(root, "node_modules/tesseract.js-core"))) {
  if (/^tesseract-core.*\.(?:js|wasm)$/.test(file)) await copyFile(join(root, "node_modules/tesseract.js-core", file), join(target, "core", file));
}
for (const [language, [compressedHash, rawHash]] of Object.entries(files)) {
  const file = `${language}.traineddata.gz`;
  const data = await readFile(join(root, "assets/ocr", file));
  if (digest(data) !== compressedHash || digest(gunzipSync(data)) !== rawHash) throw new Error(`Invalid OCR language asset: ${file}`);
  await copyFile(join(root, "assets/ocr", file), join(target, file));
}
console.log("Prepared same-origin OCR assets (Tesseract.js 7.0.0, eng/lit).");
