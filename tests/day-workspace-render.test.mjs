import test from "node:test";
import assert from "node:assert/strict";
import { createPanelRenderers } from "../scripts/render-panels.js";

globalThis.window ||= {};
const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const trip = () => ({ id: "trip", days: [
  {id: "d0", date: "2026-11-04", title: "Arrival <city>", expenses: [], stops: [
    {id: "a", kind: "activity", activity: "Walk", time: "09:00", location: "KLCC", notes: "Bring water"},
    {id: "tour", kind: "tour", activity: "Tour", time: "10:00", endTime: "12:00", tourLocations: ["KLCC", "Park"], notes: "Guide"},
  ]},
  {id: "d1", date: "2026-11-05", title: "Quiet day", expenses: [], stops: []},
], foodPlaces: [
  {id: "meal", visitDate: "2026-11-04", mealType: "Lunch", venue: "Cafe", location: "Cafe KLCC", notes: "Window", time: "12:30"},
  {id: "next", visitDate: "2026-11-05", mealType: "Lunch", venue: "Tomorrow"},
  {id: "unscheduled", visitDate: "", venue: "Later"},
], foodLibrary: [{id: "saved", venue: "Saved cafe"}] });
function render(t, tab = "itinerary", dayId = "d0", openEntry = null, both = false) {
  const panels = createPanelRenderers({ CATEGORIES: [], PACK_CATEGORIES: [], esc, fmt: String, dayDateLabel: String,
    money: String, Storage: {active: () => t, read: () => ({ui: {collapsedDaysByTrip: {}}})},
    getTab: () => tab, getDayWorkspace: () => ({dayId, openEntry}),
    getMapSelection: () => openEntry ? {tripId: t.id, stopId: openEntry.id, entryType: openEntry.kind, locationIndex: 0} : null,
    editingActivities: new Set(), openMealCards: new Set(), mapsEmbedKey: "test-key", today: () => "2026-11-04",
  });
  return both ? panels.itineraryPanel(t) + panels.foodPanel(t) : panels[tab === "food" ? "foodPanel" : "itineraryPanel"](t);
}
const screen = html => html.split('<section class="workspace-print')[0];

test("both tabs have one shared shell, all Day choices, and selected-day content only", () => {
  const t = trip();
  for (const tab of ["itinerary", "food"]) {
    const html = screen(render(t, tab));
    assert.match(html, /class="day-workspace"/);
    assert.match(html, /data-day-id="d0"[^>]*aria-pressed="true"/);
    assert.match(html, /data-day-id="d1"[^>]*aria-pressed="false"/);
    assert.match(html, /Arrival &lt;city>/);
    assert.match(html, /data-record="meal"/);
    assert.doesNotMatch(html, /data-record="next"/);
    assert.doesNotMatch(html, /<iframe/);
    assert.match(html, /data-action="add-meal"/);
  }
  assert.doesNotMatch(screen(render(t)), /itinerary-map-preview/);
  const mealSummary = screen(render(t)).match(/<summary>[\s\S]*?<\/summary>/)[0];
  assert.doesNotMatch(mealSummary, /<button/);
});

test("one expanded activity, tour, or meal owns the only inline map", () => {
  const t = trip();
  for (const open of [{kind: "activity", id: "a"}, {kind: "activity", id: "tour"}, {kind: "meal", id: "meal"}]) {
    const html = screen(render(t, "itinerary", "d0", open));
    assert.equal((html.match(/<iframe/g) || []).length, 1);
    assert.equal((html.match(/id="itinerary-location-preview"/g) || []).length, 1);
    if (open.id === "tour") assert.match(html, /data-itinerary-map-location/);
  }
  const food = render(t, "food", "d0", {kind: "meal", id: "meal"});
  assert.equal((food.match(/<iframe/g) || []).length, 1);
  assert.match(food, /href="https:\/\/www.google.com\/maps\/search/);
});

test("inactive panels never instantiate a second expanded card or duplicate map target", () => {
  for (const tab of ["itinerary", "food"]) {
    const html = render(trip(), tab, "d0", {kind: "meal", id: "meal"}, true);
    assert.equal((html.match(/id="itinerary-location-preview"/g) || []).length, 1);
    assert.equal((html.match(/<iframe/g) || []).length, 1);
  }
});

test("Food retains unscheduled visits and a collapsed saved-place library", () => {
  const html = render(trip(), "food");
  assert.match(html, /data-record="unscheduled"/);
  assert.match(html, /<details class="food-shortlist"[^>]*>\s*<summary>Saved places/);
  assert.match(html, /data-place="saved"/);
  assert.match(html, /data-record-field="visitDate"/);
});

test("empty days and complete-trip print remain useful independently of selection", () => {
  const t = trip();
  const html = render(t, "itinerary", "d1");
  assert.match(screen(html), /data-day="d1"/);
  assert.match(screen(html), /data-action="add-activity"/);
  assert.doesNotMatch(screen(html), /data-stop="a"/);
  const printed = html.split('<section class="workspace-print')[1];
  assert.ok(printed);
  for (const text of ["Walk", "Bring water", "Tour", "Guide", "Cafe", "Window", "Tomorrow", "Quiet day"])
    assert.ok(printed.includes(text), text);
  assert.doesNotMatch(printed, /<iframe|data-record=|data-stop=|<input/);
});
