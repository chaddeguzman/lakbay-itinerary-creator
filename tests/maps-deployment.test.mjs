import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("Maps deployment config is optional and injects only into a staged copy", async () => {
  const script = new URL("../.github/scripts/inject-maps-key.mjs", import.meta.url);
  const source = readFileSync(new URL("../scripts/maps-config.js", import.meta.url), "utf8");
  const folder = await mkdtemp(join(tmpdir(), "lakbay-maps-test-")), target = join(folder,"maps-config.js");
  try {
    await writeFile(target,source);
    assert.doesNotThrow(()=>execFileSync(process.execPath,[fileURLToPath(script),target],{env:{...process.env,MAPS_EMBED_API_KEY:""}}));
    assert.equal(await readFile(target,"utf8"),source);
    execFileSync(process.execPath,[fileURLToPath(script),target],{env:{...process.env,MAPS_EMBED_API_KEY:"unit-test-maps-key"}});
    assert.ok((await readFile(target,"utf8")).includes('"unit-test-maps-key"'));
    assert.ok(source.includes("__MAPS_EMBED_API_KEY__"));
  } finally { await rm(folder,{recursive:true,force:true}); }
});
