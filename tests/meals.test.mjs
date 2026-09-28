import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStorage, normalizeTrip } from "../scripts/state.js";
import { createActions } from "../scripts/actions.js";
import { defaultTravelDay, mealGroup, nextScheduledEntry, scheduledEntries, unscheduleMissingDays } from "../scripts/meals.js";
import { createPanelRenderers } from "../scripts/render-panels.js";

const day = (date = "2026-10-28") => ({ id: date, date, title: "Explore", stops: [], expenses: [] });
const trip = () => ({ id: "trip", days: [day()], foodPlaces: [], foodLibrary: [] });
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
globalThis.window = {};
const panels = (current = trip(), editingActivities = new Set()) => createPanelRenderers({
  CATEGORIES: [], PACK_CATEGORIES: [], Storage: { read: () => ({ ui: { collapsedDaysByTrip: {} } }), active: () => current },
  dayDateLabel: (value) => value, editingActivities, esc, fmt: (value) => value,
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

test("scheduled meals normalize completion without losing older details", () => {
  const t = trip();
  t.foodPlaces = [
    { id: "old", visitDate: t.days[0].date, venue: "Cafe", reservation: "Window" },
    { id: "done", visitDate: t.days[0].date, venue: "Diner", done: true },
  ];
  normalizeTrip(t);
  assert.equal(t.foodPlaces[0].done, false);
  assert.equal(t.foodPlaces[0].reservation, "Window");
  assert.equal(t.foodPlaces[1].done, true);
});

test("default Travel Day selects today at either trip boundary, else first day", () => {
  const t = { ...trip(), days: [day("2026-10-28"), day("2026-10-29")] };
  assert.equal(defaultTravelDay(t, "2026-10-28"), t.days[0]);
  assert.equal(defaultTravelDay(t, "2026-10-29"), t.days[1]);
  assert.equal(defaultTravelDay(t, "2026-11-01"), t.days[0]);
  assert.equal(defaultTravelDay({ ...t, days: [] }, "2026-10-28"), null);
});

test("today selects an active range before a future timed meal and skips done entries", () => {
  const t = trip(), d = t.days[0];
  d.stops.push(
    { id: "done", time: "08:00", done: true },
    { id: "active", time: "09:00", endTime: "10:30", timeMode: "range", done: false },
  );
  t.foodPlaces.push({ id: "meal", visitDate: d.date, time: "10:00", done: false });
  assert.equal(nextScheduledEntry(t, d, { todayIso: d.date, nowMinutes: 10 * 60 }).record.id, "active");
  d.stops[1].done = true;
  assert.equal(nextScheduledEntry(t, d, { todayIso: d.date, nowMinutes: 10 * 60 }).record.id, "meal");
});

test("today treats a midnight-crossing range as active after midnight", () => {
  const t = trip(), d = t.days[0];
  d.stops.push({ id: "overnight", time: "23:00", endTime: "01:00", timeMode: "range", done: false });
  t.foodPlaces.push({ id: "breakfast", visitDate: d.date, time: "08:00", done: false });
  assert.equal(nextScheduledEntry(t, d, { todayIso: d.date, nowMinutes: 30 }).record.id, "overnight");
  assert.equal(nextScheduledEntry(t, d, { todayIso: d.date, nowMinutes: 60 }).record.id, "breakfast");
});

test("today falls back to earliest untimed item after timed entries pass", () => {
  const t = trip(), d = t.days[0];
  d.stops.push({ id: "past", time: "08:00", done: false }, { id: "untimed-stop", done: false });
  t.foodPlaces.push({ id: "untimed-meal", visitDate: d.date, time: "", done: false });
  assert.equal(nextScheduledEntry(t, d, { todayIso: d.date, nowMinutes: 12 * 60 }).record.id, "untimed-stop");
  d.stops[1].done = true;
  assert.equal(nextScheduledEntry(t, d, { todayIso: d.date, nowMinutes: 12 * 60 }).record.id, "untimed-meal");
  t.foodPlaces[0].done = true;
  assert.equal(nextScheduledEntry(t, d, { todayIso: d.date, nowMinutes: 12 * 60 }), null);
});

test("another selected day returns earliest unfinished scheduled item regardless of time", () => {
  const t = trip(), d = t.days[0];
  d.stops.push({ id: "done", time: "07:00", done: true }, { id: "past", time: "08:00", done: false });
  t.foodPlaces.push({ id: "meal", visitDate: d.date, time: "09:00", done: false });
  assert.equal(nextScheduledEntry(t, d, { todayIso: "2026-10-29", nowMinutes: 23 * 60 }).record.id, "past");
});

test("empty days, unscheduled-only meals, and all-done days have no next entry", () => {
  const t = trip(), d = t.days[0], args = { todayIso: d.date, nowMinutes: 12 * 60 };
  assert.equal(nextScheduledEntry(t, d, args), null);
  t.foodPlaces.push({ id: "unscheduled", visitDate: "", time: "13:00" });
  assert.equal(nextScheduledEntry(t, d, args), null);
  d.stops.push({ id: "finished", time: "13:00", done: true });
  assert.equal(nextScheduledEntry(t, d, args), null);
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

test("day titles are limited to 40 characters", () => {
  const t = trip();
  t.days[0].title = "A very long itinerary day title that exceeds forty characters";
  const html = panels(t).itineraryPanel(t);
  assert.match(html, /maxlength="40"/);
  assert.match(html, /class="day-date-label"/);
  assert.match(html, /value="A very long itinerary day title that ex/);
  assert.doesNotMatch(html, /exceeds forty characters/);
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
  const { updateRecordField, updateScheduledTime } = createActions({
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
  updateScheduledTime({
    dataset: { timeField: "time" },
    closest: (selector) => selector === "[data-record]" ? card : null,
  }, "13:30");
  assert.equal(Storage.active().foodPlaces[0].time, "13:30");
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
  assert.match(html, /class="field meal-venue"/);
  assert.match(html, /data-record-field="mealType"/);
  assert.match(html, /data-time-field="time"/);
  assert.match(html, /data-record-field="notes"/);
  assert.doesNotMatch(html, /data-record-field="visitDate"/);
  assert.doesNotMatch(html, /data-record-field="amount"/);
  assert.doesNotMatch(html, /data-record-field="currency"/);
  assert.doesNotMatch(html, /data-record-field="location"/);
  assert.doesNotMatch(html, /data-record-field="cuisine"/);
  assert.doesNotMatch(html, /data-record-field="reservation"/);
});

test("meal time uses compact period, hour, and five-minute menus", () => {
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
  const period = html.indexOf('data-time-trigger="period"');
  const hour = html.indexOf('data-time-trigger="hour"');
  const minute = html.indexOf('data-time-trigger="minute"');
  assert.ok(period >= 0 && period < hour && hour < minute);
  assert.match(html, /data-time-option="05"/);
  assert.match(html, /data-time-option="55"/);
  assert.match(html, /data-time-option="30"[^>]*aria-selected="true"/);
  assert.match(html, /12:30 PM/);
  assert.doesNotMatch(html, /type="time" data-record-field="time"/);
});

test("saved off-step minutes remain available without rounding", () => {
  const t = trip();
  t.foodPlaces.push({ id: "meal", visitDate: t.days[0].date, mealType: "Breakfast", venue: "Cafe", time: "08:07" });
  const html = panels(t).itineraryPanel(t);
  assert.match(html, /08:07 AM/);
  assert.match(html, /data-time-option="07"[^>]*aria-selected="true"/);
  assert.match(html, /data-time-option="05"/);
});

test("activity and tour compact rows put Done before time and keep edit actions expandable", () => {
  const t = trip();
  t.days[0].stops.push(
    { id: "activity", kind: "activity", time: "08:00", activity: "Temple visit", location: "Old City", notes: "Bring water", done: false },
    { id: "tour", kind: "tour", time: "10:00", endTime: "12:00", activity: "Food tour", tourLocations: ["Market"], notes: "Meet guide", done: false },
  );
  const html = panels(t).itineraryPanel(t),
    done = html.indexOf('data-action="toggle-done"'),
    time = html.indexOf("8:00 AM"),
    edit = html.indexOf('data-action="edit-activity"'),
    notes = html.indexOf("Bring water");
  assert.ok(done >= 0 && done < time);
  assert.ok(time < edit);
  assert.ok(notes >= 0);
  assert.match(html, /class="stop activity-compact/);
  assert.match(html, /class="stop activity-compact tour-compact/);
});

test("completed watermark requires every activity and tour to be done", () => {
  const t = trip();
  t.days[0].stops.push(
    { id: "activity", kind: "activity", activity: "Temple visit", done: true },
    { id: "tour", kind: "tour", activity: "Food tour", done: true },
  );
  t.foodPlaces.push({ id: "meal", visitDate: t.days[0].date, mealType: "Lunch", venue: "Cafe" });
  const completedHtml = panels(t).itineraryPanel(t);
  assert.match(completedHtml, /day-completed-watermark/);
  assert.match(completedHtml, /class="day\s+is-completed/);

  t.days[0].stops[1].done = false;
  assert.doesNotMatch(panels(t).itineraryPanel(t), /day-completed-watermark/);

  t.days[0].stops = [];
  assert.doesNotMatch(panels(t).itineraryPanel(t), /day-completed-watermark/);
});

test("compact activity notes stay visible as one truncated line", () => {
  const css = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.activity-compact:not\(\.is-expanded\) \.activity-notes\s*\{\s*display:\s*none/);
  assert.match(css, /\.activity-notes\s*\{[\s\S]*white-space:\s*nowrap;[\s\S]*text-overflow:\s*ellipsis;/);
});

test("all day-card editors share the blank three-part picker", () => {
  const t = trip();
  t.days[0].stops.push(
    { id: "activity", kind: "activity", time: "", timeMode: "range", endTime: "", activity: "Walk" },
    { id: "tour", kind: "tour", time: "", endTime: "", activity: "Tour", tourLocations: ["Gate"] },
  );
  t.foodPlaces.push({ id: "meal", visitDate: t.days[0].date, mealType: "Dinner", venue: "" });
  const html = panels(t, new Set(["activity", "tour"])).itineraryPanel(t);
  assert.equal((html.match(/data-time-trigger="period"/g) || []).length, 5);
  assert.equal((html.match(/data-time-trigger="hour"/g) || []).length, 5);
  assert.equal((html.match(/data-time-trigger="minute"/g) || []).length, 5);
  assert.match(html, /aria-expanded="false">AM\/PM<\/button>/);
  assert.match(html, /aria-expanded="false">HH<\/button>/);
  assert.match(html, /aria-expanded="false">MM<\/button>/);
  assert.doesNotMatch(html, /class="stop-time" type="time"/);
  assert.equal((panels(t).foodPanel(t).match(/data-time-trigger="period"/g) || []).length, 1);
});

test("saving shared picker values keeps 24-hour times for sorting and durations", () => {
  const saved = new Map();
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  };
  const t = trip();
  t.days[0].stops.push({ id: "tour", kind: "tour", time: "", endTime: "", activity: "Tour", tourLocations: ["Gate"] });
  t.foodPlaces.push({ id: "meal", visitDate: t.days[0].date, mealType: "Dinner", venue: "Cafe", time: "" });
  const Storage = createStorage();
  Storage.write({ trips: [t], activeTripId: t.id });
  const { updateScheduledTime } = createActions({
    Storage, recordCollection: (current) => current.foodPlaces, rememberUndo() {}, render() {},
    syncRecordExpense() {},
  });
  const dayEl = { dataset: { day: t.days[0].id } };
  const stopEl = { dataset: { stop: "tour" } };
  const recordEl = { dataset: { recordType: "food", record: "meal" } };
  const stopPicker = (field) => ({ dataset: { timeField: field }, closest: (selector) =>
    selector === "[data-stop]" ? stopEl : selector === "[data-day]" ? dayEl : null });
  const mealPicker = { dataset: { timeField: "time" }, closest: (selector) =>
    selector === "[data-record]" ? recordEl : null };
  updateScheduledTime(stopPicker("time"), "00:05");
  updateScheduledTime(stopPicker("endTime"), "12:55");
  updateScheduledTime(mealPicker, "18:10");
  const result = Storage.active();
  assert.equal(result.days[0].stops[0].time, "00:05");
  assert.equal(result.days[0].stops[0].endTime, "12:55");
  assert.equal(result.foodPlaces[0].time, "18:10");
  assert.deepEqual(scheduledEntries(result, result.days[0]).map((entry) => entry.record.id), ["tour", "meal"]);
});

test("only the day stamp toggles the itinerary day card", () => {
  const t = trip();
  t.days[0].stops.push({ id: "activity", kind: "activity", activity: "Temple visit" });
  const html = panels(t).itineraryPanel(t);
  const header = html.match(/<header class="day-head[\s\S]*?<\/header>/)?.[0];
  assert.ok(header);
  const stamp = header.match(/<div class="stamp[\s\S]*?<\/div>/)?.[0];
  assert.match(stamp, /class="stamp day-stamp-toggle" data-action="toggle-day" role="button" tabindex="0" aria-expanded="true" aria-label="Collapse day"/);
  const headerWithoutStamp = header.replace(stamp, "");
  assert.doesNotMatch(headerWithoutStamp, /data-action="toggle-day"|role="button"/);
});
