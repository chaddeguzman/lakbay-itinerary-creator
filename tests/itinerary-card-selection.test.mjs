import test from "node:test";
import assert from "node:assert/strict";
import * as map from "../scripts/itinerary-map.js";

function fixture() {
  assert.equal(typeof map.bindItineraryCardSelection, "function");
  const listeners = new Map(), selected = [], expanded = new Set();
  const root = { addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []),fn]); } };
  const meal = { dataset:{mapMeal:"lunch"} };
  const card = { dataset:{stop:"tour"}, classList:{toggle:name=>expanded.has(name)?expanded.delete(name):expanded.add(name)} };
  function target(kind) {
    return { closest(selector) {
      if (selector === "[data-map-card]") return kind === "meal" ? null : card;
      if (selector === "[data-map-meal]") return kind === "meal" ? meal : null;
      if (selector === ".activity-drag-handle") return kind === "handle" ? this : null;
      if (selector === ".activity-compact") return kind === "meal" ? null : card;
      if (selector === "button,a,input,select,textarea,label") return ["control","handle"].includes(kind) ? this : null;
      return null;
    } };
  }
  function fire(type, kind) {
    const e = {target:target(kind), preventDefault(){this.prevented=true;}, stopImmediatePropagation(){this.stopped=true;} };
    for (const fn of listeners.get(type) || []) {fn(e); if(e.stopped)break;}
    return e;
  }
  map.bindItineraryCardSelection(root,{selectActivity:id=>selected.push(id)});
  return {fire,selected,expanded};
}

test("card text and editor controls select a map without blocking their normal action", () => {
  const f=fixture();
  for (const kind of ["time","duration","title","location","notes","control"]) {
    const e=f.fire("click",kind);
    assert.notEqual(e.prevented,true);
  }
  assert.deepEqual(f.selected,Array(6).fill("tour"));
  f.fire("click","handle");
  assert.equal(f.selected.length,6);
});

test("only a right-edge handle can start a native itinerary drag", () => {
  const f=fixture();
  for(const kind of ["time","title","control"]) assert.equal(f.fire("dragstart",kind).prevented,true);
  assert.notEqual(f.fire("dragstart","handle").prevented,true);
});

test("drag-release click is suppressed and a fresh click still selects", () => {
  const f=fixture();
  f.fire("dragstart","handle"); f.fire("dragend","handle");
  assert.equal(f.fire("click","title").stopped,true);
  assert.deepEqual(f.selected,[]);
  f.fire("pointerdown","time"); f.fire("click","time");
  assert.deepEqual(f.selected,["tour"]);
});


test("keyboard activation after a drag is treated as a fresh selection", () => {
  const f=fixture();
  f.fire("dragstart","handle"); f.fire("dragend","handle");
  f.fire("keydown","title"); f.fire("click","title");
  assert.deepEqual(f.selected,["tour"]);
});

test("reselecting a card preserves the same map state and chosen tour stop", () => {
  assert.equal(typeof map.selectActivityMap, "function");
  const selected = {tripId:"trip",stopId:"tour",locationIndex:2};
  assert.equal(map.selectActivityMap(selected,"trip","tour"),selected);
  assert.deepEqual(map.selectActivityMap(selected,"trip","activity"),{tripId:"trip",stopId:"activity",locationIndex:0});
  assert.deepEqual(map.selectActivityMap(selected,"other","tour"),{tripId:"other",stopId:"tour",locationIndex:0});
});


test("meal clicks select the shared map without blocking native details controls", () => {
  const f=fixture(), event=f.fire("click","meal");
  assert.deepEqual(f.selected,["lunch"]);
  assert.notEqual(event.prevented,true);
  const current={tripId:"trip",stopId:"same",locationIndex:0};
  assert.notEqual(map.selectActivityMap(current,"trip","same","meal"),current);
  assert.equal(map.selectActivityMap({...current,entryType:"meal"},"trip","same","meal").entryType,"meal");
});
