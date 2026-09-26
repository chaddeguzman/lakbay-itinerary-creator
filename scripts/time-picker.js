// Shared time controls for itinerary activities, tours, and meal visits.
// Stored values stay in 24-hour HH:MM form; the editor and summaries use 12-hour time.
const pad = (value) => String(value).padStart(2, "0");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export const FIVE_MINUTE_CHOICES = Array.from({ length: 12 }, (_, index) => pad(index * 5));

export function timeParts(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
  if (!match) return { period: "", hour: "", minute: "" };
  const hour24 = Number(match[1]);
  return {
    period: hour24 >= 12 ? "PM" : "AM",
    hour: pad(hour24 % 12 || 12),
    minute: match[2],
  };
}

export function timeFromParts({ period, hour, minute }) {
  if (!["AM", "PM"].includes(period) ||
      !/^(0[1-9]|1[0-2])$/.test(hour) ||
      !/^([0-5]\d)$/.test(minute)) return "";
  const hour24 = (Number(hour) % 12) + (period === "PM" ? 12 : 0);
  return `${pad(hour24)}:${minute}`;
}

export function selectTimePart(value, draft, part, choice) {
  if (!["period", "hour", "minute"].includes(part))
    return { value: "", draft: null };
  const parts = { ...timeParts(value), ...(draft || {}), [part]: choice };
  const complete = timeFromParts(parts);
  return complete ? { value: complete, draft: null } : { value: "", draft: parts };
}

export function formatTime12(value) {
  const parts = timeParts(value);
  return parts.hour ? `${parts.hour}:${parts.minute} ${parts.period}` : String(value || "");
}

export function timePickerHtml({ label, field, value = "", key, required = false, draft = null }) {
  const parts = { ...timeParts(value), ...(draft || {}) };
  const choices = {
    period: ["AM", "PM"],
    hour: Array.from({ length: 12 }, (_, index) => pad(index + 1)),
    minute: [...FIVE_MINUTE_CHOICES],
  };
  if (parts.minute && !choices.minute.includes(parts.minute))
    choices.minute.push(parts.minute);
  choices.minute.sort();
  const names = { period: "AM/PM", hour: "Hour", minute: "Minute" };
  const control = (part) => `<div class="time-part" data-time-part="${part}">
    <button type="button" class="time-trigger" data-time-trigger="${part}"
      aria-label="${escapeHtml(label)} ${names[part]}" aria-haspopup="listbox"
      aria-expanded="false">${parts[part] || (part === "period" ? "AM/PM" : part === "hour" ? "HH" : "MM")}</button>
    <div class="time-menu" role="listbox" aria-label="${escapeHtml(label)} ${names[part]}" hidden>
      ${choices[part].map((choice) => `<button type="button" role="option" tabindex="-1"
        data-time-option="${choice}" aria-selected="${parts[part] === choice}">${choice}</button>`).join("")}
    </div>
  </div>`;
  return `<div class="time-picker" data-time-field="${escapeHtml(field)}"
    data-time-key="${escapeHtml(key)}" data-time-value="${escapeHtml(value)}" data-time-required="${required}">
    <span class="time-picker-label">${escapeHtml(label)}${required ? ' <span class="required">*</span>' : ""}</span>
    <div class="time-picker-controls">
      ${control("period")}${control("hour")}${control("minute")}
      ${!required ? '<button type="button" class="time-clear" data-time-clear aria-label="Clear time" title="Clear time">×</button>' : ""}
    </div>
  </div>`;
}

export function applyTimeChoice({ key, value, part, choice, drafts, commit }) {
  const result = selectTimePart(value, drafts.get(key), part, choice);
  if (result.value) {
    drafts.delete(key);
    if (result.value !== value) commit(result.value);
  } else {
    drafts.set(key, result.draft);
  }
  return result;
}

