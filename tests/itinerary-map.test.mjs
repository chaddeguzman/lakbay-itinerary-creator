import test from "node:test";
import assert from "node:assert/strict";
import { createPanelRenderers } from "../scripts/render-panels.js";

globalThis.window = {};
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
const trip = () => ({ id:"trip", destination:"Kuala Lumpur, Malaysia", days:[{
  id:"day", date:"2026-10-24", title:"Explore", mapCity:"Kuala Lumpur", mapCountry:"Malaysia", expenses:[], stops:[
    { id:"restaurant", kind:"activity", activity:"Lunch", location:"Punjabi Rasoi - Brickfields", time:"12:00", notes:"", done:false },
    { id:"tour", kind:"tour", activity:"City tour", tourLocations:["", "Petronas Twin Towers", "KLCC Park"], time:"14:00", endTime:"17:00", notes:"", done:false },
    { id:"empty", kind:"activity", activity:"Free time", location:"", notes:"" },
  ] }], foodPlaces:[], foodLibrary:[] });
function panels(t, selection = null, key = "test-maps-key") {
  return createPanelRenderers({ PACK_CATEGORIES:[], CATEGORIES:[], esc,
    Storage:{ active:()=>t, read:()=>({ui:{collapsedDaysByTrip:{}}}) },
    dayDateLabel:String, fmt:String, money:String, editingActivities:new Set(), openMealCards:new Set(),
    getTab:()=>"itinerary", today:()=>"2026-10-24", getMapSelection:()=>selection, mapsEmbedKey:key,
  });
}

function previewQueries(html) {
  const embed = html.match(/<iframe[^>]*src="([^"]+)"/)[1],
    external = html.match(/class="map-link itinerary-map-open" href="([^"]+)"/)[1];
  return {
    embed: new URL(embed.replaceAll("&amp;", "&")).searchParams.get("q"),
    external: new URL(external.replaceAll("&amp;", "&")).searchParams.get("query"),
  };
}
test("Itinerary starts with one shared map panel and no external iframe request", () => {
  const t = trip(), html = panels(t).itineraryPanel(t);
  assert.match(html, /Select an activity or meal to preview its location/);
  assert.equal((html.match(/id="itinerary-location-preview"/g) || []).length, 1);
  assert.ok(!html.includes("<iframe"));
  assert.match(html, /data-action="preview-activity"[^>]*data-map-stop="restaurant"/);
});
test("selected activity uses only the free place embed with its entered location", () => {
  const t = trip(), html = panels(t, {tripId:"trip", stopId:"restaurant", locationIndex:0}).itineraryPanel(t);
  assert.equal((html.match(/<iframe/g) || []).length, 1);
  assert.match(html, /google\.com\/maps\/embed\/v1\/place\?/);
  assert.equal(previewQueries(html).embed, "Punjabi Rasoi - Brickfields, Kuala Lumpur, Malaysia");
  assert.match(html, /referrerpolicy="strict-origin-when-cross-origin"/);
  assert.match(html, /aria-pressed="true"/);
  assert.ok(!html.includes("places.googleapis.com"));
});
test("tour preview starts with its first nonblank stop and can show another stop", () => {
  const t = trip();
  const first = panels(t, {tripId:"trip",stopId:"tour"}).itineraryPanel(t);
  assert.match(first, /data-itinerary-map-location/);
  assert.ok(first.includes("Petronas+Twin+Towers"));
  const second = panels(t, {tripId:"trip",stopId:"tour",locationIndex:1}).itineraryPanel(t);
  assert.ok(second.includes("q=KLCC+Park"));
  assert.ok(!second.includes("/embed/v1/directions"));
});
test("unconfigured maps, empty locations and stale selections never load an iframe", () => {
  const t = trip();
  for (const [selection,key] of [
    [{tripId:"trip",stopId:"restaurant"},"__MAPS_EMBED_API_KEY__"],
    [{tripId:"trip",stopId:"empty"},"test-key"],
    [{tripId:"other",stopId:"restaurant"},"test-key"],
    [{tripId:"trip",stopId:"deleted"},"test-key"],
  ]) assert.ok(!panels(t,selection,key).itineraryPanel(t).includes("<iframe"));
  assert.match(panels(t,{tripId:"trip",stopId:"restaurant"},"").itineraryPanel(t), /Open in Google Maps/);
});


test("itinerary meals preview their venue without an external-link click or trip mutation", () => {
  const t=trip();
  t.foodPlaces=[{id:"restaurant",venue:"Jollibee Brickfields",mealType:"Lunch",visitDate:"2026-10-24",time:"12:30",durationMinutes:45,notes:"Window seat"}];
  const before=structuredClone(t);
  const html=panels(t,{tripId:"trip",stopId:"restaurant",entryType:"meal"}).itineraryPanel(t);
  assert.equal((html.match(/<iframe/g)||[]).length,1);
  assert.equal(previewQueries(html).embed, "Jollibee Brickfields, Kuala Lumpur, Malaysia");
  assert.match(html,/data-map-meal="restaurant"/);
  assert.match(html,/data-map-type="meal"[^>]*aria-controls="itinerary-location-preview" aria-pressed="true"/);
  assert.ok(!html.includes('>Jollibee Brickfields</a>'));
  assert.deepEqual(t,before);
  t.foodPlaces[0].venue="";
  assert.ok(!panels(t,{tripId:"trip",stopId:"restaurant",entryType:"meal"}).itineraryPanel(t).includes("<iframe"));
  t.foodPlaces=[];
  assert.ok(!panels(t,{tripId:"trip",stopId:"restaurant",entryType:"meal"}).itineraryPanel(t).includes("<iframe"));
});

for (const entryType of ["meal", "activity", "tour"]) {
  test(`${entryType} in a stopover city never inherits the overall trip destination`, () => {
    const t = trip();
    t.destination = "Chiang Mai, Thailand";
    t.foodPlaces = [{id:"breakfast", venue:"Punjabi Rasoi - Brickfields", mealType:"Breakfast", visitDate:"2026-10-24", time:"10:30", durationMinutes:60}];
    const selection = {tripId:t.id, stopId:entryType === "meal" ? "breakfast" : entryType === "tour" ? "tour" : "restaurant",
      ...(entryType === "meal" ? {entryType:"meal"} : {})};
    const expected = entryType === "tour" ? "Petronas Twin Towers" : "Punjabi Rasoi - Brickfields",
      before = structuredClone(t), html = panels(t, selection).itineraryPanel(t);
    const contextual = `${expected}, Kuala Lumpur, Malaysia`;
    assert.deepEqual(previewQueries(html), {embed:contextual, external:contextual});
    assert.deepEqual(t, before);
  });
}

test("explicit addresses and punctuation are preserved identically in both map links", () => {
  const t = trip();
  t.destination = "Chiang Mai, Thailand";
  t.days[0].stops[0].location = "  Cafe & Bakery, 45 Jalan Thambipillay, Brickfields, Kuala Lumpur, Malaysia  ";
  const html = panels(t, {tripId:t.id, stopId:"restaurant"}).itineraryPanel(t),
    expected = t.days[0].stops[0].location.trim();
  assert.deepEqual(previewQueries(html), {embed:expected, external:expected});
});
