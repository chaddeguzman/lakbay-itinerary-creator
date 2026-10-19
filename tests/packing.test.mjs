import test from "node:test";
import assert from "node:assert/strict";
import { createStorage, PACK_CATEGORIES } from "../scripts/state.js";
import { createPanelRenderers } from "../scripts/render-panels.js";
import { createActions } from "../scripts/actions.js";

globalThis.window = {};

const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const panels = () => createPanelRenderers({ PACK_CATEGORIES, esc, getTab: () => "packing" });

function storedTrip() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  const storage = createStorage();
  storage.write({ activeTripId: "trip", trips: [{ id: "trip", days: [], packingList: [
    { id: "shirt", label: "Shirt", category: "misc", checked: true },
    { id: "phone", label: "Phone", category: "electronics", checked: false },
  ] }] });
  return storage;
}

test("existing trips gain an empty Attire group between Essentials and Electronics", () => {
  const storage = storedTrip();
  const before = storage.active().packingList;
  const html = panels().packingPanel(storage.active());
  const groups = [...html.matchAll(/<section class="packing-group pack-([a-z]+)">/g)].map((match) => match[1]);
  assert.deepEqual(groups, ["essentials", "attire", "electronics", "toiletries", "misc"]);
  assert.match(html, /packing-group pack-attire[\s\S]*?<small>0<\/small>/);
  assert.deepEqual(storage.active().packingList, before);
});

test("moving an item into Attire persists its category, label and completion", () => {
  const storage = storedTrip();
  let renders = 0;
  const actions = createActions({ Storage: storage, render: () => renders++ });
  const card = { dataset: { item: "shirt" } };
  actions.updateField({ target: {
    dataset: { field: "category" }, value: "attire", type: "select-one",
    closest: (selector) => selector === "[data-item]" ? card : null,
  } });
  assert.deepEqual(storage.active().packingList[0], { id: "shirt", label: "Shirt", category: "attire", checked: true });
  assert.equal(renders, 1);
  const html = panels().packingPanel(storage.active());
  assert.match(html, /packing-group pack-attire[\s\S]*?<small>1<\/small>/);
  assert.match(html, /value="attire"\s+selected/);
});

test("packing labels wrap in an escaped editable field and have a complete print label", () => {
  const label = 'Long shirt name </textarea><script>unsafe</script> & "linen"';
  const html = panels().packingPanel({ packingList: [{ id: "shirt", category: "attire", checked: false, label }] });
  assert.match(html, /<textarea[^>]*class="pack-label no-print"[^>]*data-field="label"[^>]*>/);
  assert.ok(html.includes(`${esc(label)}</textarea>`));
  assert.ok(html.includes(`<span class="pack-label-print print-only">${esc(label)}</span>`));
  assert.ok(!html.includes("<script>unsafe</script>"));
});
