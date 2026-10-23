import test from "node:test";
import assert from "node:assert/strict";
import { activityMapSelection } from "../scripts/itinerary-map.js";
import { normalizeTrip } from "../scripts/state.js";
import { createPanelRenderers } from "../scripts/render-panels.js";

function trip() {
  return {id:"trip", destination:"Chiang Mai, Thailand", foodPlaces:[
    {id:"breakfast",venue:"Punjabi Rasoi - Brickfields",visitDate:"2026-10-24"},
    {id:"dinner",venue:"Jollibee Brickfield",visitDate:"2026-10-24"},
    {id:"other",venue:"Jollibee",visitDate:"2026-10-25"},
  ], foodLibrary:[], days:[
    {id:"kl",date:"2026-10-24",mapCity:"Kuala Lumpur",mapCountry:"Malaysia",stops:[
      {id:"activity",kind:"activity",location:"KL Sentral"},
      {id:"tour",kind:"tour",tourLocations:["Petronas Twin Towers","KLCC Park"]},
    ]},
    {id:"cnx",date:"2026-10-25",mapCity:"Chiang Mai",mapCountry:"Thailand",stops:[]},
  ]};
}
const meal = (t, id) => activityMapSelection(t,{tripId:t.id,stopId:id,entryType:"meal"});
function panels(t) {
  globalThis.window = {};
  return createPanelRenderers({CATEGORIES:[],PACK_CATEGORIES:[],Storage:{active:()=>t,read:()=>({ui:{collapsedDaysByTrip:{}}})},
    esc:value=>String(value??"").replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;"),
    dayDateLabel:String,fmt:String,money:String,editingActivities:new Set(),openMealCards:new Set(),getTab:()=>"itinerary",today:()=>"2026-10-24",
    mapsEmbedKey:"test-key",getMapSelection:()=>({tripId:t.id,stopId:"dinner",entryType:"meal"})});
}

