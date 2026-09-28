import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createActions } from "../scripts/actions.js";
import { createStorage } from "../scripts/state.js";
import { createPanelRenderers } from "../scripts/render-panels.js";
import { nextScheduledEntry, scheduledEntries } from "../scripts/meals.js";

globalThis.window = {};

function panels(trip) {
  return createPanelRenderers({
    CATEGORIES: [], PACK_CATEGORIES: [],
    Storage: { read: () => ({ ui: { collapsedDaysByTrip: {} } }), active: () => trip },
    dayDateLabel: (date) => date, editingActivities: new Set(),
    esc: (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"),
    fmt: (value) => value, getTab: () => "itinerary", money: String,
    openMealCards: new Set(), render() {}, today: () => "2026-10-28", toast() {}, uid: () => "id",
  });
}

function renderTrip() {
  return {
    id: "trip",
    days: [
      { id: "day-1", date: "2026-10-28", stops: [
        { id: "later", kind: "activity", time: "10:00", activity: "Temple", location: "Old City", done: false },
        { id: "tour", kind: "tour", time: "09:00", endTime: "09:45", timeMode: "range", activity: "Market", tourLocations: ["Gate", "Market"], done: false },
        { id: "untimed", kind: "activity", time: "", activity: "Wander", location: "", done: false },
      ] },
      { id: "day-2", date: "2026-10-29", stops: [{ id: "other-day", kind: "activity", time: "08:00", activity: "Park", done: false }] },
    ],
    foodPlaces: [
      { id: "meal", visitDate: "2026-10-28", mealType: "Breakfast", time: "08:00", venue: "Cafe", done: false },
      { id: "empty-location", visitDate: "2026-10-28", mealType: "Lunch", time: "12:00", venue: "", done: false },
      { id: "unscheduled-meal", visitDate: "", mealType: "Dinner", time: "18:00", venue: "Elsewhere" },
    ],
    foodLibrary: [],
  };
}

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

test("Travel Day renders one day's ordered schedule and highlights the next timed meal", () => {
  const t = renderTrip();
  const html = panels(t).travelDayContent(t, "day-1", { todayIso: "2026-10-28", nowMinutes: 7 * 60 });
  assert.ok(html.indexOf('data-entry-id="meal"') < html.indexOf('data-entry-id="tour"'));
  assert.ok(html.indexOf('data-entry-id="tour"') < html.indexOf('data-entry-id="later"'));
  assert.ok(html.indexOf('data-entry-id="later"') < html.indexOf('data-entry-id="untimed"'));
  assert.doesNotMatch(html, /Park|Elsewhere/);
  assert.match(html, /data-entry-id="meal"[^>]*is-next-stop/);
  assert.match(html, /Next Stop/);
  assert.match(html, /data-action="toggle-travel-day-done"/);
  assert.match(html, /data-entry-kind="meal"/);
  assert.match(html, /data-entry-kind="stop"/);
  assert.match(html, /data-action="travel-day-previous"[^>]*disabled/);
  assert.match(html, /<span class="travel-day-current">Day 1 · 2026-10-28<\/span>/);
  assert.match(html, /data-action="travel-day-next"(?![^>]*disabled)/);
  assert.doesNotMatch(html, /<select[^>]*data-action="select-travel-day"/);
  assert.doesNotMatch(html, /data-field=|data-record-field=|data-time-field=|data-action="(edit-activity|remove-stop|remove-record|add-meal)"/);
});

test("Travel Day navigation disables Next on the final trip day", () => {
  const t = renderTrip();
  const html = panels(t).travelDayContent(t, "day-2", { todayIso: "2026-10-28", nowMinutes: 7 * 60 });
  assert.match(html, /data-action="travel-day-previous"(?![^>]*disabled)/);
  assert.match(html, /<span class="travel-day-current">Day 2 · 2026-10-29<\/span>/);
  assert.match(html, /data-action="travel-day-next"[^>]*disabled/);
});

test("Travel Day leading checkbox toggles completion accessibly and keeps map links", () => {
  const t = renderTrip();
  t.days[0].stops[0].done = true;
  t.foodPlaces[0].done = true;
  const html = panels(t).travelDayContent(t, "day-1", { todayIso: "2026-10-28", nowMinutes: 7 * 60 });
  assert.match(html, /data-entry-id="later"[^>]*is-done/);
  assert.match(html, /data-entry-id="meal"[^>]*is-done/);
  assert.match(html, /data-entry-id="meal"[^>]*>[\s\S]*?<button[^>]*data-action="toggle-travel-day-done"[^>]*role="checkbox"[^>]*aria-checked="true"[^>]*aria-label="Undo: Cafe"/);
  assert.match(html, /data-entry-id="tour"[^>]*>[\s\S]*?<button[^>]*data-action="toggle-travel-day-done"[^>]*role="checkbox"[^>]*aria-checked="false"[^>]*aria-label="Mark done: Market"/);
  assert.doesNotMatch(html, />(?:Done|Undo)<\/button>/);
  assert.match(html, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=Old%20City/);
  assert.match(html, /https:\/\/www\.google\.com\/maps\/dir\/\?/);
  assert.match(html, /target="_blank" rel="noopener"/);
  assert.equal((html.match(/>Open map</g) || []).length, 3);
});

test("Travel Day distinguishes empty, complete, and no upcoming stops", () => {
  const t = renderTrip();
  const renderDay = (nowMinutes) => panels(t).travelDayContent(t, "day-1", { todayIso: "2026-10-28", nowMinutes });
  t.days[0].stops[2].done = true;
  assert.match(renderDay(23 * 60), /No upcoming stops/);
  t.days[0].stops.forEach((stop) => { stop.done = true; });
  t.foodPlaces.filter((meal) => meal.visitDate === t.days[0].date).forEach((meal) => { meal.done = true; });
  assert.match(renderDay(23 * 60), /Day complete/);
  assert.doesNotMatch(renderDay(23 * 60), /is-next-stop/);
  t.days[0].stops = [];
  t.foodPlaces = [];
  assert.match(renderDay(23 * 60), /No scheduled entries/);
  assert.match(panels(t).travelDayContent(t, "missing", { todayIso: "2026-10-28", nowMinutes: 0 }), /No trip day selected/);
});

test("Itinerary exposes the Travel Day button and keeps completion cues without Done controls", () => {
  const t = renderTrip();
  t.days[0].stops.forEach((stop) => { stop.done = true; });
  t.foodPlaces.filter((meal) => meal.visitDate === t.days[0].date).forEach((meal) => { meal.done = true; });
  const html = panels(t).itineraryPanel(t);
  assert.match(html, /data-action="open-travel-day"/);
  assert.doesNotMatch(html, /data-action="toggle-done"/);
  assert.match(html, /day-completed-watermark/);
  assert.match(html, /class="meal-card is-done"/);
  assert.match(html, /class="stop activity-compact is-done/);
});

test("Travel Day has an accessible native dialog and scoped content container", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<dialog[^>]*id="travelDayModal"[^>]*aria-labelledby="travelDayTitle"/s);
  assert.match(html, /id="travelDayTitle">Travel Day</);
  assert.match(html, /id="travelDayContent"/);
  assert.match(html, /id="closeTravelDay"[^>]*aria-label="Close Travel Day"/s);
});

