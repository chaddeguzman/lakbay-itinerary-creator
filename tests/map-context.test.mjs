import test from "node:test";
import assert from "node:assert/strict";
import { activityMapSelection } from "../scripts/itinerary-map.js";
import { createPanelRenderers } from "../scripts/render-panels.js";

function trip() {
  return {id:"trip",destination:"Chiang Mai, Thailand",foodPlaces:[
    {id:"breakfast",venue:"Punjabi Rasoi - Brickfields",visitDate:"2026-10-24",time:"10:30"},
    {id:"dinner",venue:"Jollibee Brickfield",visitDate:"2026-10-24",time:"19:00"},
  ],foodLibrary:[],days:[{id:"kl",date:"2026-10-24",stops:[
    {id:"airport",kind:"activity",location:"Kuala Lumpur International Airport",time:"06:00"},
    {id:"hotel",kind:"activity",location:"Easy Hotel KL Sentral",time:"10:00"},
    {id:"tour",kind:"tour",tourLocations:["Petronas Twin Towers","KLCC Park"],time:"14:00",endTime:"17:00"},
    {id:"return",kind:"activity",location:"Easy Hotel KL Sentral",time:"18:00"},
  ]}]};
}
const meal=(t,id="dinner")=>activityMapSelection(t,{tripId:t.id,stopId:id,entryType:"meal"});
function panels(t) {
  globalThis.window={};
  return createPanelRenderers({CATEGORIES:[],PACK_CATEGORIES:[],Storage:{active:()=>t,read:()=>({ui:{collapsedDaysByTrip:{}}})},
    esc:v=>String(v??""),dayDateLabel:String,fmt:String,money:String,editingActivities:new Set(),openMealCards:new Set(),getTab:()=>"itinerary",today:()=>"2026-10-24",
    mapsEmbedKey:"test-key",getMapSelection:()=>({tripId:t.id,stopId:"dinner",entryType:"meal"})});
}
test("venue-only stopover meals use existing locations nearest their scheduled time",()=>{
  const t=trip(),before=structuredClone(t);
  assert.equal(meal(t,"breakfast").query,"Punjabi Rasoi - Brickfields near Easy Hotel KL Sentral");
  assert.equal(meal(t).query,"Jollibee Brickfield near Easy Hotel KL Sentral");
  assert.deepEqual(t,before);
});
test("meal's own location takes precedence over nearby roots and obsolete map metadata",()=>{
  const t=trip();Object.assign(t.foodPlaces[1],{location:"Jalan Tun Sambanthan, Kuala Lumpur, Malaysia",mapCity:"Manila",mapCountry:"Philippines"});
  assert.equal(meal(t).query,"Jollibee Brickfield, Jalan Tun Sambanthan, Kuala Lumpur, Malaysia");
});
test("saved-place location is reused by explicit link or an unambiguous venue match",()=>{
  const t=trip();t.foodLibrary=[{id:"saved",venue:"Jollibee Brickfield",location:"Brickfields, Kuala Lumpur, Malaysia"}];
  assert.equal(meal(t).query,"Jollibee Brickfield, Brickfields, Kuala Lumpur, Malaysia");
  t.foodPlaces[1].savedPlaceId="saved";t.foodPlaces[1].venue="Dinner";
  assert.equal(meal(t).query,"Dinner, Brickfields, Kuala Lumpur, Malaysia");
});
test("duplicate saved venues do not arbitrarily choose a branch",()=>{
  const t=trip();t.foodLibrary=[{venue:"Jollibee Brickfield",location:"Manila"},{venue:"Jollibee Brickfield",location:"Malaysia"}];
  assert.equal(meal(t).query,"Jollibee Brickfield near Easy Hotel KL Sentral");
});
test("activities and each tour destination use their actual location unchanged",()=>{
  const t=trip();t.days[0].mapCity="Manila";t.days[0].mapCountry="Philippines";
  assert.equal(activityMapSelection(t,{tripId:t.id,stopId:"hotel"}).query,"Easy Hotel KL Sentral");
  assert.equal(activityMapSelection(t,{tripId:t.id,stopId:"tour",locationIndex:1}).query,"KLCC Park");
});
test("same-day geography follows time across borders without borrowing another day or trip",()=>{
  const t=trip();t.days[0].stops.push({id:"evening",location:"Changi Airport, Singapore",time:"18:30"});
  assert.equal(meal(t).query,"Jollibee Brickfield near Changi Airport, Singapore");
  t.foodPlaces[1].visitDate="2026-10-25";
  assert.equal(meal(t).query,"");
});
test("a venue-only meal without local roots does not send a viewer-biased search",()=>{
  const t=trip();t.days[0].stops=[];
  assert.equal(meal(t).query,"");
  assert.doesNotMatch(panels(t).itineraryMapPanel(t),/<iframe|itinerary-map-open/);
});
test("Food, Travel Day and preview share root-derived queries; no manual map fields remain",()=>{
  const t=trip(),render=panels(t);
  for(const html of [render.itineraryPanel(t),render.foodPanel(t)])
    assert.doesNotMatch(html,/mapCity|mapCountry|Set day location|Map location for this day/);
  assert.match(render.foodPanel(t),/query=Jollibee%20Brickfield%20near%20Easy%20Hotel%20KL%20Sentral/);
  assert.match(render.travelDayContent(t,"kl",{todayIso:"2026-10-24",nowMinutes:0}),/query=Jollibee%20Brickfield%20near%20Easy%20Hotel%20KL%20Sentral/);
  assert.match(render.mapsPanel(t),/KLCC\+Park/);
});

test("punctuation does not turn a rootless venue into a geographic location",()=>{
 const t=trip();t.days[0].stops=[];t.foodPlaces[1].venue="Burger King, Drive Thru";
 assert.equal(meal(t).query,"");
});
test("first upcoming root is used before the first activity, and untimed ambiguity stays blocked",()=>{
 const t=trip();t.foodPlaces[1].time="05:00";
 assert.equal(meal(t).query,"Jollibee Brickfield near Kuala Lumpur International Airport");
 t.foodPlaces[1].time="";assert.equal(meal(t).query,"");
 t.days[0].stops=[{location:"Easy Hotel KL Sentral"}];
 assert.equal(meal(t).query,"Jollibee Brickfield near Easy Hotel KL Sentral");
});
test("location-only meals keep a meaningful preview label",()=>{
 const t=trip();t.foodPlaces[1].venue="";t.foodPlaces[1].location="Brickfields, Kuala Lumpur, Malaysia";
 assert.equal(meal(t).location,"Brickfields, Kuala Lumpur, Malaysia");
 assert.match(panels(t).itineraryMapPanel(t),/title="Map of Brickfields, Kuala Lumpur, Malaysia"/);
});

test("a meal after a tour uses its final destination",()=>{
 const t=trip();t.days[0].stops=[{kind:"tour",time:"10:00",endTime:"17:00",tourLocations:["Johor Bahru, Malaysia","Woodlands, Singapore"]}];
 assert.equal(meal(t).query,"Jollibee Brickfield near Woodlands, Singapore");
});
