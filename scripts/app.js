import {
  CATEGORIES,
  DEFAULT_PACK,
  PACK_CATEGORIES,
  createStorage,
  normalizeTrip,
} from "./state.js";
import { createActions } from "./actions.js";
import { createExportTools } from "./export.js";
import { createPanelRenderers } from "./render-panels.js";

  // ---------------------------------------------------------------------------
  // Shared formatting, escaping, date, and identifier helpers
  // ---------------------------------------------------------------------------
  const $ = (s) => document.querySelector(s),
    esc = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      ),
    uid = () =>
      Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    parseDate = (s) => {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d);
    },
    localIso = (d) =>
      [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0"),
      ].join("-"),
    today = () => localIso(new Date()),
    fmt = (d) =>
      d
        ? parseDate(d).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "",
    dayDateLabel = (d) => {
      if (!d) return "";
      const date = parseDate(d),
        calendarDate = date.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        weekday = date.toLocaleDateString("en-US", { weekday: "long" });
      return `${calendarDate} (${weekday})`;
    },
    money = (n) =>
      Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const { download, exportPng } = createExportTools({ fmt, dayDateLabel });
  function calendarDates(start, end) {
    const dates = [];
    for (
      let d = parseDate(start), last = parseDate(end);
      d <= last && dates.length < 366;
      d.setDate(d.getDate() + 1)
    )
      dates.push(localIso(d));
    return dates;
  }
  function syncTripDates(t, start, end) {
    const dates = calendarDates(start, end),
      existing = new Map((t.days || []).map((d) => [d.date, d]));
    t.startDate = start;
    t.endDate = end;
    t.days = dates.map(
      (date, i) =>
        existing.get(date) || {
          id: uid(),
          date,
          title:
            i === 0
              ? "Flight Day / Arrival"
              : i === dates.length - 1
                ? "Return Flight"
                : "Explore",
          stops: [],
          expenses: [],
        },
    );
    if (t.days.length === 1 && !existing.has(dates[0]))
      t.days[0].title = "Flight Day / Return";
    normalizeTrip(t);
    t.flights.forEach((r) => syncRecordExpense(t, "flight", r));
    t.hotels.forEach((r) => syncRecordExpense(t, "hotel", r));
    t.foodPlaces.forEach((r) => syncRecordExpense(t, "food", r));
  }
  function dayDifference(from, to) {
    const dayMs = 24 * 60 * 60 * 1000;
    return Math.round((parseDate(to) - parseDate(from)) / dayMs);
  }
  function tripStatusLine(t) {
    const dates = (t.days || []).map((day) => day.date).filter(Boolean),
      start = dates[0] || t.startDate,
      end = dates[dates.length - 1] || t.endDate,
      todayIso = today();
    if (!start || !end) return "";
    if (todayIso < start) {
      const daysUntil = dayDifference(todayIso, start);
      return `${t.name} trip in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
    }
    if (todayIso > end) {
      const daysAgo = dayDifference(end, todayIso);
      return `${t.name} trip ended ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`;
    }
    const dayIndex = dates.indexOf(todayIso),
      currentDay = dayIndex >= 0 ? dayIndex + 1 : dayDifference(start, todayIso) + 1,
      totalDays = dates.length || dayDifference(start, end) + 1;
    return `Day ${currentDay} of ${totalDays} - you're here now`;
  }
  // ---------------------------------------------------------------------------
  // Runtime UI state and reusable interface feedback
  // ---------------------------------------------------------------------------
  let tab = "itinerary",
    toastTimer,
    saveStatusTimer,
    undoSnapshot = null;
  const main = $("#main"),
    list = $("#tripList"),
    editingActivities = new Set(),
    choosingAddForDays = new Set(),
    HOUSE_ICON = [
      '<svg viewBox="0 0 24 24" aria-hidden="true">',
      '<path d="M3 11.2 12 4l9 7.2v8.3a.5.5 0 0 1-.5.5',
      'H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5z" fill="currentColor"/>',
      "</svg>",
    ].join(""),
    CHART_ICON = [
      '<svg viewBox="0 0 24 24" aria-hidden="true">',
      '<path d="M4 19V5M4 19h17M7 15l4-4 3 2 5-6"',
      ' fill="none" stroke="currentColor" stroke-width="2"',
      ' stroke-linecap="round" stroke-linejoin="round"/>',
      "</svg>",
    ].join(""),
    MAP_ICON = [
      '<svg viewBox="0 0 24 24" aria-hidden="true">',
      '<path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3z"',
      ' fill="none" stroke="currentColor" stroke-width="2"',
      ' stroke-linecap="round" stroke-linejoin="round"/>',
      '<path d="M9 3v15M15 6v15"',
      ' fill="none" stroke="currentColor" stroke-width="2"',
      ' stroke-linecap="round"/>',
      "</svg>",
    ].join(""),
    WEATHER_ICON = [
      '<svg viewBox="0 0 24 24" aria-hidden="true">',
      '<path d="M17.5 18H8a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 19 12.5',
      ' 2.8 2.8 0 0 1 17.5 18Z"',
      ' fill="none" stroke="currentColor" stroke-width="2"',
      ' stroke-linecap="round" stroke-linejoin="round"/>',
      '<path d="M9 21v-1M13 21v-1M17 21v-1"',
      ' fill="none" stroke="currentColor" stroke-width="2"',
      ' stroke-linecap="round"/>',
      "</svg>",
    ].join(""),
    NAV_ITEMS = [
      ["itinerary", "🗺", "Itinerary"],
      ["maps", MAP_ICON, "Maps"],
      ["weather", WEATHER_ICON, "Weather"],
      ["flight", "✈", "Flight"],
      ["hotel", HOUSE_ICON, "Hotel"],
      ["food", "🍽", "Food"],
      ["expenses", CHART_ICON, "Expenses"],
      ["packing", "✓", "Packing list"],
    ];
  function markSaved(message = "Saved") {
    const el = $("#saveStatus");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(saveStatusTimer);
    saveStatusTimer = setTimeout(() => el.classList.remove("show"), 1600);
  }
  function toast(msg, action) {
    const el = $("#toast");
    el.textContent = "";
    el.append(document.createTextNode(msg));
    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      button.addEventListener("click", () => {
        action.onClick();
        el.classList.remove("show");
      });
      el.append(button);
    }
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), action ? 6000 : 1800);
  }
  function restoreUndo() {
    if (!undoSnapshot) return;
    Storage.write(undoSnapshot);
    undoSnapshot = null;
    render();
    toast("Restored");
  }
  function rememberUndo(label, beforeState) {
    undoSnapshot = structuredClone(beforeState);
    toast(label, {
      label: "Undo",
      onClick: restoreUndo,
    });
  }
  const Storage = createStorage({
    onSaved: markSaved,
    onCorrupt: toast,
  });
  function applyTheme(theme) {
    const dark = theme === "dark",
      button = $("#themeToggle");
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    button.setAttribute("aria-pressed", String(dark));
    button.setAttribute(
      "aria-label",
      dark ? "Switch to light theme" : "Switch to dark theme",
    );
    button.title = button.getAttribute("aria-label");
  }
  applyTheme(Storage.read().ui.theme);
  $("#themeToggle").addEventListener("click", () => {
    let theme;
    Storage.mutate((s) => {
      s.ui.theme = s.ui.theme === "dark" ? "light" : "dark";
      theme = s.ui.theme;
    });
    applyTheme(theme);
  });
  // Snapshots allow existing entries to be restored when an edit is cancelled.
  // New-entry IDs are tracked separately so cancellation can remove draft rows.
  const activitySnapshots = new Map(),
    newActivityEntries = new Set();
  const {
    itineraryPanel,
    mapsPanel,
    weatherPanel,
    flightPanel,
    hotelPanel,
    foodPanel,
    expensesPanel,
    packingPanel,
    recordCollection,
    syncRecordExpense,
    refreshWeather,
    countCharacters,
  } = createPanelRenderers({
    CATEGORIES,
    PACK_CATEGORIES,
    Storage,
    dayDateLabel,
    editingActivities,
    esc,
    fmt,
    getTab: () => tab,
    money,
    render,
    today,
    toast,
    uid,
  });
  const { changeTrip, mutateWithUndo, updateField, updateRecordField } =
    createActions({
      Storage,
      recordCollection,
      rememberUndo,
      render,
      syncRecordExpense,
    });

  // Activity/tour deletion uses two explicit confirmation stages.
  function showEntryDeleteStage(stage, title, message, confirmLabel) {
    const dialog = $("#deleteEntryModal"),
      confirmButton = $("#confirmEntryDelete");

    dialog.dataset.stage = stage;
    dialog.returnValue = "cancel";
    $("#deleteEntryStep").textContent =
      stage === "final" ? "Final checkpoint" : "Deletion warning";
    $("#deleteEntryTitle").textContent = title;
    $("#deleteEntryMessage").textContent = message;
    confirmButton.title = confirmLabel;
    confirmButton.setAttribute("aria-label", confirmLabel);
    dialog.showModal();

    return new Promise((resolve) => {
      dialog.addEventListener(
        "close",
        () => resolve(dialog.returnValue === "confirm"),
        { once: true },
      );
    });
  }

  async function confirmEntryDeletion(item) {
    const type = item.kind === "tour" ? "tour" : "activity",
      name = item.activity?.trim() || `Untitled ${type}`,
      shouldContinue = await showEntryDeleteStage(
        "initial",
        `Remove this ${type}?`,
        `“${name}” will be removed from this day. Select ✓ to continue.`,
        "Continue to final warning",
      );

    if (!shouldContinue) return false;

    return showEntryDeleteStage(
      "final",
      "Final warning",
      `This ${type} will be permanently deleted and cannot be restored.`,
      `Permanently delete ${type}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Factories for new itinerary entries
  // ---------------------------------------------------------------------------
  function blankStop() {
    return {
      id: uid(),
      kind: "activity",
      time: "",
      timeMode: "single",
      endTime: "",
      activity: "",
      location: "",
      mapsLink: "",
      notes: "",
      done: false,
    };
  }
  function blankTour() {
    return {
      id: uid(),
      kind: "tour",
      time: "",
      timeMode: "range",
      endTime: "17:00",
      activity: "",
      tourLocations: [""],
      notes: "",
      done: false,
    };
  }
  // ---------------------------------------------------------------------------
  // Main application rendering
  // ---------------------------------------------------------------------------
  // Panels are rendered as HTML strings; event delegation below keeps their
  // controls functional after every full render.
  function render() {
    renderTrips();
    const t = Storage.active();
    if (!t) {
      main.innerHTML = [
        '<section class="empty">',
        '<div class="stamp" style="margin:auto">LAKBAY</div>',
        "<h2>Begin a new journey</h2>",
        "<p>Create your first trip, then shape each day one stop at a time.</p>",
        '<button class="btn" data-action="new">Create a trip</button>',
        "</section>",
      ].join("");
      return;
    }
    const collapsed = Storage.read().ui.navCollapsed;
    const navigation = NAV_ITEMS.map(
      ([id, icon, label]) => `<button
        class="section-tab ${tab === id ? "active" : ""}"
        data-tab="${id}"
        title="${label}"
        aria-label="${label}">
        <span class="section-icon" aria-hidden="true">${icon}</span>
        <span class="section-label">${label}</span>
      </button>`,
    ).join("");
    main.innerHTML = `<header class="trip-head">
      <div>
        <div class="eyebrow">Travel itinerary</div>
        <h1 class="trip-title">${esc(t.name)}</h1>
        <div class="trip-status-banner">${esc(tripStatusLine(t))}</div>
        <div class="destination">
          ⌖ ${esc(t.destination)} &nbsp; · &nbsp;
          ${fmt(t.startDate)} – ${fmt(t.endDate)}
        </div>
      </div>
      <div class="toolbar no-print">
        <button class="btn small secondary" data-action="rename">Edit trip</button>
        <button class="btn small secondary" data-action="png">Export PNG</button>
        <button class="btn small danger" data-action="delete-trip">Delete</button>
      </div>
    </header>
    <div class="trip-workspace">
      <nav
        class="section-nav no-print ${collapsed ? "collapsed" : ""}"
        aria-label="Trip sections">
        <button
          class="section-nav-toggle"
          data-action="toggle-nav"
          aria-expanded="${!collapsed}"
          title="${collapsed ? "Expand" : "Collapse"} sections">
          ${collapsed ? "☰" : "← Collapse"}
        </button>
        ${navigation}
      </nav>
      <div class="section-content">
        ${itineraryPanel(t)}
        ${mapsPanel(t)}
        ${weatherPanel(t)}
        ${flightPanel(t)}
        ${hotelPanel(t)}
        ${foodPanel(t)}
        ${expensesPanel(t)}
        ${packingPanel(t)}
      </div>
    </div>`;
  }
  function renderTrips() {
    const q = $("#tripSearch").value.toLowerCase(),
      s = Storage.read();
    list.innerHTML =
      s.trips
        .filter((t) => (t.name + " " + t.destination).toLowerCase().includes(q))
        .map(
          (t) => `<button
            class="trip-card ${t.id === s.activeTripId ? "active" : ""}"
            data-trip="${t.id}">
            <strong>${esc(t.name)}</strong>
            <small>${esc(t.destination)} · ${fmt(t.startDate)}</small>
          </button>`,
        )
        .join("") || "<small>No matching journeys.</small>";
  }
  // ---------------------------------------------------------------------------
  // Trip mutation and create/edit dialog
  // ---------------------------------------------------------------------------
  function openTripModal(t) {
    $("#modalTitle").textContent = t ? "Edit journey" : "Create a journey";
    $("#editTripId").value = t?.id || "";
    $("#tripName").value = t?.name || "";
    $("#tripDestination").value = t?.destination || "";
    $("#tripDescription").value = t?.description || "";
    $("#tripStart").value = t?.startDate || today();
    $("#tripEnd").value = t?.endDate || today();
    $("#tripModal").showModal();
  }
  $("#tripForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("#editTripId").value,
      name = $("#tripName").value.trim(),
      destination = $("#tripDestination").value.trim(),
      description = $("#tripDescription").value.trim(),
      start = $("#tripStart").value,
      end = $("#tripEnd").value;
    if (end < start) {
      toast("End date must follow start date");
      return;
    }
    Storage.mutate((s) => {
      if (id) {
        const t = s.trips.find((t) => t.id === id);
        t.name = name;
        t.destination = destination;
        t.description = description;
        syncTripDates(t, start, end);
      } else {
        const t = {
          id: uid(),
          name,
          destination,
          description,
          startDate: start,
          endDate: end,
          days: [],
          packingList: DEFAULT_PACK.map((label) => ({
            id: uid(),
            label,
            checked: false,
          })),
        };
        syncTripDates(t, start, end);
        s.trips.push(t);
        s.activeTripId = t.id;
      }
    });
    $("#tripModal").close();
    render();
    toast(id ? "Trip updated" : "Trip created");
  });
  $("#cancelTrip").addEventListener("click", () => $("#tripModal").close());
  // ---------------------------------------------------------------------------
  // Delegated record and itinerary actions
  // ---------------------------------------------------------------------------
  main.addEventListener(
    "click",
    (e) => {
      const a = e.target.closest("[data-action]");
      if (!a) return;
      const act = a.dataset.action;
      if (act === "toggle-nav") {
        e.stopImmediatePropagation();
        Storage.mutate((s) => (s.ui.navCollapsed = !s.ui.navCollapsed));
        render();
        return;
      }
      if (act === "add-record") {
        e.stopImmediatePropagation();
        const type = a.dataset.recordType;
        changeTrip((t) => {
          const collection = recordCollection(t, type);
          collection.push(
            type === "flight"
              ? {
                  id: uid(),
                  airline: "",
                  flightNumber: "",
                  origin: "",
                  destination: "",
                  departure: "",
                  arrival: "",
                  bookingRef: "",
                  amount: "",
                  currency: "PHP",
                  notes: "",
                }
              : type === "hotel"
                ? {
                    id: uid(),
                    name: "",
                    location: "",
                    checkIn: "",
                    checkOut: "",
                    confirmation: "",
                    amount: "",
                    currency: "PHP",
                    notes: "",
                  }
                : {
                    id: uid(),
                    venue: "",
                    cuisine: "",
                    location: "",
                    visitDate: "",
                    mealType: "",
                    reservationTime: "",
                    reservation: "",
                    amount: "",
                    currency: "PHP",
                    notes: "",
                  },
          );
        });
        return;
      }
      if (act === "remove-record") {
        e.stopImmediatePropagation();
        const card = a.closest("[data-record]"),
          type = card.dataset.recordType,
          id = card.dataset.record,
          activeId = Storage.active()?.id;
        if (confirm("Remove this record and its linked expense?")) {
          mutateWithUndo("Record deleted", (s) => {
            const t = s.trips.find((x) => x.id === activeId);
            if (!t) return;
            const collection = recordCollection(t, type),
              i = collection.findIndex((x) => x.id === id);
            if (i >= 0) collection.splice(i, 1);
            t.days.forEach(
              (d) =>
                (d.expenses = d.expenses.filter(
                  (x) => !(x.sourceType === type && x.sourceId === id),
                )),
            );
          });
          render();
        }
        return;
      }
    },
    true,
  );
  main.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-action]");
    if (!a) return;
    const t = Storage.active(),
      act = a.dataset.action,
      dayEl = a.closest("[data-day]"),
      stopEl = a.closest("[data-stop]"),
      expenseEl = a.closest("[data-expense]");
    if (act === "new") openTripModal();
    else if (act === "rename") openTripModal(t);
    else if (act === "delete-trip") {
      if (confirm(`Delete “${t.name}”? This cannot be undone.`)) {
        mutateWithUndo("Trip deleted", (s) => {
          s.trips = s.trips.filter((x) => x.id !== t.id);
          s.activeTripId = s.trips[0]?.id || null;
        });
        render();
      }
    } else if (act === "refresh-weather") {
      await refreshWeather(t);
    } else if (act === "toggle-day" && dayEl) {
      Storage.mutate((state) => {
        const collapsedByTrip = state.ui.collapsedDaysByTrip,
          collapsed = new Set(collapsedByTrip[t.id] || []),
          dayId = dayEl.dataset.day;
        if (collapsed.has(dayId)) collapsed.delete(dayId);
        else collapsed.add(dayId);
        collapsedByTrip[t.id] = [...collapsed];
      });
      render();
    } else if (dayEl) {
      let removedEntryType = "";
      if (act === "remove-stop" && stopEl) {
        const day = t.days.find((item) => item.id === dayEl.dataset.day),
          item = day?.stops.find((entry) => entry.id === stopEl.dataset.stop),
          isNew = item && newActivityEntries.has(item.id);

        if (item && !isNew && !(await confirmEntryDeletion(item))) return;
        if (item)
          removedEntryType = item.kind === "tour" ? "Tour" : "Activity";
      }

      changeTrip((t) => {
        const i = t.days.findIndex((x) => x.id === dayEl.dataset.day),
          d = t.days[i];
        d.expenses = d.expenses || [];
        if (act === "remove-day") {
          if (confirm("Remove this day and all its stops?")) {
            rememberUndo("Day deleted", Storage.read());
            t.days.splice(i, 1);
          }
        } else if (act === "day-up" && i > 0)
          [t.days[i - 1], t.days[i]] = [t.days[i], t.days[i - 1]];
        else if (act === "day-down" && i < t.days.length - 1)
          [t.days[i + 1], t.days[i]] = [t.days[i], t.days[i + 1]];
        else if (act === "add-stop") d.stops.push(blankStop());
        else if (act === "add-expense")
          d.expenses.push({
            id: uid(),
            description: "",
            category: "food",
            amount: "",
            currency: "PHP",
          });
        else if (act === "remove-expense")
          rememberUndo("Expense deleted", Storage.read()),
          d.expenses = d.expenses.filter(
            (x) => x.id !== expenseEl.dataset.expense,
          );
        else if (stopEl) {
          const j = d.stops.findIndex((x) => x.id === stopEl.dataset.stop);
          if (act === "remove-stop") {
            rememberUndo(`${removedEntryType || "Entry"} deleted`, Storage.read());
            d.stops.splice(j, 1);
          } else if (act === "stop-up" && j > 0)
            [d.stops[j - 1], d.stops[j]] = [d.stops[j], d.stops[j - 1]];
          else if (act === "stop-down" && j < d.stops.length - 1)
            [d.stops[j + 1], d.stops[j]] = [d.stops[j], d.stops[j + 1]];
        }
      });
      if (act === "remove-stop" && removedEntryType)
        toast(`${removedEntryType} deleted`, {
          label: "Undo",
          onClick: restoreUndo,
        });
    } else if (act === "remove-item") {
      rememberUndo("Packing item deleted", Storage.read());
      changeTrip((t) => {
        t.packingList = t.packingList.filter(
          (x) => x.id !== a.closest("[data-item]").dataset.item,
        );
      });
    } else if (act === "png") exportPng(t);
  });
  main.addEventListener(
    "click",
    (e) => {
      const section = e.target.closest(".section-tab");
      if (section && window.innerWidth <= 900)
        Storage.mutate((s) => (s.ui.navCollapsed = true));
    },
    true,
  );
  main.addEventListener(
    "click",
    (e) => {
      const a = e.target.closest("[data-action]");
      if (!a) return;
      const act = a.dataset.action;
      if (act === "remove-day") {
        e.stopImmediatePropagation();
        return;
      }
      if (act === "day-up" || act === "day-down") {
        const t = Storage.active(),
          day = a.closest("[data-day]"),
          i = t.days.findIndex((d) => d.id === day?.dataset.day),
          last = t.days.length - 1,
          allowed =
            act === "day-up" ? i > 1 && i < last : i > 0 && i < last - 1;
        if (!allowed) e.stopImmediatePropagation();
      }
    },
    true,
  );
  main.addEventListener(
    "click",
    (e) => {
      const a = e.target.closest(
        '[data-action="day-up"],[data-action="day-down"]',
      );
      if (!a) return;
      e.stopImmediatePropagation();
      const dayEl = a.closest("[data-day]"),
        direction = a.dataset.action === "day-up" ? -1 : 1;
      changeTrip((t) => {
        const i = t.days.findIndex((d) => d.id === dayEl.dataset.day),
          target = i + direction,
          last = t.days.length - 1;
        if (i <= 0 || i >= last || target <= 0 || target >= last) return;
        const current = t.days[i],
          other = t.days[target];
        [current.title, other.title] = [other.title, current.title];
        [current.stops, other.stops] = [other.stops, current.stops];
      });
    },
    true,
  );
  // ---------------------------------------------------------------------------
  // Drag-and-drop ordering for itinerary entries
  // ---------------------------------------------------------------------------
  let dragState = null;
  main.addEventListener("pointerdown", (e) => {
    const compact = e.target.closest(".activity-compact");
    if (!compact) return;
    if (e.target.closest("button,a")) {
      compact.removeAttribute("draggable");
      return;
    }
    compact.setAttribute("draggable", "true");
    compact.dataset.dragKind = "activity";
  });
  main.addEventListener("dragstart", (e) => {
    const source = e.target.closest(
      '.drag-handle,.activity-compact[draggable="true"]',
    );
    if (
      !source ||
      source.classList.contains("activity-drag-handle") ||
      e.target.closest("button,a")
    ) {
      e.preventDefault();
      return;
    }
    const day = source.closest("[data-day]"),
      stop = source.closest("[data-stop]");
    dragState = {
      dayId: day?.dataset.day,
      stopId: stop?.dataset.stop,
    };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "activity");
    (stop || day)?.classList.add("dragging");
  });
  main.addEventListener("dragover", (e) => {
    if (!dragState) return;
    const target = e.target.closest(".stop");
    if (!target) return;
    if (target.closest("[data-day]")?.dataset.day !== dragState.dayId)
      return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    main
      .querySelectorAll(".drag-over")
      .forEach((x) => x.classList.remove("drag-over"));
    target.classList.add("drag-over");
  });
  main.addEventListener("drop", (e) => {
    if (!dragState) return;
    e.preventDefault();
    const state = dragState,
      targetDay = e.target.closest("[data-day]"),
      targetStop = e.target.closest("[data-stop]");
    dragState = null;
    changeTrip((t) => {
      const day = t.days.find((d) => d.id === state.dayId);
      if (!day || targetDay?.dataset.day !== state.dayId) return;
      const from = day.stops.findIndex((s) => s.id === state.stopId),
        to = day.stops.findIndex((s) => s.id === targetStop?.dataset.stop);
      if (from < 0 || to < 0 || from === to) return;
      const [moved] = day.stops.splice(from, 1);
      day.stops.splice(to, 0, moved);
    });
  });
  main.addEventListener("dragend", () => {
    dragState = null;
    main
      .querySelectorAll(".dragging,.drag-over")
      .forEach((x) => x.classList.remove("dragging", "drag-over"));
  });
  // ---------------------------------------------------------------------------
  // Activity/tour editor lifecycle: snapshot, add, cancel, save, and delete
  // ---------------------------------------------------------------------------
  main.addEventListener(
    "click",
    (e) => {
      const a = e.target.closest("[data-action]");
      if (!a) return;
      const act = a.dataset.action,
        stop = a.closest("[data-stop]"),
        day = a.closest("[data-day]");
      if (act === "edit-activity" && stop) {
        const t = Storage.active(),
          item = t.days
            .find((d) => d.id === day.dataset.day)
            .stops.find((s) => s.id === stop.dataset.stop);
        activitySnapshots.set(item.id, structuredClone(item));
        return;
      }
      if (act === "add-activity" || act === "add-tour") {
        const before = new Set(editingActivities);
        setTimeout(() =>
          editingActivities.forEach((id) => {
            if (!before.has(id)) newActivityEntries.add(id);
          }),
        );
        return;
      }
      if (act === "cancel-activity" && stop) {
        e.stopImmediatePropagation();
        const id = stop.dataset.stop,
          snapshot = activitySnapshots.get(id),
          isNew = newActivityEntries.has(id);
        editingActivities.delete(id);
        activitySnapshots.delete(id);
        newActivityEntries.delete(id);
        changeTrip((t) => {
          const d = t.days.find((x) => x.id === day.dataset.day),
            i = d.stops.findIndex((s) => s.id === id);
          if (isNew) d.stops.splice(i, 1);
          else if (snapshot) d.stops[i] = structuredClone(snapshot);
        });
        toast(isNew ? "New entry discarded" : "Changes cancelled");
        return;
      }
      if ((act === "save-activity" || act === "remove-stop") && stop) {
        const id = stop.dataset.stop;
        setTimeout(() => {
          if (
            !editingActivities.has(id) ||
            !document.querySelector(`[data-stop="${id}"]`)
          ) {
            activitySnapshots.delete(id);
            newActivityEntries.delete(id);
          }
        });
      }
    },
    true,
  );
  main.addEventListener(
    "click",
    (e) => {
      const a = e.target.closest("[data-action]");
      if (!a) return;
      const act = a.dataset.action,
        stop = a.closest("[data-stop]"),
        day = a.closest("[data-day]");
      if (act === "choose-add") {
        e.stopImmediatePropagation();
        choosingAddForDays.add(day.dataset.day);
        render();
        return;
      }
      if (act === "cancel-add") {
        e.stopImmediatePropagation();
        choosingAddForDays.delete(day.dataset.day);
        render();
        return;
      }
      if (act === "add-activity" || act === "add-tour") {
        e.stopImmediatePropagation();
        const item = act === "add-tour" ? blankTour() : blankStop();
        editingActivities.add(item.id);
        choosingAddForDays.delete(day.dataset.day);
        changeTrip((t) =>
          t.days.find((x) => x.id === day.dataset.day).stops.push(item),
        );
        return;
      }
      if (act === "toggle-done" && stop) {
        e.stopImmediatePropagation();
        const before = Storage.read();
        let done = false,
          type = "Activity";
        changeTrip((t) => {
          const item = t.days
            .find((x) => x.id === day.dataset.day)
            ?.stops.find((x) => x.id === stop.dataset.stop);
          if (!item) return;
          item.done = !item.done;
          done = item.done;
          type = item.kind === "tour" ? "Tour" : "Activity";
        });
        rememberUndo(done ? `${type} marked done` : `${type} reopened`, before);
        return;
      }
      if (act === "edit-activity") {
        e.stopImmediatePropagation();
        editingActivities.add(stop.dataset.stop);
        render();
        return;
      }
      if (act === "save-activity") {
        e.stopImmediatePropagation();
        const t = Storage.active(),
          d = t.days.find((x) => x.id === day.dataset.day),
          item = d.stops.find((x) => x.id === stop.dataset.stop);
        if (
          item.kind === "tour" &&
          (!item.time || !item.endTime || !item.tourLocations.some(Boolean))
        ) {
          toast("Tour needs start time, end time, and a location");
          return;
        }
        const isNew = newActivityEntries.has(item.id);
        editingActivities.delete(stop.dataset.stop);
        render();
        toast(
          isNew
            ? item.kind === "tour"
              ? "New tour added"
              : "New activity added"
            : item.kind === "tour"
              ? "Tour saved"
              : "Activity saved",
        );
        return;
      }
      if (act === "add-tour-location") {
        e.stopImmediatePropagation();
        changeTrip((t) =>
          t.days
            .find((x) => x.id === day.dataset.day)
            .stops.find((x) => x.id === stop.dataset.stop)
            .tourLocations.push(""),
        );
        return;
      }
      if (act === "remove-tour-location") {
        e.stopImmediatePropagation();
        changeTrip((t) => {
          const locations = t.days
            .find((x) => x.id === day.dataset.day)
            .stops.find((x) => x.id === stop.dataset.stop).tourLocations;
          if (locations.length > 1)
            locations.splice(Number(a.dataset.index), 1);
        });
        return;
      }
    },
    true,
  );
  // ---------------------------------------------------------------------------
  // Form field synchronization
  // ---------------------------------------------------------------------------
  // Input events persist typing without a redraw; change events redraw derived
  // labels, maps, totals, and other values once the edit is committed.
  main.addEventListener("input", (e) => {
    if (e.target.matches("[data-record-field]")) updateRecordField(e, false);
  });
  main.addEventListener("change", (e) => {
    if (e.target.matches("[data-record-field]")) updateRecordField(e, true);
  });
  main.addEventListener("change", updateField);
  main.addEventListener("input", (e) => {
    if (e.target.matches("textarea,input[data-field],select[data-field]"))
      updateField(e, false);
    if (e.target.matches('textarea[data-field="notes"]')) {
      const counter = e.target
        .closest("[data-stop]")
        ?.querySelector("[data-note-character-count]");
      if (counter)
        counter.textContent = `${countCharacters(e.target.value)} characters`;
    }
  });
  // ---------------------------------------------------------------------------
  // Packing, tab navigation, trip selection, and global sidebar controls
  // ---------------------------------------------------------------------------
  main.addEventListener("submit", (e) => {
    if (e.target.id === "packForm") {
      e.preventDefault();
      const v = $("#packInput").value.trim();
      if (v)
        changeTrip((t) =>
          t.packingList.push({ id: uid(), label: v, checked: false }),
        );
    }
  });
  main.addEventListener("click", (e) => {
    const x = e.target.closest("[data-tab]");
    if (x) {
      tab = x.dataset.tab;
      render();
    }
  });
  list.addEventListener("click", (e) => {
    const x = e.target.closest("[data-trip]");
    if (x) {
      Storage.setActive(x.dataset.trip);
      render();
      $(".sidebar").classList.remove("open");
    }
  });
  $("#tripSearch").addEventListener("input", renderTrips);
  $("#newTrip").onclick = () => openTripModal();
  $(".mobile-menu").onclick = () => $(".sidebar").classList.toggle("open");
  $("#manageData").onclick = (e) => {
    const actions = $("#dataActions"),
      expanded = e.currentTarget.getAttribute("aria-expanded") === "true";
    e.currentTarget.setAttribute("aria-expanded", String(!expanded));
    actions.hidden = expanded;
  };
  // Data export/import moves the complete normalized application state as JSON.
  $("#downloadBackup").onclick = () =>
    download(
      JSON.stringify(
        { ...Storage.read(), exportedAt: new Date().toISOString() },
        null,
        2,
      ),
      "lakbay-backup.json",
      "application/json",
    );
  $("#importBackup").onclick = () => $("#backupFile").click();
  $("#backupFile").onchange = async (e) => {
    try {
      const x = JSON.parse(await e.target.files[0].text());
      if (!x || !Array.isArray(x.trips)) throw Error();
      if (
        confirm(`Import ${x.trips.length} trip(s)? This replaces current data.`)
      ) {
        const before = Storage.read();
        Storage.write({
          trips: x.trips,
          activeTripId: x.activeTripId || x.trips[0]?.id || null,
        });
        render();
        rememberUndo("Backup restored", before);
      }
    } catch {
      alert("That file is not a valid Lakbay backup.");
    }
    e.target.value = "";
  };
  // ---------------------------------------------------------------------------
  // Tour-specific rendering and location editing
  // ---------------------------------------------------------------------------
  function updateTourLocation(e, rerender) {
    const el = e.target,
      stop = el.closest("[data-stop]"),
      day = el.closest("[data-day]");
    changeTrip((t) => {
      const item = t.days
        .find((x) => x.id === day.dataset.day)
        .stops.find((x) => x.id === stop.dataset.stop);
      item.tourLocations[Number(el.dataset.tourLocationIndex)] = el.value;
    }, rerender);
  }
  main.addEventListener("input", (e) => {
    if (e.target.matches("[data-tour-location-index]"))
      updateTourLocation(e, false);
  });
  main.addEventListener("change", (e) => {
    if (e.target.matches("[data-tour-location-index]"))
      updateTourLocation(e, true);
  });
  main.addEventListener(
    "submit",
    (e) => {
      if (e.target.id !== "packForm") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const label = $("#packInput").value.trim(),
        category = $("#packCategory").value;
      if (label)
        changeTrip((t) =>
          t.packingList.push({ id: uid(), label, category, checked: false }),
        );
    },
    true,
  );
  // Final labels and first paint. These assignments also normalize text from
  // older cached markup before the application becomes interactive.
  $("#downloadBackup").textContent = "Export";
  $("#importBackup").textContent = "Import";
  render();