export function bindTimePickers(root, { drafts, onCommit }) {
  let openTrigger = null;
  const closeMenu = () => {
    if (!openTrigger) return;
    openTrigger.setAttribute("aria-expanded", "false");
    openTrigger.nextElementSibling.hidden = true;
    openTrigger.parentElement.classList.remove("opens-up");
    openTrigger = null;
  };
  const focusReplacement = (key, part) => {
    queueMicrotask(() => {
      const pickers = [...root.querySelectorAll(".time-picker")]
        .filter((picker) => picker.dataset.timeKey === key);
      const picker = pickers.find((item) => item.closest(".panel.active")) || pickers[0];
      picker?.querySelector(`[data-time-trigger="${part}"]`)?.focus();
    });
  };
  const showDraft = (picker, parts) => {
    for (const part of picker.querySelectorAll(".time-part")) {
      const name = part.dataset.timePart,
        value = parts[name] || "",
        trigger = part.querySelector("[data-time-trigger]");
      trigger.textContent = value || (name === "period" ? "AM/PM" : name === "hour" ? "HH" : "MM");
      for (const option of part.querySelectorAll("[data-time-option]"))
        option.setAttribute("aria-selected", String(option.dataset.timeOption === value));
    }
  };
  const openMenu = (trigger) => {
    closeMenu();
    const menu = trigger.nextElementSibling;
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    openTrigger = trigger;
    const roomBelow = window.innerHeight - trigger.getBoundingClientRect().bottom;
    trigger.parentElement.classList.toggle("opens-up", roomBelow < menu.getBoundingClientRect().height + 8);
    const selected = menu.querySelector('[aria-selected="true"]') || menu.querySelector("[data-time-option]");
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: "nearest" });
  };
  root.addEventListener("click", (event) => {
    const target = event.target;
    const trigger = target.closest?.("[data-time-trigger]");
    if (trigger && root.contains(trigger)) {
      if (openTrigger === trigger) closeMenu();
      else openMenu(trigger);
      return;
    }
    const option = target.closest?.("[data-time-option]");
    if (option && root.contains(option)) {
      const part = option.closest("[data-time-part]"),
        picker = option.closest(".time-picker"),
        key = picker.dataset.timeKey,
        name = part.dataset.timePart,
        oldValue = picker.dataset.timeValue;
      closeMenu();
      const result = applyTimeChoice({
        key, value: oldValue, part: name, choice: option.dataset.timeOption, drafts,
        commit: (value) => onCommit(picker, value),
      });
      if (result.value && result.value !== oldValue) focusReplacement(key, name);
      else {
        showDraft(picker, result.draft || timeParts(oldValue));
        part.querySelector("[data-time-trigger]").focus();
      }
      return;
    }
    const clear = target.closest?.("[data-time-clear]");
    if (clear && root.contains(clear)) {
      const picker = clear.closest(".time-picker"),
        key = picker.dataset.timeKey;
      closeMenu();
      drafts.delete(key);
      if (picker.dataset.timeValue) {
        onCommit(picker, "");
        focusReplacement(key, "period");
      } else {
        showDraft(picker, timeParts(""));
        picker.querySelector('[data-time-trigger="period"]').focus();
      }
      return;
    }
    closeMenu();
  });
  root.addEventListener("keydown", (event) => {
    if (!openTrigger) {
      const trigger = event.target.closest?.("[data-time-trigger]");
      if (trigger && event.key === "ArrowDown") {
        event.preventDefault();
        openMenu(trigger);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      const trigger = openTrigger;
      closeMenu();
      trigger.focus();
      return;
    }
    if (event.key === "Tab") {
      closeMenu();
      return;
    }
    const option = event.target.closest?.("[data-time-option]");
    if (!option) return;
    const choices = [...option.parentElement.querySelectorAll("[data-time-option]")];
    let next = choices.indexOf(option);
    if (event.key === "ArrowDown") next = Math.min(next + 1, choices.length - 1);
    else if (event.key === "ArrowUp") next = Math.max(next - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = choices.length - 1;
    else return;
    event.preventDefault();
    choices[next].focus({ preventScroll: true });
    choices[next].scrollIntoView({ block: "nearest" });
  });
  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target)) closeMenu();
  });
}
