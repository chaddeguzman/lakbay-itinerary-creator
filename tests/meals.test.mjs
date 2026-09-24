import test from "node:test";
import assert from "node:assert/strict";
import { createStorage, normalizeTrip } from "../scripts/state.js";
import { createActions } from "../scripts/actions.js";
import { mealGroup, scheduledEntries, unscheduleMissingDays } from "../scripts/meals.js";
import { createPanelRenderers } from "../scripts/render-panels.js";

const day = (date = "2026-10-28") => ({ id: date, date, title: "Explore", stops: [], expenses: [] });
const trip = () => ({ id: "trip", days: [day()], foodPlaces: [], foodLibrary: [] });
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
globalThis.window = {};
const panels = (current = trip()) => createPanelRenderers({
  CATEGORIES: [], PACK_CATEGORIES: [], Storage: { read: () => ({ ui: { collapsedDaysByTrip: {} } }), active: () => current },
  dayDateLabel: (value) => value, editingActivities: new Set(), esc, fmt: (value) => value,
  getTab: () => "itinerary", money: (value) => String(value), openMealCards: new Set(),
  render() {}, today: () => "2026-10-28", toast() {}, uid: () => "expense-id",
});

test("older undated places migrate once; existing timed visits keep their details", () => {
  const t = { ...trip(), foodLibrary: undefined, foodPlaces: [
    { id: "place", venue: "Cafe", amount: "12", reservation: "Window seat" },
    { id: "visit", venue: "Diner", visitDate: "2026-10-28", mealType: "brunch", reservationTime: "10:00" },
  ] };
  normalizeTrip(t);
  assert.equal(t.foodLibrary.length, 1);
  assert.equal(t.foodLibrary[0].amount, "12");
  assert.equal(t.foodPlaces.length, 1);
  assert.equal(t.foodPlaces[0].time, "10:00");
  assert.equal(t.foodPlaces[0].mealType, "Other");
  assert.equal(t.foodPlaces[0].originalMealType, "brunch");
  t.foodPlaces[0].time = "";
  normalizeTrip(t);
  assert.equal(t.foodPlaces[0].time, "");
});

test("multiple breakfasts appear in time order with activities; untimed meals follow", () => {
  const t = trip();
  t.days[0].stops.push({ id: "tour", kind: "tour", time: "07:00", activity: "Tour" });
  t.foodPlaces.push(
    { id: "late", visitDate: t.days[0].date, mealType: "Breakfast", time: "10:00", venue: "Late cafe" },
    { id: "early", visitDate: t.days[0].date, mealType: "Breakfast", time: "06:00", venue: "Early cafe" },
    { id: "later", visitDate: t.days[0].date, mealType: "Breakfast", time: "", venue: "Maybe" },
  );
  assert.deepEqual(scheduledEntries(t, t.days[0]).map((item) => item.record.id), ["early", "tour", "late", "later"]);
  const html = panels(t).itineraryPanel(t);
  const food = panels(t).foodPanel(t);
  assert.ok(html.indexOf("Early cafe") < html.indexOf("Tour"));
  assert.ok(html.indexOf("Tour") < html.indexOf("Late cafe"));
  assert.ok(!html.includes("Time overlap"));
  assert.equal((food.match(/Breakfast: /g) || []).length, 3);
});

test("removing a trip day keeps visits unscheduled and clears linked expenses", () => {
  const t = trip();
  const meal = { id: "meal", visitDate: t.days[0].date, venue: "Cafe", mealType: "Lunch", amount: "9", currency: "PHP" };
  t.foodPlaces.push(meal);
  const renderers = panels();
  renderers.syncRecordExpense(t, "food", meal);
  renderers.syncRecordExpense(t, "food", meal);
  assert.equal(t.days[0].expenses.length, 1);
  t.days.push(day("2026-10-29"));
  meal.visitDate = "2026-10-29";
  renderers.syncRecordExpense(t, "food", meal);
  assert.equal(t.days[0].expenses.length, 0);
  assert.equal(t.days[1].expenses.length, 1);
  t.days = [];
  unscheduleMissingDays(t);
  assert.equal(meal.visitDate, "");
  assert.equal(t.foodPlaces.length, 1);
  assert.equal(t.foodLibrary.length, 0);
  assert.equal(mealGroup("SNACKS"), "Snacks");
  assert.equal(mealGroup("snack"), "Snacks");
});

