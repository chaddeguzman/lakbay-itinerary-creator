import test from "node:test";
import assert from "node:assert/strict";
import { createStorage } from "../scripts/state.js";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) || null,
  setItem: (key, value) => store.set(key, value),
  removeItem: (key) => store.delete(key),
};

test("silent mutations persist without showing the saved notification", () => {
  let saved = 0;
  const storage = createStorage({ onSaved: () => saved++ });
  storage.mutate((state) => {
    state.trips.push({ id: "trip", days: [] });
    state.activeTripId = "trip";
  });
  storage.mutate((state) => {
    state.ui.navCollapsed = true;
  }, { silent: true });

  assert.equal(saved, 1);
  assert.equal(storage.read().ui.navCollapsed, true);
});
