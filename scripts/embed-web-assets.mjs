import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const sourceDirectory = join(process.cwd(), "dist", "web");
const outputFile = join(process.cwd(), "server", "generated-web-assets.ts");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
};

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const filePath = join(directory, name);
    return statSync(filePath).isDirectory() ? walk(filePath) : [filePath];
  });
}

function contentType(filePath) {
  const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return mimeTypes[extension] ?? "application/octet-stream";
}

const assets = Object.fromEntries(
  walk(sourceDirectory).map((filePath) => [
    `/${relative(sourceDirectory, filePath).split(sep).join("/")}`,
    {
      contentType: contentType(filePath),
      body: readFileSync(filePath).toString("base64"),
    },
  ]),
);

writeFileSync(
  outputFile,
  `export type EmbeddedWebAsset = { contentType: string; body: string };\nexport const embeddedWebAssets: Record<string, EmbeddedWebAsset> = ${JSON.stringify(assets)};\n`,
);
