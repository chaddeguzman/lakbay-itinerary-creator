import test from "node:test";
import assert from "node:assert/strict";
import { createDayWorkspace, restoreWorkspaceFocus } from "../scripts/day-workspace.js";

const trip = (id = "trip") => ({ id, days: [
  { id: "d0", date: "2026-11-04", stops: [{ id: "a" }, { id: "tour", kind: "tour" }] },
  { id: "d1", date: "2026-11-05", stops: [{ id: "b" }] },
], foodPlaces: [{ id: "lunch", visitDate: "2026-11-04" }, { id: "later", visitDate: "" }] });
const a = { kind: "activity", id: "a" }, meal = { kind: "meal", id: "lunch" };

test("day selection is shared across tabs, remembered per trip, and never mutates trip data", () => {
  const w = createDayWorkspace(), t = trip(), other = trip("other"), before = structuredClone(t);
  assert.deepEqual(w.read(t, "itinerary"), { dayId: "d0", openEntry: null });
  w.selectDay(t, "d1");
  assert.equal(w.read(t, "food").dayId, "d1");
  assert.equal(w.read(other, "food").dayId, "d0");
  assert.equal(w.read(t, "itinerary").dayId, "d1");
  w.selectDay(t, "invalid");
  assert.equal(w.read(t, "itinerary").dayId, "d1");
  assert.deepEqual(t, before);
});

test("one mixed content card opens at a time and toggles closed", () => {
  const w = createDayWorkspace(), t = trip();
  w.toggleEntry(t, "itinerary", a);
  assert.deepEqual(w.read(t, "itinerary").openEntry, a);
  w.toggleEntry(t, "itinerary", meal);
  assert.deepEqual(w.read(t, "itinerary").openEntry, meal);
  w.toggleEntry(t, "itinerary", meal);
  assert.equal(w.read(t, "itinerary").openEntry, null);
  w.openEntry(t, "itinerary", a);
  w.openEntry(t, "itinerary", a);
  assert.deepEqual(w.read(t, "itinerary").openEntry, a);
});

test("changing scope closes expansion; rerendering the same day does not", () => {
  const w = createDayWorkspace(), t = trip();
  w.openEntry(t, "itinerary", a);
  w.selectDay(t, "d0");
  assert.deepEqual(w.read(t, "itinerary").openEntry, a);
  w.setTab("food");
  assert.equal(w.read(t, "food").openEntry, null);
  w.openEntry(t, "food", meal);
  w.selectDay(t, "d1");
  assert.equal(w.read(t, "food").openEntry, null);
  w.selectDay(t, "d0");
  w.openEntry(t, "food", meal);
  w.read(trip("other"), "food");
  assert.equal(w.read(t, "food").openEntry, null);
});

test("deleted days/entries and imports reconcile without stale state", () => {
  const w = createDayWorkspace(), t = trip();
  w.openEntry(t, "itinerary", a);
  t.days[0].stops = [];
  assert.equal(w.read(t, "itinerary").openEntry, null);
  w.selectDay(t, "d1");
  t.days.pop();
  assert.equal(w.read(t, "itinerary").dayId, "d0");
  t.days = [];
  assert.deepEqual(w.read(t, "food"), { dayId: null, openEntry: null });
});

test("wrong-day entries are rejected and unscheduled meals only expand in Food", () => {
  const w = createDayWorkspace(), t = trip();
  w.openEntry(t, "itinerary", {kind: "activity", id: "b"});
  assert.equal(w.read(t, "itinerary").openEntry, null);
  w.openEntry(t, "itinerary", {kind: "meal", id: "later"});
  assert.equal(w.read(t, "itinerary").openEntry, null);
  w.openEntry(t, "food", {kind: "meal", id: "later"});
  assert.equal(w.read(t, "food").openEntry.id, "later");
  w.openEntry(t, "food", a);
  assert.equal(w.read(t, "food").openEntry, null);
});

test("removing an entry restores focus to the selected day; surviving controls retain focus", () => {
  const focused = [], day = {focus: options => focused.push(["day", options])},
    field = {getClientRects: () => [1], focus: options => focused.push(["field", options]), setSelectionRange: (...value) => focused.push(value)},
    summary = {getClientRects: () => [1], focus: options => focused.push(["summary", options])};
  let cards = [];
  const root = {querySelectorAll: () => cards, querySelector: () => day};
  restoreWorkspaceFocus(root, {kind: "meal", id: "gone", control: "select"});
  assert.deepEqual(focused, [["day", {preventScroll: true}]]);
  cards = [{dataset: {record: "meal"}, querySelector: selector => selector === "input" ? field : summary}];
  restoreWorkspaceFocus(root, {kind: "meal", id: "meal", control: "input", selection: [2, 3]});
  assert.deepEqual(focused.slice(1), [["field", {preventScroll: true}], [2, 3]]);
  restoreWorkspaceFocus(root, {kind: "meal", id: "meal", control: "missing"});
  assert.deepEqual(focused.at(-1), ["summary", {preventScroll: true}]);
});
