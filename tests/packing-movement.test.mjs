import test from "node:test";
import assert from "node:assert/strict";
import { bindPackingMovement } from "../scripts/packing.js";

function fixture() {
  const categories = ["essentials", "attire", "electronics", "toiletries", "misc"];
  function node() {
    const handlers = new Map(), classes = new Set();
    return {
      dataset: {}, style: {}, attrs: {}, isConnected: true,
      classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name), toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
      addEventListener(type, handler) { handlers.set(type, [...(handlers.get(type) || []), handler]); },
      fire(type, input = {}) {
        const event = { target: this, button: 0, pointerId: 1, pointerType: "mouse", clientX: 100, clientY: 100,
          preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...input };
        for (const handler of handlers.get(type) || []) { handler(event); if (event.stopped) break; }
        return event;
      },
      setAttribute(name, value) { this.attrs[name] = value; },
      focus() { this.focused = true; }, scrollIntoView() { this.scrolled = true; },
      closest() { return null; }, querySelector() { return null; }, remove() { this.removed = true; },
    };
  }
  const root = node(), doc = node(), view = node(), card = node(), handle = node(), label = node(), status = node();
  const groups = categories.map((category) => {
    const group = node(); group.dataset.packingCategory = category;
    group.closest = (selector) => selector === "[data-packing-category]" ? group : null;
    return group;
  });
  let hit = groups[1], frame, timeout;
  const moves = [], scrolls = [], ghosts = [];
  label.value = "Linen shirt";
  card.dataset.item = "shirt";
  card.closest = (selector) => selector === "[data-packing-category]" ? groups[0] :
    [".packing-item", "[data-item]"].includes(selector) ? card : null;
  handle.closest = (selector) => selector === "[data-packing-move]" ? handle :
    ["button", "input, textarea, button"].includes(selector) ? handle : card.closest(selector);
  label.closest = (selector) => selector === "input, textarea, button" ? label : card.closest(selector);
  card.querySelector = (selector) => selector === "textarea" ? label : selector === "[data-packing-move]" ? handle : null;
  root.querySelectorAll = (selector) => selector === "[data-packing-category]" ? groups : [handle];
  root.querySelector = () => status;
  root.contains = (target) => groups.includes(target);
  root.setPointerCapture = (id) => { root.captured = id; };
  root.hasPointerCapture = (id) => root.captured === id;
  root.releasePointerCapture = () => { root.captured = null; root.fire("lostpointercapture"); };
  root.ownerDocument = doc;
  doc.defaultView = view;
  doc.elementFromPoint = () => hit;
  doc.body = { append: (ghost) => ghosts.push(ghost) };
  doc.createElement = node;
  view.innerHeight = 800;
  view.requestAnimationFrame = (callback) => { frame = callback; return 1; };
  view.cancelAnimationFrame = () => { frame = null; };
  view.setTimeout = (callback) => { timeout = callback; };
  view.scrollBy = (x, y) => scrolls.push(y);
  bindPackingMovement(root, { categories, moveItem: (id, category) => { moves.push([id, category]); return true; } });
  return { root, doc, view, card, handle, label, status, groups, moves, scrolls, ghosts,
    hit: (target) => { hit = target; }, tick: () => frame?.(), timeout: () => timeout?.(),
    key: (key) => root.fire("keydown", { target: handle, key }) };
}

test("keyboard movement highlights a destination and commits only on Enter", () => {
  const f = fixture();
  f.key(" "); f.key("ArrowRight");
  assert.equal(f.groups[1].classList.contains("packing-drop-target"), true);
  assert.deepEqual(f.moves, []);
  f.key("Enter");
  assert.deepEqual(f.moves, [["shirt", "attire"]]);
  assert.equal(f.handle.focused, true);
  assert.equal(f.handle.attrs["aria-pressed"], "false");
  assert.match(f.status.textContent, /moved to Attire/);
});