test("editing one visit persists across both views and keeps one linked expense", () => {
  const saved = new Map();
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  };
  const t = trip();
  t.foodLibrary.push({ id: "cafe", venue: "Cafe" });
  t.foodPlaces.push({ id: "first", visitDate: t.days[0].date, mealType: "Breakfast", venue: "Cafe", amount: "5" });
  t.foodPlaces.push({ id: "second", visitDate: t.days[0].date, mealType: "Breakfast", venue: "Cafe", amount: "7" });
  const Storage = createStorage();
  Storage.write({ trips: [t], activeTripId: t.id });
  const { syncRecordExpense } = panels(t);
  const { updateRecordField } = createActions({
    Storage, recordCollection: (current) => current.foodPlaces, rememberUndo() {}, render() {}, syncRecordExpense,
  });
  const card = { dataset: { recordType: "food", record: "first" } };
  const edit = (field, value) => updateRecordField({ target: {
    dataset: { recordField: field }, value, closest: () => card,
  } }, false);
  edit("venue", "Morning Cafe");
  edit("amount", "9");
  edit("visitDate", "");
  let result = Storage.active();
  assert.equal(result.foodPlaces[0].venue, "Morning Cafe");
  assert.equal(result.foodPlaces[1].venue, "Cafe");
  assert.equal(result.foodLibrary[0].venue, "Cafe");
  assert.equal(result.days[0].expenses.length, 0);
  edit("visitDate", result.days[0].date);
  result = Storage.active();
  assert.equal(result.days[0].expenses.length, 1);
  assert.equal(result.days[0].expenses[0].amount, "9");
  assert.equal((panels(result).itineraryPanel(result).match(/data-record="first"/g) || []).length, 1);
  assert.equal((panels(result).foodPanel(result).match(/data-record="first"/g) || []).length, 1);
});

test("day meal editor uses the clicked day and shows only informative fields", () => {
  const t = trip();
  t.foodPlaces.push({
    id: "meal",
    visitDate: t.days[0].date,
    mealType: "Breakfast",
    venue: "Early Cafe",
    time: "07:00",
    notes: "Takeaway",
    amount: "12",
  });
  const html = panels(t).itineraryPanel(t);
  assert.match(html, /data-record-field="venue"/);
  assert.match(html, /data-record-field="mealType"/);
  assert.match(html, /data-record-field="time"/);
  assert.match(html, /data-record-field="notes"/);
  assert.doesNotMatch(html, /data-record-field="visitDate"/);
  assert.doesNotMatch(html, /data-record-field="amount"/);
  assert.doesNotMatch(html, /data-record-field="currency"/);
  assert.doesNotMatch(html, /data-record-field="location"/);
  assert.doesNotMatch(html, /data-record-field="cuisine"/);
  assert.doesNotMatch(html, /data-record-field="reservation"/);
});

test("meal venue links to Google Maps and meal time uses half-hour choices", () => {
  const t = trip();
  t.foodPlaces.push({
    id: "meal",
    visitDate: t.days[0].date,
    mealType: "Lunch",
    venue: "Old City Cafe",
    time: "12:30",
  });
  const html = panels(t).itineraryPanel(t);
  assert.match(html, /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Old%20City%20Cafe"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /<option value="12:00"/);
  assert.match(html, /<option value="12:30" selected/);
  assert.match(html, /<option value="13:00"/);
  assert.doesNotMatch(html, /type="time" data-record-field="time"/);
});
