// Delegated controls survive panel re-renders; only a completed move writes data.
export function bindPackingMovement(root, { categories, moveItem }) {
  const doc = root.ownerDocument, view = doc.defaultView;
  let pending = null, moving = null, ghost = null, frame = null, suppressClick = false;
  const groups = () => [...root.querySelectorAll("[data-packing-category]")];
  const announce = (message) => {
    const status = root.querySelector("[data-packing-status]");
    if (status) status.textContent = message;
  };
  const title = (category) => category[0].toUpperCase() + category.slice(1);
  function highlight(category) {
    moving.category = category;
    groups().forEach((group) => group.classList.toggle("packing-drop-target", group.dataset.packingCategory === category));
  }
  function start(card, mode) {
    const handle = card.querySelector("[data-packing-move]");
    moving = { card, mode, id: card.dataset.item, label: card.querySelector("textarea").value,
      category: card.closest("[data-packing-category]").dataset.packingCategory };
    card.classList.add("packing-moving");
    if (mode === "pointer") card.classList.add("packing-pointer-source");
    handle.setAttribute("aria-pressed", "true");
    highlight(moving.category);
    announce(`Moving ${moving.label}. Choose a section; Escape cancels.`);
  }
  function clear() {
    if (frame !== null) view.cancelAnimationFrame(frame);
    frame = null;
    const pointerId = pending?.pointerId;
    pending = null;
    if (pointerId !== undefined && root.hasPointerCapture?.(pointerId)) root.releasePointerCapture(pointerId);
    moving?.card.classList.remove("packing-moving");
    moving?.card.classList.remove("packing-pointer-source");
    moving?.card.querySelector("[data-packing-move]")?.setAttribute("aria-pressed", "false");
    groups().forEach((group) => group.classList.remove("packing-drop-target"));
    ghost?.remove();
    ghost = null;
    moving = null;
  }
  function finish(category) {
    const item = moving;
    clear();
    if (!item) return;
    const changed = category && categories.includes(category) && item.card.isConnected && moveItem(item.id, category);
    const handle = [...root.querySelectorAll("[data-packing-move]")]
      .find((button) => button.closest("[data-item]").dataset.item === item.id);
    handle?.focus({ preventScroll: true });
    announce(changed ? `${item.label} moved to ${title(category)}.` : `Move cancelled. ${item.label} unchanged.`);
  }
  function hitTest(x, y) {
    const group = doc.elementFromPoint(x, y)?.closest("[data-packing-category]");
    highlight(group && root.contains(group) ? group.dataset.packingCategory : null);
  }
  function autoScroll() {
    if (!pending || moving?.mode !== "pointer") return;
    if (!moving.card.isConnected) { clear(); return; }
    const edge = 60, y = pending.y;
    const delta = y < edge ? -10 : y > view.innerHeight - edge ? 10 : 0;
    if (delta) {
      view.scrollBy(0, delta);
      hitTest(pending.x, y);
    }
    frame = view.requestAnimationFrame(autoScroll);
  }
  root.addEventListener("pointerdown", (event) => {
    if (pending || event.button !== 0 || event.isPrimary === false) return;
    const card = event.target.closest(".packing-item"), handle = event.target.closest("[data-packing-move]");
    if (!card || (event.pointerType === "touch" && !handle) ||
        (!handle && event.target.closest("input, textarea, button"))) return;
    clear();
    pending = { card, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      startX: event.clientX, startY: event.clientY };
  });
  doc.addEventListener("pointermove", (event) => {
    if (!pending || event.pointerId !== pending.pointerId) return;
    pending.x = event.clientX;
    pending.y = event.clientY;
    if (!moving && Math.hypot(pending.x - pending.startX, pending.y - pending.startY) < 6) return;
    event.preventDefault();
    if (!moving) {
      start(pending.card, "pointer");
      root.setPointerCapture(event.pointerId);
      ghost = doc.createElement("div");
      ghost.className = `packing-drag-preview pack-${moving.category}`;
      ghost.setAttribute("aria-hidden", "true");
      ghost.textContent = moving.label;
      doc.body.append(ghost);
      frame = view.requestAnimationFrame(autoScroll);
    }
    ghost.style.left = `${pending.x + 12}px`;
    ghost.style.top = `${pending.y + 12}px`;
    hitTest(pending.x, pending.y);
  }, { passive: false });
  doc.addEventListener("pointerup", (event) => {
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (moving?.mode === "pointer") {
      hitTest(event.clientX, event.clientY);
      suppressClick = true;
      // The browser's synthetic click follows pointerup in the same event turn.
      view.setTimeout(() => { suppressClick = false; }, 0);
      finish(moving.category);
    } else pending = null;
  });
  doc.addEventListener("pointercancel", (event) => {
    if (pending?.pointerId === event.pointerId) finish(null);
  });
  root.addEventListener("lostpointercapture", (event) => {
    if (event.target === root && pending?.pointerId === event.pointerId) finish(null);
  });
  root.addEventListener("dragstart", (event) => {
    if (event.target.closest(".packing-item")) event.preventDefault();
  });
  root.addEventListener("click", (event) => {
    if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    const handle = event.target.closest("[data-packing-move]");
    if (handle) {
      if (moving) finish(null);
      else start(handle.closest("[data-item]"), "keyboard");
      return;
    }
    if (moving?.mode === "keyboard") {
      const group = event.target.closest("[data-packing-category]");
      if (group && !event.target.closest("input, textarea, button")) finish(group.dataset.packingCategory);
      else finish(null);
    }
  }, true);
  root.addEventListener("keydown", (event) => {
    const handle = event.target.closest("[data-packing-move]");
    if (!handle) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (moving) finish(moving.category);
      else start(handle.closest("[data-item]"), "keyboard");
    } else if (moving?.mode === "keyboard" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const step = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
      const index = (categories.indexOf(moving.category) + step + categories.length) % categories.length;
      highlight(categories[index]);
      groups().find((group) => group.dataset.packingCategory === moving.category)?.scrollIntoView({ block: "nearest" });
      announce(`${title(moving.category)}. Press Enter to move ${moving.label}.`);
    } else if (event.key === "Tab" && moving) finish(null);
  });
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (moving || pending)) { event.preventDefault(); finish(null); }
  });
  view.addEventListener("blur", () => { if (moving || pending) clear(); });
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) clear(); });
}