test("stopover restaurants use their visit day's city and country", () => {
  const t=trip(), before=structuredClone(t);
  assert.equal(meal(t,"breakfast").query,"Punjabi Rasoi - Brickfields, Kuala Lumpur, Malaysia");
  assert.equal(meal(t,"dinner").query,"Jollibee Brickfield, Kuala Lumpur, Malaysia");
  assert.equal(meal(t,"other").query,"Jollibee, Chiang Mai, Thailand");
  assert.deepEqual(t,before);
});
test("activities and every selected tour stop use their owning day's context", () => {
  const t=trip();
  assert.equal(activityMapSelection(t,{tripId:t.id,stopId:"activity"}).query,"KL Sentral, Kuala Lumpur, Malaysia");
  assert.equal(activityMapSelection(t,{tripId:t.id,stopId:"tour",locationIndex:1}).query,"KLCC Park, Kuala Lumpur, Malaysia");
});
test("entry override wins for cross-border entries and does not mix partial contexts", () => {
  const t=trip(), entry=t.days[0].stops[0];
  entry.location="NAIA Terminal 1"; entry.mapCity="Manila"; entry.mapCountry="Philippines";
  assert.equal(activityMapSelection(t,{tripId:t.id,stopId:entry.id}).query,"NAIA Terminal 1, Manila, Philippines");
  entry.mapCountry="";
  assert.equal(activityMapSelection(t,{tripId:t.id,stopId:entry.id}).query,"");
  entry.mapCity="";
  assert.equal(activityMapSelection(t,{tripId:t.id,stopId:entry.id}).query,"NAIA Terminal 1, Kuala Lumpur, Malaysia");
  t.foodPlaces[1].mapCity="Manila";t.foodPlaces[1].mapCountry="Philippines";
  assert.equal(meal(t,"dinner").query,"Jollibee Brickfield, Manila, Philippines");
});
test("missing day location never falls back to trip destination or an unqualified query", () => {
  const t=trip(); delete t.days[0].mapCountry;
  assert.equal(meal(t,"dinner").query,"");
  assert.equal(activityMapSelection(t,{tripId:t.id,stopId:"activity"}).query,"");
  t.foodPlaces[1].visitDate="";
  assert.equal(meal(t,"dinner").query,"");
  t.foodPlaces[1].mapCity="Kuala Lumpur";t.foodPlaces[1].mapCountry="Malaysia";
  assert.equal(meal(t,"dinner").query,"Jollibee Brickfield, Kuala Lumpur, Malaysia");
});
test("explicit address context is preserved without repeating comma-separated city and country", () => {
  const t=trip();t.foodPlaces[1].venue="Jollibee, Kuala Lumpur, Malaysia";
  assert.equal(meal(t,"dinner").query,"Jollibee, Kuala Lumpur, Malaysia");
});
test("normalization and JSON backup retain context without guessing for legacy days", () => {
  const t=trip();t.days[0].mapCity="  Kuala Lumpur  ";t.days[0].mapCountry=" Malaysia ";
  t.foodPlaces[1].mapCity=" Manila ";t.foodPlaces[1].mapCountry=" Philippines ";
  t.days[0].stops[0].mapCity=" Manila ";t.days[0].stops[0].mapCountry=" Philippines ";
  delete t.days[1].mapCity;delete t.days[1].mapCountry;
  normalizeTrip(t);
  const restored=normalizeTrip(JSON.parse(JSON.stringify(t)));
  assert.equal(restored.days[0].mapCity,"Kuala Lumpur");
  assert.equal(restored.days[0].mapCountry,"Malaysia");
  assert.equal(restored.foodPlaces[1].mapCountry,"Philippines");
  assert.equal(restored.days[0].stops[0].mapCountry,"Philippines");
  assert.equal(restored.days[1].mapCity,"");assert.equal(restored.days[1].mapCountry,"");
});
test("missing context shows an actionable prompt without an embedded or external map request", () => {
  const t=trip();delete t.days[0].mapCountry;
  const html=panels(t).itineraryMapPanel(t);
  assert.match(html,/Set the city and country for this day/);
  assert.match(html,/data-action="set-day-map-location"/);
  assert.doesNotMatch(html,/<iframe|itinerary-map-open/);
});
test("Food links and Travel Day routes use the same daily context", () => {
  const t=trip();t.foodPlaces[1].mealType="Dinner";t.foodPlaces[1].time="19:00";
  const render=panels(t),food=render.foodPanel(t),travel=render.travelDayContent(t,"kl",{todayIso:"2026-10-24",nowMinutes:0});
  assert.match(food,/query=Jollibee%20Brickfield%2C%20Kuala%20Lumpur%2C%20Malaysia/);
  assert.match(travel,/query=Jollibee%20Brickfield%2C%20Kuala%20Lumpur%2C%20Malaysia/);
  assert.match(render.mapsPanel(t),/KLCC\+Park%2C\+Kuala\+Lumpur%2C\+Malaysia/);
});
test("daily city and country inputs are escaped and remain available on both planning tabs", () => {
  const t=trip();t.days[0].mapCity='KL"><script>bad</script>';
  for(const html of [panels(t).itineraryPanel(t),panels(t).foodPanel(t)]) {
    assert.match(html,/aria-label="Day map city"/);
    assert.match(html,/aria-label="Day map country"/);
    assert.match(html,/KL&quot;&gt;&lt;script&gt;bad&lt;\/script&gt;/);
    assert.doesNotMatch(html,/<script>bad/);
  }
});
test("a day route cannot silently omit a stop with an incomplete override", () => {
  const t=trip();t.days[0].stops.push({id:"border",kind:"activity",activity:"Border stop",location:"Woodlands Checkpoint",mapCity:"Singapore",mapCountry:""});
  const html=panels(t).mapsPanel(t);
  assert.match(html,/Woodlands Checkpoint/);
  assert.match(html,/Complete the map city and country for every stop/);
  assert.doesNotMatch(html,/>Open day route</);
});
