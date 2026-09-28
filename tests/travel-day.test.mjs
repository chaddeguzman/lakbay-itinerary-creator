import test from "node:test";
import assert from "node:assert/strict";
import { createActions } from "../scripts/actions.js";
import { createStorage } from "../scripts/state.js";

function setup() {
  const saved = new Map(), renders = [], undos = [];
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  };
  const Storage = createStorage();
  Storage.write({
    activeTripId: "active",
    trips: [
      {
        id: "other",
        days: [{ id: "day-1", date: "2026-10-28", stops: [{ id: "activity", activity: "Other trip", done: false }] }],
        foodPlaces: [],
      },
      {
        id: "active",
        days: [
          { id: "day-1", date: "2026-10-28", stops: [
            { id: "activity", kind: "activity", activity: "Temple", done: false },
            { id: "tour", kind: "tour", activity: "Market tour", done: true },
          ] },
          { id: "day-2", date: "2026-10-29", stops: [{ id: "activity", kind: "activity", activity: "Park", done: false }] },
        ],
        foodPlaces: [
          { id: "meal-1", visitDate: "2026-10-28", venue: "Cafe", done: false },
          { id: "meal-2", visitDate: "2026-10-29", venue: "Diner", done: true },
          { id: "unscheduled", visitDate: "", venue: "Maybe", done: false },
        ],
      },
    ],
  });
  const { toggleScheduledEntryDone } = createActions({
    Storage,
    recordCollection() { throw new Error("unexpected record access"); },
    rememberUndo: (label, before) => undos.push({ label, before }),
    render: () => renders.push(Storage.active()),
    syncRecordExpense() { throw new Error("unexpected expense sync"); },
  });
  return { Storage, toggleScheduledEntryDone, renders, undos };
}

test("activity completion toggles both ways and keeps an undo snapshot", () => {
  const { Storage, toggleScheduledEntryDone, renders, undos } = setup();
  assert.deepEqual(toggleScheduledEntryDone("day-1", "activity", "stop"), { done: true, label: "Temple" });
  assert.equal(Storage.active().days[0].stops[0].done, true);
  assert.equal(Storage.active().days[1].stops[0].done, false);
  assert.equal(Storage.all()[0].days[0].stops[0].done, false);
  assert.equal(undos[0].before.trips[1].days[0].stops[0].done, false);
  assert.match(undos[0].label, /Activity marked done/);
  assert.deepEqual(toggleScheduledEntryDone("day-1", "activity", "stop"), { done: false, label: "Temple" });
  assert.equal(Storage.active().days[0].stops[0].done, false);
  assert.equal(undos[1].before.trips[1].days[0].stops[0].done, true);
  assert.match(undos[1].label, /Activity reopened/);
  assert.equal(renders.length, 2);
});

test("tour completion toggles both ways with tour labels", () => {
  const { Storage, toggleScheduledEntryDone, renders, undos } = setup();
  assert.deepEqual(toggleScheduledEntryDone("day-1", "tour", "stop"), { done: false, label: "Market tour" });
  assert.equal(Storage.active().days[0].stops[1].done, false);
  assert.match(undos[0].label, /Tour reopened/);
  assert.deepEqual(toggleScheduledEntryDone("day-1", "tour", "stop"), { done: true, label: "Market tour" });
  assert.equal(Storage.active().days[0].stops[1].done, true);
  assert.match(undos[1].label, /Tour marked done/);
  assert.equal(renders.length, 2);
});

test("scheduled meal completion toggles both ways on its selected day", () => {
  const { Storage, toggleScheduledEntryDone, renders, undos } = setup();
  assert.deepEqual(toggleScheduledEntryDone("day-1", "meal-1", "meal"), { done: true, label: "Cafe" });
  assert.equal(Storage.active().foodPlaces[0].done, true);
  assert.equal(Storage.active().foodPlaces[1].done, true);
  assert.equal(undos[0].before.trips[1].foodPlaces[0].done, false);
  assert.match(undos[0].label, /Meal marked done/);
  assert.deepEqual(toggleScheduledEntryDone("day-1", "meal-1", "meal"), { done: false, label: "Cafe" });
  assert.equal(Storage.active().foodPlaces[0].done, false);
  assert.equal(undos[1].before.trips[1].foodPlaces[0].done, true);
  assert.match(undos[1].label, /Meal reopened/);
  assert.equal(renders.length, 2);
});

test("missing, unscheduled, wrong-day, and invalid-kind targets do not mutate or render", () => {
  const { Storage, toggleScheduledEntryDone, renders, undos } = setup();
  const before = Storage.read();
  assert.equal(toggleScheduledEntryDone("day-2", "meal-1", "meal"), null);
  assert.equal(toggleScheduledEntryDone("day-1", "meal-2", "meal"), null);
  assert.equal(toggleScheduledEntryDone("day-1", "unscheduled", "meal"), null);
  assert.equal(toggleScheduledEntryDone("missing-day", "activity", "stop"), null);
  assert.equal(toggleScheduledEntryDone("day-1", "missing-entry", "stop"), null);
  assert.equal(toggleScheduledEntryDone("day-1", "activity", "meal"), null);
  assert.equal(toggleScheduledEntryDone("day-1", "activity", "other"), null);
  assert.deepEqual(Storage.read(), before);
  assert.equal(renders.length, 0);
  assert.equal(undos.length, 0);
});
