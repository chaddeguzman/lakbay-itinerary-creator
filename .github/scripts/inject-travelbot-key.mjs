import { readFile, writeFile } from "node:fs/promises";

const [targetFile] = process.argv.slice(2);
const apiKey = process.env.TRAVELBOT_API;
const placeholder = "__TRAVELBOT_API__";

if (!targetFile) {
  throw new Error("Pass the staged gemini_travel_api.js path to this script.");
}

if (!apiKey) {
  throw new Error(
    "TRAVELBOT_API is missing. Add it under the repository Actions secrets.",
  );
}

const source = await readFile(targetFile, "utf8");
const occurrences = source.split(placeholder).length - 1;

if (occurrences !== 1) {
  throw new Error(
    `Expected one TravelBot API placeholder in ${targetFile}, found ${occurrences}.`,
  );
}

await writeFile(targetFile, source.replace(placeholder, apiKey), "utf8");
console.log("TravelBot API key injected into the staged deployment file.");
