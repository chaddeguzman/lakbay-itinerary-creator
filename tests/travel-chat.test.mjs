import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Run the real browser controller with only its DOM boundary substituted.
function widget(width = 1000, height = 800) {
  function element(rect = {}) {
    const listeners = new Map();
    const classes = new Set();
    return {
      style: {}, hidden: false, attributes: {},
      classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
      addEventListener(type, handler) {
        const handlers = listeners.get(type) || [];
        handlers.push(handler);
        listeners.set(type, handlers);
      },
      removeEventListener(type, handler) {
        listeners.set(type, (listeners.get(type) || []).filter(item => item !== handler));
      },
      fire(type, event = {}) {
        for (const handler of [...(listeners.get(type) || [])]) {
          handler({ target: this, currentTarget: this, preventDefault() {}, ...event });
        }
      },
      setAttribute(name, value) { this.attributes[name] = value; },
      closest() { return null; },
      querySelector() { return null; },
      focus() { this.focused = true; },
      getBoundingClientRect() {
        const left = parseFloat(this.style.left) || rect.left || 0;
        const top = parseFloat(this.style.top) || rect.top || 0;
        const height = Math.min(rect.height || 104, parseFloat(this.style.maxHeight) || Infinity);
        const width = Math.min(rect.width || 104, parseFloat(this.style.maxWidth) || Infinity);
        return { left, top, width, height, right: left + width, bottom: top + height };
      }
    };
  }
  const container = element({ left: width - 124, top: height - 128 });
  const toggle = element();
  toggle.getBoundingClientRect = () => container.getBoundingClientRect();
  const panel = element({ width: Math.min(370, width - 24), height: Math.min(672, height - 24) });
  panel.hidden = true;
  const close = element(), form = element(), input = element(), messages = element();
  const nodes = { '.travel-chat': container, '#travelChatToggle': toggle,
    '#travelChatPanel': panel, '#travelChatClose': close, '#travelChatForm': form,
    '#travelChatInput': input, '#travelChatMessages': messages };
  const document = element();
  document.documentElement = { lang: 'en' };
  document.querySelector = selector => nodes[selector];
  const window = element();
  Object.assign(window, { innerWidth: width, innerHeight: height });
  vm.runInNewContext(readFileSync(new URL('../gemini_travel_api.js', import.meta.url), 'utf8'), {
    document, window, console, setTimeout, clearTimeout,
    requestAnimationFrame: callback => callback()
  });
  return { container, toggle, panel, close, input, document, window };
}

test('click toggles chat with accessible state and Escape closes it', () => {
  const w = widget();
  w.toggle.fire('click');
  assert.equal(w.panel.hidden, false);
  assert.equal(w.toggle.attributes['aria-expanded'], 'true');
  assert.equal(w.input.focused, true);
  w.toggle.fire('click');
  assert.equal(w.panel.hidden, true);
  w.toggle.fire('click');
  w.document.fire('keydown', { key: 'Escape' });
  assert.equal(w.panel.hidden, true);
});

test('opening near the top left keeps the mascot stationary and panel on screen', () => {
  const w = widget();
  w.container.style.left = '12px';
  w.container.style.top = '12px';
  w.toggle.fire('click');
  assert.equal(w.container.style.left, '12px');
  assert.equal(w.container.style.top, '12px');
  const panel = w.panel.getBoundingClientRect();
  assert.ok(panel.left >= 12 && panel.right <= w.window.innerWidth - 12);
  assert.ok(panel.top >= 12 && panel.bottom <= w.window.innerHeight - 12);
});

test('dragging clamps the mascot and does not toggle chat on release', () => {
  const w = widget();
  w.toggle.fire('pointerdown', { button: 0, pointerId: 1, clientX: 900, clientY: 700 });
  w.document.fire('pointermove', { pointerId: 1, clientX: -500, clientY: -500 });
  w.document.fire('pointerup', { pointerId: 1 });
  w.toggle.fire('click');
  assert.equal(w.panel.hidden, true);
  assert.equal(w.container.style.left, '12px');
  assert.equal(w.container.style.top, '12px');
});

test('resize keeps an open widget reachable on a phone', () => {
  const w = widget(390, 844);
  w.toggle.fire('click');
  w.window.innerWidth = 320;
  w.window.innerHeight = 568;
  w.window.fire('resize');
  const mascot = w.toggle.getBoundingClientRect();
  assert.ok(mascot.left >= 12 && mascot.right <= 308);
  assert.ok(mascot.top >= 12 && mascot.bottom <= 556);
});

test('panel never covers the mascot at desktop or middle of a phone screen', () => {
  for (const [width, height, top] of [[1000, 800, 672], [390, 844, 370]]) {
    const w = widget(width, height);
    w.container.style.top = `${top}px`;
    w.toggle.fire('click');
    const p = w.panel.getBoundingClientRect(), m = w.toggle.getBoundingClientRect();
    assert.ok(p.right <= m.left || p.left >= m.right || p.bottom <= m.top || p.top >= m.bottom,
      `panel overlaps mascot at ${width}x${height}`);
    assert.ok(p.top >= 12 && p.bottom <= height - 12);
  }
});

test('touch drag ignores other fingers and keeps the open panel beside the mascot', () => {
  const w = widget();
  w.toggle.fire('click');
  w.toggle.fire('pointerdown', { button: 0, pointerId: 1, pointerType: 'touch', clientX: 900, clientY: 700 });
  w.document.fire('pointermove', { pointerId: 2, clientX: 50, clientY: 50 });
  assert.equal(w.container.style.left, undefined);
  w.document.fire('pointermove', { pointerId: 1, clientX: 50, clientY: 50 });
  w.document.fire('pointercancel', { pointerId: 1 });
  assert.equal(w.panel.hidden, false);
  assert.equal(w.container.style.left, '26px');
  const p = w.panel.getBoundingClientRect(), m = w.toggle.getBoundingClientRect();
  assert.ok(p.top >= m.bottom || p.left >= m.right);
});

test('short landscape uses a narrower side panel with room for the chat controls', () => {
  const w = widget(568, 320);
  w.container.style.left = '232px';
  w.container.style.top = '108px';
  w.toggle.fire('click');
  const p = w.panel.getBoundingClientRect(), m = w.toggle.getBoundingClientRect();
  assert.ok(p.height >= 240);
  assert.ok(p.right <= m.left || p.left >= m.right);
});