test("app opens the dialog with the default day, routes day changes and completion, and has no Itinerary Done handler", () => {
  const app = readFileSync(new URL("../scripts/app.js", import.meta.url), "utf8");
  assert.match(app, /defaultTravelDay\(.*today\(\)\)/);
  assert.match(app, /travelDayModal\.showModal\(\)/);
  assert.match(app, /data-action="open-travel-day"|act === "open-travel-day"/);
  assert.match(app, /travel-day-previous/);
  assert.match(app, /travel-day-next/);
  assert.doesNotMatch(app, /select-travel-day/);
  assert.match(app, /toggle-travel-day-done/);
  assert.match(app, /toggleScheduledEntryDone\(travelDayId, entryId, entryKind\)/);
  assert.match(app, /travelDayModal\.addEventListener\("close"/);
  assert.match(app, /renderTravelDay\(\)/);
  assert.doesNotMatch(app, /act === "toggle-done"/);
});

test("Travel Day navigation advances and returns one trip day while restoring focus", () => {
  const trip = renderTrip(), renders = [], focused = [];
  let context;
  context = clockFunctions({
    travelDayId: "day-1",
    Storage: { active: () => trip },
    renderTravelDay: () => renders.push(context.travelDayId),
    travelDayContentEl: { querySelector: (selector) => ({ focus: () => focused.push(selector) }) },
  }, "navigateTravelDay");
  context.navigateTravelDay(1);
  assert.equal(context.travelDayId, "day-2");
  context.navigateTravelDay(-1);
  assert.equal(context.travelDayId, "day-1");
  assert.deepEqual(renders, ["day-2", "day-1"]);
  assert.deepEqual(focused, [
    '[data-action="travel-day-next"]',
    '[data-action="travel-day-previous"]',
  ]);
});

test("Travel Day and completed meals have responsive completion styles", () => {
  const css = readFileSync(new URL("../css/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.travel-day-modal\s*\{/);
  assert.match(css, /\.travel-day-entry\.is-done/);
  assert.match(css, /\.meal-card\.is-done/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.travel-day-modal/);
});

function clockFunctions(context, ...names) {
  const source = readFileSync(new URL("../scripts/app.js", import.meta.url), "utf8");
  for (const name of names) {
    const declaration = source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`))?.[0];
    assert.ok(declaration, `${name} must exist`);
    runInNewContext(declaration, context);
  }
  return context;
}

test("clock refresh moves Next Stop from an ended range to a meal without replacing controls", () => {
  const t = {
    id: "trip",
    days: [{ id: "day-1", date: "2026-10-28", stops: [
      { id: "tour", kind: "tour", timeMode: "range", time: "08:55", endTime: "09:00", activity: "Walk", done: false },
    ] }],
    foodPlaces: [{ id: "meal", visitDate: "2026-10-28", time: "10:00", venue: "Cafe", done: false }],
  };
  const status = { textContent: "Next Stop: Walk" };
  function article(id, kind, highlighted) {
    const classes = new Set(highlighted ? ["is-next-stop"] : []);
    const button = { dataset: { entryId: id, entryKind: kind } };
    const main = { badge: highlighted ? { remove() { main.badge = null; } } : null,
      querySelector: () => main.badge,
      append(node) { main.badge = node; } };
    return {
      classes, main, button,
      classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) },
      querySelector: (selector) => selector.includes("toggle-travel-day-done")
        ? button : main,
    };
  }
  const tour = article("tour", "stop", true), meal = article("meal", "meal", false);
  const focusedButton = tour.button;
  const content = { scrollTop: 137,
    set innerHTML(_) { throw new Error("clock refresh replaced modal content"); },
    querySelector: () => status,
    querySelectorAll: () => [tour, meal],
  };
  const context = clockFunctions({
    travelDayModal: { open: true }, travelDayId: "day-1", travelDayContentEl: content,
    Storage: { active: () => t }, scheduledEntries, nextScheduledEntry,
    Date: class { getHours() { return 9; } getMinutes() { return 0; } },
    localIso: () => "2026-10-28",
    document: { activeElement: focusedButton, createElement: () => ({}) },
  }, "refreshTravelDayNextStop");
  context.refreshTravelDayNextStop();
  assert.equal(status.textContent, "Next Stop: Cafe");
  assert.equal(tour.classes.has("is-next-stop"), false);
  assert.equal(meal.classes.has("is-next-stop"), true);
  assert.equal(tour.main.badge, null);
  assert.equal(meal.main.badge?.textContent, "Next Stop");
  assert.equal(content.scrollTop, 137);
  assert.equal(context.document.activeElement, focusedButton);
  assert.equal(context.travelDayId, "day-1");
});

test("clock schedules the next local minute and visibility restoration refreshes immediately", () => {
  const day = { id: "day-1", date: "2026-10-28" }, calls = [], cleared = [];
  let now = { seconds: 30, milliseconds: 250 };
  const context = clockFunctions({
    travelDayModal: { open: true }, travelDayId: day.id, travelDayClockTimer: null,
    Storage: { active: () => ({ days: [day] }) }, today: () => day.date,
    document: { hidden: false },
    Date: class { getSeconds() { return now.seconds; } getMilliseconds() { return now.milliseconds; } },
    setTimeout: (callback, delay) => { calls.push({ callback, delay }); return calls.length; },
    clearTimeout: (id) => cleared.push(id),
    refreshTravelDayNextStop: () => calls.push({ refreshed: true }),
  }, "stopTravelDayClock", "scheduleTravelDayClock", "onTravelDayVisibilityChange");
  context.scheduleTravelDayClock();
  assert.equal(calls[0].delay, 29750);
  now = { seconds: 0, milliseconds: 0 };
  calls[0].callback();
  assert.equal(calls.some((call) => call.refreshed), true);
  assert.equal(calls.at(-1).delay, 60000);
  const scheduledId = context.travelDayClockTimer;
  context.document.hidden = true;
  context.onTravelDayVisibilityChange();
  assert.equal(context.travelDayClockTimer, null);
  assert.ok(cleared.includes(scheduledId));
  context.document.hidden = false;
  context.onTravelDayVisibilityChange();
  assert.equal(calls.filter((call) => call.refreshed).length, 2);
  assert.equal(calls.at(-1).delay, 60000);
  context.travelDayModal.open = false;
  context.stopTravelDayClock();
  assert.equal(context.travelDayClockTimer, null);
});