test("Escape, Tab and window blur cancel keyboard selection without a write", () => {
  for (const action of [f => f.doc.fire("keydown", { key: "Escape" }), f => f.key("Tab"), f => f.view.fire("blur")]) {
    const f = fixture(); f.key(" "); f.key("ArrowLeft"); action(f);
    assert.deepEqual(f.moves, []);
    assert.ok(f.groups.every(group => !group.classList.contains("packing-drop-target")));
    assert.equal(f.handle.attrs["aria-pressed"], "false");
  }
});

test("a grip click then section click supports movement without dragging", () => {
  const f = fixture();
  f.root.fire("click", { target: f.handle });
  f.root.fire("click", { target: f.groups[1] });
  assert.deepEqual(f.moves, [["shirt", "attire"]]);
});

test("mouse and touch drags move into an empty section and suppress the release click", () => {
  for (const pointerType of ["mouse", "touch"]) {
    const f = fixture();
    f.root.fire("pointerdown", { target: f.handle, pointerType });
    f.doc.fire("pointermove", { clientX: 200, pointerType });
    assert.equal(f.root.captured, 1);
    assert.equal(f.groups[1].classList.contains("packing-drop-target"), true);
    f.doc.fire("pointerup", { clientX: 200, pointerType });
    assert.deepEqual(f.moves, [["shirt", "attire"]]);
    assert.equal(f.ghosts[0].removed, true);
    assert.equal(f.root.captured, null);
    assert.equal(f.root.fire("click", { target: f.handle }).stopped, true);
    assert.equal(f.handle.attrs["aria-pressed"], "false");
    f.timeout();
    assert.notEqual(f.root.fire("click", { target: f.handle }).stopped, true);
  }
});

test("an outside drop, cancelled pointer or another finger never commits a move", () => {
  const f = fixture();
  f.root.fire("pointerdown", { target: f.handle, pointerType: "touch" });
  f.doc.fire("pointermove", { pointerId: 2, clientX: 200 });
  f.doc.fire("pointerup", { pointerId: 2 });
  assert.deepEqual(f.moves, []);
  f.doc.fire("pointermove", { clientX: 200 });
  f.doc.fire("pointercancel");
  assert.deepEqual(f.moves, []);
  f.root.fire("pointerdown", { target: f.handle });
  f.hit(null);
  f.doc.fire("pointermove", { clientX: 200 });
  f.doc.fire("pointerup", { clientX: 200 });
  assert.deepEqual(f.moves, []);
});

test("editing fields stay editable and short pointer motion does not start a drag", () => {
  const f = fixture();
  f.root.fire("pointerdown", { target: f.label });
  f.doc.fire("pointermove", { clientX: 200 });
  assert.equal(f.ghosts.length, 0);
  f.root.fire("pointerdown", { target: f.handle });
  f.doc.fire("pointermove", { clientX: 103 }); f.doc.fire("pointerup");
  assert.equal(f.ghosts.length, 0);
  assert.deepEqual(f.moves, []);
});

test("touch dragging scrolls near the viewport edge and stops after completion", () => {
  const f = fixture();
  f.root.fire("pointerdown", { target: f.handle, pointerType: "touch" });
  f.doc.fire("pointermove", { clientX: 200, clientY: 790 }); f.tick();
  assert.deepEqual(f.scrolls, [10]);
  f.doc.fire("pointerup", { clientX: 200, clientY: 790 }); f.tick();
  assert.deepEqual(f.scrolls, [10]);
});

test("touch capture transferring from the grip to the root does not cancel the drag", () => {
  const f = fixture();
  f.root.fire("pointerdown", { target: f.handle, pointerType: "touch" });
  f.doc.fire("pointermove", { clientX: 200, pointerType: "touch" });
  f.root.fire("lostpointercapture", { target: f.handle, pointerId: 1 });
  f.root.fire("lostpointercapture", { target: f.root, pointerId: 2 });
  f.doc.fire("pointerup", { clientX: 200, pointerType: "touch" });
  assert.deepEqual(f.moves, [["shirt", "attire"]]);
});
