import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Exercise the actual delegated handler without starting the full browser app.
const app = readFileSync(new URL("../scripts/app.js", import.meta.url), "utf8");
function dragover(dayId = "day") {
  let handler;
  const highlighted = new Set();
  const target = {dataset: {stop: "target"}, closest: selector => selector === "[data-day]" ? {dataset: {day: dayId}} : null,
    classList: {add: name => highlighted.add(name)}};
  const event = {target: {closest: selector => selector === "[data-stop]" ? target : null}, dataTransfer: {},
    preventDefault() {this.prevented = true;}};
  const main = {addEventListener: (type, fn) => handler = fn, querySelectorAll: () => []};
  const code = app.match(/main.addEventListener\("dragover",[\s\S]*?\n  \}\);/)[0];
  new Function("main", "dragState", code)(main, {dayId: "day", stopId: "source"});
  handler(event);
  return {event, highlighted};
}

test("a collapsed summary accepts a same-day native drop and highlights its wrapper", () => {
  const {event, highlighted} = dragover();
  assert.equal(event.prevented, true);
  assert.equal(event.dataTransfer.dropEffect, "move");
  assert.equal(highlighted.has("drag-over"), true);
});

test("a card in another day does not accept a drop", () => {
  assert.notEqual(dragover("other-day").event.prevented, true);
});
