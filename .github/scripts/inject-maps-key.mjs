import { readFile, writeFile } from "node:fs/promises";

const [targetFile] = process.argv.slice(2);
if (!targetFile) throw new Error("Pass the staged maps-config.js path.");
const key = (process.env.MAPS_EMBED_API_KEY || "").trim();
const placeholder = "__MAPS_EMBED_API_KEY__";
const source = await readFile(targetFile, "utf8");
if (source.split(placeholder).length !== 2) throw new Error("Expected one Maps Embed key placeholder.");
if (!key) {
  console.log("Maps Embed key is not configured; map previews will offer an external Maps link.");
} else {
  if (!/^[A-Za-z0-9_-]+$/.test(key)) throw new Error("Maps Embed key contains invalid characters.");
  await writeFile(targetFile, source.replace(JSON.stringify(placeholder), JSON.stringify(key)), "utf8");
  console.log("Maps Embed key configured in the staged deployment file.");
}
