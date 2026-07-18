(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Data model, defaults, and storage normalization
  // ---------------------------------------------------------------------------
  // The app is intentionally client-only. All trip data lives in localStorage.
  const KEY = "itineraryApp:v1",
    CATEGORIES = ["food", "transport", "activities", "lodging"],
    PACK_CATEGORIES = ["essentials", "electronics", "toiletries", "misc"],
    DEFAULT_PACK = [
      "Passport / valid ID",
      "Phone and chargers",
      "Medication",
      "Travel documents",
    ];
  function normalizeTrip(t) {
    t.days = Array.isArray(t.days) ? t.days : [];
    t.days.forEach((d) => {
      d.stops = Array.isArray(d.stops) ? d.stops : [];
      d.stops.forEach((s) => {
        s.kind = s.kind === "tour" ? "tour" : "activity";
        s.done = !!s.done;
        s.timeMode =
          s.kind === "tour"
            ? "range"
            : s.timeMode === "range"
              ? "range"
              : "single";
        s.endTime = s.endTime || "";
        s.tourLocations = Array.isArray(s.tourLocations) ? s.tourLocations : [];
      });
      d.expenses = Array.isArray(d.expenses) ? d.expenses : [];
    });
    t.packingList = Array.isArray(t.packingList) ? t.packingList : [];
    t.packingList.forEach((x) => {
      if (!PACK_CATEGORIES.includes(x.category))
        x.category = /charger|phone|camera|adapter|laptop/i.test(x.label)
          ? "electronics"
          : /passport|medication|document|ticket|wallet/i.test(x.label)
            ? "essentials"
            : "misc";
    });
    t.flights = Array.isArray(t.flights) ? t.flights : [];
    t.hotels = Array.isArray(t.hotels) ? t.hotels : [];
    t.foodPlaces = Array.isArray(t.foodPlaces) ? t.foodPlaces : [];
    t.weatherForecast =
      t.weatherForecast &&
      typeof t.weatherForecast === "object" &&
      !Array.isArray(t.weatherForecast)
        ? t.weatherForecast
        : null;
    return t;
  }
  function normalizeState(x) {
    const s =
      x && Array.isArray(x.trips) ? x : { trips: [], activeTripId: null };
    s.trips.forEach(normalizeTrip);
    s.ui =
      s.ui && typeof s.ui === "object" && !Array.isArray(s.ui) ? s.ui : {};
    s.ui.navCollapsed = !!s.ui.navCollapsed;
    s.ui.theme = s.ui.theme === "dark" ? "dark" : "light";
    const collapsedDays =
        s.ui.collapsedDaysByTrip &&
        typeof s.ui.collapsedDaysByTrip === "object" &&
        !Array.isArray(s.ui.collapsedDaysByTrip)
          ? s.ui.collapsedDaysByTrip
          : {},
      validDaysByTrip = new Map(
        s.trips.map((trip) => [
          trip.id,
          new Set(trip.days.map((day) => day.id)),
        ]),
      );
    s.ui.collapsedDaysByTrip = Object.fromEntries(
      Object.entries(collapsedDays)
        .filter(([tripId, dayIds]) =>
          Boolean(validDaysByTrip.has(tripId) && Array.isArray(dayIds)),
        )
        .map(([tripId, dayIds]) => [
          tripId,
          [...new Set(dayIds)].filter(
            (dayId) =>
              typeof dayId === "string" &&
              validDaysByTrip.get(tripId).has(dayId),
          ),
        ]),
    );
    return s;
  }
  // Keep persistence behind this small API so rendering code never accesses
  // localStorage directly and all loaded data passes through normalization.
  const Storage = {
    read() {
      try {
        return normalizeState(JSON.parse(localStorage.getItem(KEY)));
      } catch {
        return normalizeState(null);
      }
    },
    write(s) {
      localStorage.setItem(KEY, JSON.stringify(normalizeState(s)));
      markSaved();
    },
    all() {
      return this.read().trips;
    },
    active() {
      const s = this.read();
      return s.trips.find((t) => t.id === s.activeTripId) || s.trips[0] || null;
    },
    setActive(id) {
      const s = this.read();
      s.activeTripId = id;
      this.write(s);
    },
    mutate(fn) {
      const s = this.read();
      fn(s);
      this.write(s);
    },
  };
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
            '"': "&quot",
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
  function mutateWithUndo(label, mut) {
    const before = Storage.read();
    Storage.mutate(mut);
    rememberUndo(label, before);
  }
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
  function itineraryPanel(t) {
    const collapsedDays = new Set(
      Storage.read().ui.collapsedDaysByTrip[t.id] || [],
    );
    return `<section
      class="panel ${tab === "itinerary" ? "active" : ""}"
      data-panel="itinerary">
      ${
        t.description
          ? `<p class="trip-description">${esc(t.description)}</p>`
          : ""
      }
      ${t.days.map((d, i) => dayHtml(d, i, collapsedDays.has(d.id))).join("")}
    </section>`;
  }
  // ---------------------------------------------------------------------------
  // Travel-record panels and expense synchronization
  // ---------------------------------------------------------------------------
  function mapsUrl(location) {
    return location
      ? "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(location)
      : "";
  }
  function mapsRouteUrl(locations) {
    const clean = locations.map((x) => String(x || "").trim()).filter(Boolean);
    if (clean.length < 2) return mapsUrl(clean[0] || "");
    const params = new URLSearchParams({
      api: "1",
      origin: clean[0],
      destination: clean[clean.length - 1],
      travelmode: "driving",
    });
    if (clean.length > 2) params.set("waypoints", clean.slice(1, -1).join("|"));
    return "https://www.google.com/maps/dir/?" + params.toString();
  }
  function routeStopLabel(stop) {
    if (stop.kind === "tour") return stop.activity || "Tour stop";
    return stop.activity || "Activity";
  }
  function dayRouteStops(day) {
    return (day.stops || []).flatMap((stop) => {
      if (stop.kind === "tour") {
        return (stop.tourLocations || [])
          .map((location) => String(location || "").trim())
          .filter(Boolean)
          .map((location, index) => ({
            location,
            label: index
              ? `${routeStopLabel(stop)} stop ${index + 1}`
              : routeStopLabel(stop),
            time: stop.time,
            kind: "Tour",
          }));
      }
      const location = String(stop.location || "").trim();
      return location
        ? [
            {
              location,
              label: routeStopLabel(stop),
              time: stop.time,
              kind: "Activity",
            },
          ]
        : [];
    });
  }
  function mapsPanel(t) {
    const days = t.days.map((day, index) => ({
        day,
        index,
        stops: dayRouteStops(day),
      })),
      totalStops = days.reduce((sum, item) => sum + item.stops.length, 0);
    return `<section class="panel ${tab === "maps" ? "active" : ""}" data-panel="maps">
        <h2>Map view</h2>
        <p>Open each day as a Google Maps route, with stops arranged in your itinerary order.</p>
        <div class="map-summary">
        <div class="budget-card">
        <small>Routable stops</small>
        <strong>${totalStops}</strong>
        </div>
        <div class="budget-card">
        <small>Days with routes</small>
        <strong>${days.filter((item) => item.stops.length > 1).length}</strong>
        </div>
        </div>
        <div class="map-days">${days.map(mapDayHtml).join("")}</div>
        </section>`;
  }
  function mapDayHtml({ day, index, stops }) {
    const locations = stops.map((stop) => stop.location),
      routeUrl = mapsRouteUrl(locations),
      hasRoute = stops.length > 1,
      actionLabel = hasRoute ? "Open day route" : "Open place",
      action = stops.length
        ? `<a class="btn small secondary no-print" target="_blank" rel="noopener"
          href="${routeUrl}">${actionLabel}</a>`
        : "";
    return `<article class="map-day-card">
        <header class="map-day-head">
        <div>
        <h3>Day ${index + 1} &middot; ${esc(day.title)}</h3>
        <small>${dayDateLabel(day.date)}</small>
        </div>
        <div class="map-day-actions">
        <span>${stops.length} stop${stops.length === 1 ? "" : "s"}</span>
        ${action}
        </div>
        </header>
        ${
          stops.length
            ? `<ol class="map-stop-list">${stops.map(mapStopHtml).join("")}</ol>
        <div class="map-flow" aria-label="Route flow">
        ${stops.map((stop) => `<span>${esc(stop.location)}</span>`).join("<b>&rarr;</b>")}
        </div>`
            : '<p class="expense-empty">No mapped stops for this day yet. Add activity locations or tour locations in the Itinerary tab.</p>'
        }
        </article>`;
  }
  function mapStopHtml(stop) {
    const time = stop.time ? formatTime12(stop.time) : "Unscheduled";
    return `<li>
        <div>
        <strong>${esc(stop.label)}</strong>
        <small>${esc(time)} &middot; ${esc(stop.kind)}</small>
        </div>
        <a class="map-link" target="_blank" rel="noopener"
          href="${mapsUrl(stop.location)}">${esc(stop.location)}</a>
        </li>`;
  }
  const WEATHER_CODES = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Cloudy",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Rain showers",
    82: "Heavy showers",
    95: "Thunderstorm",
  };
  function weatherSummary(code) {
    return WEATHER_CODES[Number(code)] || "Forecast";
  }
  function isRainyForecast(day) {
    const code = Number(day?.weatherCode),
      probability = Number(day?.precipitationProbabilityMax || 0),
      precipitation = Number(day?.precipitationSum || 0);
    return probability >= 50 || precipitation >= 2 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(code);
  }
  function weatherDayForDate(forecast, date) {
    return (forecast?.days || []).find((day) => day.date === date) || null;
  }
  function weatherPanel(t) {
    const forecast = t.weatherForecast,
      updated = forecast?.updatedAt ? new Date(forecast.updatedAt) : null,
      updatedLabel =
        updated && !Number.isNaN(updated.getTime())
          ? updated.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
          : "",
      rainyDays = (forecast?.days || []).filter(isRainyForecast).length;
    return `<section class="panel ${tab === "weather" ? "active" : ""}" data-panel="weather">
        <div class="weather-heading">
        <div>
        <h2>Weather</h2>
        <p>Fetch a daily forecast for this trip destination, then use rainy-day flags when planning.</p>
        </div>
        <button class="btn small secondary no-print" data-action="refresh-weather">
        ${forecast ? "Refresh forecast" : "Fetch forecast"}
        </button>
        </div>
        <div class="weather-summary">
        <div class="budget-card">
        <small>Forecast location</small>
        <strong>${esc(forecast?.locationName || t.destination || "Not set")}</strong>
        </div>
        <div class="budget-card">
        <small>Rainy days flagged</small>
        <strong>${rainyDays}</strong>
        </div>
        </div>
        ${
          forecast
            ? `<small class="weather-updated">Updated ${esc(updatedLabel || "recently")} via Open-Meteo.</small>
        <div class="weather-days">${t.days.map((day, index) => weatherDayHtml(day, index, forecast)).join("")}</div>`
            : '<p class="expense-empty">No forecast saved yet. Fetch weather to show daily planning notes for this destination.</p>'
        }
        </section>`;
  }
  function weatherDayHtml(day, index, forecast) {
    const weather = weatherDayForDate(forecast, day.date),
      rainy = isRainyForecast(weather),
      minTemp = Number(weather?.temperatureMin),
      maxTemp = Number(weather?.temperatureMax),
      rainChance = Number(weather?.precipitationProbabilityMax),
      temp =
        weather && Number.isFinite(minTemp) && Number.isFinite(maxTemp)
          ? `${Math.round(weather.temperatureMin)}-${Math.round(weather.temperatureMax)}°C`
          : "No forecast",
      rain =
        weather && Number.isFinite(rainChance)
          ? `${weather.precipitationProbabilityMax}% rain`
          : "Rain chance unavailable";
    return `<article class="weather-day-card ${rainy ? "is-rainy" : ""}">
        <header>
        <div>
        <h3>Day ${index + 1} &middot; ${esc(day.title)}</h3>
        <small>${dayDateLabel(day.date)}</small>
        </div>
        ${rainy ? '<span class="weather-badge">Indoor backup</span>' : ""}
        </header>
        <div class="weather-metrics">
        <strong>${esc(weather ? weatherSummary(weather.weatherCode) : "Unavailable")}</strong>
        <span>${esc(temp)}</span>
        <span>${esc(rain)}</span>
        </div>
        <p>${rainy ? "Rain is possible. Ask TravelBot for indoor alternatives or a lower-walking version of this day." : "Weather looks workable, but verify locally before locking plans."}</p>
        </article>`;
  }
  async function fetchTripWeather(t) {
    const query = (t.destination || t.name || "").trim();
    if (!query) throw new Error("Add a destination before fetching weather.");
    const geoUrl =
      "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" +
      encodeURIComponent(query);
    const geoResponse = await fetch(geoUrl);
    if (!geoResponse.ok) throw new Error("Could not find that destination for weather.");
    const geoData = await geoResponse.json(),
      place = geoData?.results?.[0];
    if (!place) throw new Error("No weather location found for this destination.");
    const params = new URLSearchParams({
      latitude: place.latitude,
      longitude: place.longitude,
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_probability_max",
        "precipitation_sum",
      ].join(","),
      timezone: "auto",
      start_date: t.startDate,
      end_date: t.endDate,
    });
    const forecastResponse = await fetch("https://api.open-meteo.com/v1/forecast?" + params);
    if (!forecastResponse.ok) throw new Error("Weather forecast is unavailable for these dates.");
    const data = await forecastResponse.json(),
      daily = data.daily || {},
      dates = daily.time || [];
    return {
      locationName: [place.name, place.admin1, place.country].filter(Boolean).join(", "),
      latitude: place.latitude,
      longitude: place.longitude,
      updatedAt: new Date().toISOString(),
      days: dates.map((date, index) => ({
        date,
        weatherCode: daily.weather_code?.[index] ?? null,
        temperatureMax: daily.temperature_2m_max?.[index] ?? null,
        temperatureMin: daily.temperature_2m_min?.[index] ?? null,
        precipitationProbabilityMax:
          daily.precipitation_probability_max?.[index] ?? null,
        precipitationSum: daily.precipitation_sum?.[index] ?? null,
      })),
    };
  }
  async function refreshWeather(t) {
    const activeId = t?.id;
    try {
      toast("Fetching weather...");
      const forecast = await fetchTripWeather(t);
      Storage.mutate((state) => {
        const trip = state.trips.find((item) => item.id === activeId);
        if (trip) trip.weatherForecast = forecast;
      });
      render();
      toast("Weather forecast updated");
    } catch (error) {
      console.warn("Weather fetch failed:", error);
      toast(error.message || "Weather forecast is unavailable right now.");
    }
  }
  function syncStatus(t, date, amount) {
    if (!Number(amount))
      return "Add an amount to sync this record to Expenses.";
    if (!date) return "Choose an event date to sync this cost to Expenses.";
    return t.days.some((d) => d.date === date)
      ? "Synced to Expenses."
      : "Event date must fall within this trip to sync the expense.";
  }
  function recordField(label, field, value, type = "text", extra = "") {
    return `<div class="field ${extra}">
        <label>${label}</label>
        <input type="${type}" data-record-field="${field}" value="${esc(value)}"
          ${type === "number" ? 'min="0" step="0.01"' : ""}>
        </div>`;
  }
  function flightPanel(t) {
    return `<section class="panel ${tab === "flight" ? "active" : ""}" data-panel="flight">
        <h2>Flights</h2>
        <p>Keep flight segments and booking details together.</p>${
          t.flights
            .map((r, i) => {
              const date = (r.departure || "").slice(0, 10),
                status = syncStatus(t, date, r.amount),
                warning =
                  Number(r.amount) &&
                  (!date || !t.days.some((d) => d.date === date)),
                fields = [
                  recordField("Airline", "airline", r.airline),
                  recordField("Flight number", "flightNumber", r.flightNumber),
                  recordField("Origin", "origin", r.origin),
                  recordField("Destination", "destination", r.destination),
                  recordField(
                    "Departure",
                    "departure",
                    r.departure,
                    "datetime-local",
                    "wide",
                  ),
                  recordField(
                    "Arrival",
                    "arrival",
                    r.arrival,
                    "datetime-local",
                    "wide",
                  ),
                  recordField("Booking reference", "bookingRef", r.bookingRef),
                  recordField("Amount", "amount", r.amount, "number"),
                  recordField("Currency", "currency", r.currency || "PHP"),
                ].join("");
              return `<article class="record-card" data-record-type="flight" data-record="${r.id}">
        <header class="record-head">
        <h3>Flight ${i + 1}</h3>
        <button class="btn small danger no-print" data-action="remove-record">×</button>
        </header>
        <div class="record-grid">${fields}<div
          class="field full">
        <label>Notes</label>
        <textarea data-record-field="notes">${esc(r.notes)}</textarea>
        </div>
        </div>
        <small class="sync-note ${warning ? "warning" : ""}">${status}</small>
        </article>`;
            })
            .join("") || '<p class="expense-empty">No flights added yet.</p>'
        }<button class="btn no-print" data-action="add-record" data-record-type="flight">＋ Add
        Flight</button>
        </section>`;
  }
  function hotelPanel(t) {
    return `<section class="panel ${tab === "hotel" ? "active" : ""}" data-panel="hotel">
        <h2>Hotels</h2>
        <p>Track stays, confirmations, and lodging costs.</p>${
          t.hotels
            .map((r, i) => {
              const status = syncStatus(t, r.checkIn, r.amount),
                map = mapsUrl(r.location),
                warning =
                  Number(r.amount) &&
                  (!r.checkIn || !t.days.some((d) => d.date === r.checkIn)),
                fields = [
                  recordField("Property name", "name", r.name, "text", "wide"),
                  recordField(
                    "Location",
                    "location",
                    r.location,
                    "text",
                    "wide",
                  ),
                  recordField("Check-in", "checkIn", r.checkIn, "date"),
                  recordField("Check-out", "checkOut", r.checkOut, "date"),
                  recordField(
                    "Confirmation number",
                    "confirmation",
                    r.confirmation,
                  ),
                  recordField("Amount", "amount", r.amount, "number"),
                  recordField("Currency", "currency", r.currency || "PHP"),
                ].join("");
              return `<article class="record-card" data-record-type="hotel" data-record="${r.id}">
        <header class="record-head">
        <h3>Stay ${i + 1}</h3>
        <button class="btn small danger no-print" data-action="remove-record">×</button>
        </header>
        <div class="record-grid">${fields}<div
          class="field full">
        <label>Notes</label>
        <textarea data-record-field="notes">${esc(r.notes)}</textarea>
        </div>
        </div>${
          map
            ? `<a class="map-link" target="_blank" rel="noopener"
          href="${map}">Open in Google Maps ↗</a>`
            : ""
        }<small class="sync-note ${warning ? "warning" : ""}">${status}</small>
        </article>`;
            })
            .join("") || '<p class="expense-empty">No hotels added yet.</p>'
        }<button class="btn no-print" data-action="add-record" data-record-type="hotel">＋ Add
        hotel</button>
        </section>`;
  }
  function foodPanel(t) {
    return `<section class="panel ${tab === "food" ? "active" : ""}" data-panel="food">
        <h2>Food shortlist</h2>
        <p>Save restaurants to try; add a visit date when you want a cost logged to Expenses.</p>${
          t.foodPlaces
            .map((r, i) => {
              const status = syncStatus(t, r.visitDate, r.amount),
                map = mapsUrl(r.location),
                warning =
                  Number(r.amount) &&
                  (!r.visitDate || !t.days.some((d) => d.date === r.visitDate)),
                fields = [
                  recordField("Venue", "venue", r.venue, "text", "wide"),
                  recordField("Cuisine", "cuisine", r.cuisine),
                  recordField("Meal type", "mealType", r.mealType),
                  recordField(
                    "Location",
                    "location",
                    r.location,
                    "text",
                    "wide",
                  ),
                  recordField(
                    "Planned visit",
                    "visitDate",
                    r.visitDate,
                    "date",
                  ),
                  recordField(
                    "Reservation time",
                    "reservationTime",
                    r.reservationTime,
                    "time",
                  ),
                  recordField(
                    "Reservation details",
                    "reservation",
                    r.reservation,
                    "text",
                    "wide",
                  ),
                  recordField("Amount", "amount", r.amount, "number"),
                  recordField("Currency", "currency", r.currency || "PHP"),
                ].join("");
              return `<article class="record-card" data-record-type="food" data-record="${r.id}">
        <header class="record-head">
        <h3>Place ${i + 1}</h3>
        <button class="btn small danger no-print" data-action="remove-record">×</button>
        </header>
        <div class="record-grid">${fields}<div
          class="field full">
        <label>Notes</label>
        <textarea data-record-field="notes">${esc(r.notes)}</textarea>
        </div>
        </div>${
          map
            ? `<a class="map-link" target="_blank" rel="noopener"
          href="${map}">Open in Google Maps ↗</a>`
            : ""
        }<small class="sync-note ${warning ? "warning" : ""}">${status}</small>
        </article>`;
            })
            .join("") ||
          '<p class="expense-empty">No food places saved yet.</p>'
        }<button class="btn no-print" data-action="add-record" data-record-type="food">＋ Add food
        place</button>
        </section>`;
  }
  function recordCollection(t, type) {
    return type === "flight"
      ? t.flights
      : type === "hotel"
        ? t.hotels
        : t.foodPlaces;
  }
  function recordExpenseMeta(type, r) {
    return type === "flight"
      ? {
          date: (r.departure || "").slice(0, 10),
          description:
            `Flight ${r.airline || ""} ${r.flightNumber || ""}`.trim(),
          category: "transport",
        }
      : type === "hotel"
        ? {
            date: r.checkIn,
            description: `Hotel: ${r.name || r.location || "Stay"}`,
            category: "lodging",
          }
        : {
            date: r.visitDate,
            description: `Food: ${r.venue || "Dining"}`,
            category: "food",
          };
  }
  function syncRecordExpense(t, type, r) {
    let linked = null;
    t.days.forEach((d) => {
      d.expenses = d.expenses || [];
      const found = d.expenses.find(
        (x) => x.sourceType === type && x.sourceId === r.id,
      );
      if (found) linked = found;
      d.expenses = d.expenses.filter(
        (x) => !(x.sourceType === type && x.sourceId === r.id),
      );
    });
    const meta = recordExpenseMeta(type, r),
      day = t.days.find((d) => d.date === meta.date);
    if (Number(r.amount) && day)
      day.expenses.push({
        id: linked?.id || uid(),
        description: meta.description,
        category: meta.category,
        amount: r.amount,
        currency: r.currency || "PHP",
        sourceType: type,
        sourceId: r.id,
      });
  }
  function totals(stops) {
    const o = {};
    stops.forEach((s) => {
      if (Number(s.cost))
        o[s.currency || "PHP"] = (o[s.currency || "PHP"] || 0) + Number(s.cost);
    });
    return (
      Object.entries(o)
        .map(([c, n]) => `${c} ${money(n)}`)
        .join(" · ") || "No expenses yet"
    );
  }

  // ---------------------------------------------------------------------------
  // Itinerary schedule calculations and overlap detection
  // ---------------------------------------------------------------------------
  function countCharacters(value) {
    return [...String(value || "")].length;
  }

  function minutesFromTime(value) {
    if (!/^\d{2}:\d{2}$/.test(value || "")) return null;
    const [hours, minutes] = value.split(":").map(Number);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function entryTimeParts(entry) {
    const start = minutesFromTime(entry.time);
    if (start === null) return null;

    const usesRange = entry.kind === "tour" || entry.timeMode === "range";
    if (!usesRange) return { point: start, segments: [] };

    const end = minutesFromTime(entry.endTime);
    if (end === null) return null;
    if (end === start) return { point: start, segments: [] };
    if (end > start) return { point: null, segments: [[start, end]] };

    return {
      point: null,
      segments: [
        [start, 1440],
        [0, end],
      ].filter(([segmentStart, segmentEnd]) => segmentStart < segmentEnd),
    };
  }

  function entriesOverlap(first, second) {
    const a = entryTimeParts(first),
      b = entryTimeParts(second);
    if (!a || !b) return false;

    if (a.point !== null && b.point !== null) return a.point === b.point;
    if (a.point !== null)
      return b.segments.some(
        ([start, end]) => start <= a.point && a.point < end,
      );
    if (b.point !== null)
      return a.segments.some(
        ([start, end]) => start <= b.point && b.point < end,
      );

    return a.segments.some(([aStart, aEnd]) =>
      b.segments.some(
        ([bStart, bEnd]) => Math.max(aStart, bStart) < Math.min(aEnd, bEnd),
      ),
    );
  }

  function overlappingEntryIds(day) {
    const overlapping = new Set();
    day.stops.forEach((entry, index) => {
      day.stops.slice(index + 1).forEach((candidate) => {
        if (!entriesOverlap(entry, candidate)) return;
        overlapping.add(entry.id);
        overlapping.add(candidate.id);
      });
    });
    return overlapping;
  }

  function dayHtml(d, i, isCollapsed = false) {
    const canCollapse = d.stops.length > 0,
      collapsed = canCollapse && isCollapsed,
      overlapping = overlappingEntryIds(d),
      isToday = d.date === today(),
      emptyDayNotice =
        d.stops.length === 0
          ? `<div class="empty-day-notice no-print" role="note">
        <strong>Day is empty</strong>
        <span>No activities or tours have been added yet. Add details below.</span>
        </div>`
          : "",
      dayCollapseButton = canCollapse
        ? `<button type="button" class="day-collapse-button"
          data-action="toggle-day" aria-expanded="${!collapsed}"
          title="${collapsed ? "Expand day" : "Collapse day"}"
          aria-label="${collapsed ? "Expand day" : "Collapse day"}">
          ${collapsed ? "⌄" : "⌃"}
        </button>`
        : "";
    return `<article class="day ${collapsed ? "collapsed" : ""}"
          data-day="${d.id}">
        <header class="day-head">
        <div class="stamp">Day<span class="day-number">${i}</span></div>
        <div>
        <input class="day-title" data-field="title" value="${esc(d.title)}"
          aria-label="Day title">
        <small>${dayDateLabel(d.date)}</small>
        ${isToday ? '<span class="today-badge">Today</span>' : ""}
        </div>
        <div class="icon-actions no-print">${dayCollapseButton}</div>
        </header>
        <div class="day-content">${d.stops
          .map((s, j) => entryHtml(s, j, overlapping.has(s.id)))
          .join("")}${emptyDayNotice}<footer
          class="day-foot">
        <div class="add-choice no-print">
        <button class="btn small" data-action="add-activity">＋ Activity</button>
        <button class="btn small" data-action="add-tour">＋ Tour</button>
        </div>
        </footer>
        </div>
        </article>`;
  }
  function durationLabel(start, end) {
    if (!start || !end) return "";
    const [sh, sm] = start.split(":").map(Number),
      [eh, em] = end.split(":").map(Number);
    let minutes = eh * 60 + em - (sh * 60 + sm);
    if (minutes < 0) minutes += 1440;
    const h = Math.floor(minutes / 60),
      m = minutes % 60;
    return `${h ? h + " hr " : ""}${m ? m + " min" : ""}`.trim() || "0 min";
  }
  function formatTime12(value) {
    const [hour, minute] = value.split(":").map(Number),
      period = hour >= 12 ? "PM" : "AM";
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${period}`;
  }

  function overlapBadge(hasOverlap) {
    return hasOverlap
      ? '<span class="overlap-badge" title="This entry overlaps another time">' +
          "Time overlap</span>"
      : "";
  }

  function doneToggleButton(s) {
    const type = s.kind === "tour" ? "tour" : "activity",
      label = s.done ? `Mark ${type} not done` : `Mark ${type} done`;
    return `<button type="button"
          class="btn small secondary done-toggle ${s.done ? "is-active" : ""}"
          data-action="toggle-done"
          title="${label}"
          aria-label="${label}"
          aria-pressed="${s.done ? "true" : "false"}">${s.done ? "✓" : "□"}</button>`;
  }

  function stopHtml(s, j, hasOverlap = false) {
    const map = mapsUrl(s.location),
      range = s.timeMode === "range",
      duration = range ? durationLabel(s.time, s.endTime) : "",
      isUnscheduled = !s.time,
      start = s.time ? formatTime12(s.time) : "Unscheduled",
      time = isUnscheduled
        ? start
        : range && s.endTime
          ? `${start} – ${formatTime12(s.endTime)}${duration ? ` (${duration})` : ""}`
          : start,
      actions = `<div class="icon-actions activity-actions no-print">
        <button
          type="button"
          class="drag-handle activity-drag-handle"
          draggable="true"
          data-drag-kind="activity"
          title="Drag activity"
          aria-label="Drag activity">⋮⋮</button>`;
    if (!editingActivities.has(s.id))
      return `<div class="stop activity-compact ${s.done ? "is-done" : ""}
          ${hasOverlap ? "time-overlap" : ""}"
          data-stop="${s.id}">
        <div class="activity-summary">
        <div class="activity-summary-line">
        <strong class="${isUnscheduled ? "unscheduled-label" : ""}">
          ${esc(time)}
        </strong>
        <span>—</span>
        <span>${esc(s.activity || "Untitled activity")}</span>
        <span>·</span>
        <span>${esc(s.location)}</span>
        </div>
        ${overlapBadge(hasOverlap)}
        <div class="activity-notes">${esc(s.notes)}</div>
        </div>${actions}${doneToggleButton(s)}<button type="button" class="btn small secondary"
          data-action="edit-activity" title="Edit activity" aria-label="Edit activity">✎</button>
        <button class="btn small danger" data-action="remove-stop" title="Remove activity"
          aria-label="Remove activity">×</button>
        </div>
        </div>`;
    return `<div class="stop ${hasOverlap ? "time-overlap" : ""}"
          data-stop="${s.id}">
        <div class="stop-schedule">
        <label class="eyebrow">Activity ${j + 1}</label>
        ${overlapBadge(hasOverlap)}
        <label class="time-label">Time option</label>
        <select class="stop-time" data-field="timeMode">
        <option value="single" ${!range ? "selected" : ""}>Start time only</option>
        <option value="range" ${range ? "selected" : ""}>Start &amp; end</option>
        </select>
        <label class="time-label">Start time</label>
        <input class="stop-time" type="time" data-field="time" value="${esc(s.time)}">${
          range
            ? `<label
          class="time-label">End time</label>
        <input class="stop-time" type="time" data-field="endTime" value="${esc(s.endTime)}">${
          duration
            ? `<small
          class="duration">Duration: ${duration}</small>`
            : ""
        }`
            : ""
        }</div>
        <div class="fields">
        <div class="field">
        <label>Activity</label>
        <input data-field="activity" value="${esc(s.activity)}"
          placeholder="Enter the activity name">
        </div>
        <div class="field">
        <label>Location</label>
        <input data-field="location" value="${esc(s.location)}"
          placeholder="Enter a place or address">${
          map
            ? `<a
          class="map-link" target="_blank" rel="noopener" href="${map}">Open in Google Maps
        ↗</a>`
            : ""
        }</div>
        <div class="field notes">
        <label>Notes</label>
        <textarea
          data-field="notes"
          placeholder="Add reservation details or reminders">${esc(s.notes)}</textarea>
        <small class="note-character-count" data-note-character-count>
          ${countCharacters(s.notes)} characters
        </small>
        </div>
        </div>${actions}<button type="button" class="btn small save-activity"
          data-action="save-activity" title="Save activity" aria-label="Save activity">✓</button>
        <button class="btn small danger" data-action="remove-stop" title="Remove activity"
          aria-label="Remove activity">×</button>
        </div>
        </div>`;
  }
  // ---------------------------------------------------------------------------
  // Expense and packing-list panels
  // ---------------------------------------------------------------------------
  function expensesPanel(t) {
    const all = t.days.flatMap((d) => d.expenses || []),
      byCur = {};
    all.forEach((x) => {
      if (Number(x.amount))
        byCur[x.currency || "PHP"] =
          (byCur[x.currency || "PHP"] || 0) + Number(x.amount);
    });
    return `<section class="panel ${tab === "expenses" ? "active" : ""}" data-panel="expenses">
        <h2>Expenses</h2>
        <p>Log purchases against the day they happened. Trip totals stay separated by currency.</p>
        <div class="budget-summary">${
          Object.entries(byCur)
            .map(
              ([c, n]) =>
                `<div class="budget-card">
        <small>Total in ${esc(c)}</small>
        <strong>${esc(c)} ${money(n)}</strong>
        </div>`,
            )
            .join("") ||
          '<div class="budget-card">No expenses logged yet.</div>'
        }</div>${t.days.map((d, i) => expenseDayHtml(d, i)).join("")}</section>`;
  }
  function expenseDayHtml(d, i) {
    const items = d.expenses || [];
    return `<article class="expense-day" data-day="${d.id}">
        <header class="expense-head">
        <div>
        <h3>Day ${i} · ${esc(d.title)}</h3>
        <small>${fmt(d.date)}</small>
        </div>
        <strong>${totals(items.map((x) => ({ cost: x.amount, currency: x.currency })))}</strong>
        </header>${
          items
            .map((x) => {
              const linked = !!x.sourceType,
                lock = linked ? "disabled" : "",
                linkedAction = linked
                  ? '<span title="Edit this from its source tab">🔗</span>'
                  : [
                      '<button class="btn small danger no-print"',
                      ' data-action="remove-expense"',
                      ' title="Remove expense">×</button>',
                    ].join("");
              return `<div class="expense-row ${linked ? "linked" : ""}" data-expense="${x.id}">
        <div class="field expense-description">
        <label>Description ${linked ? "<small>(synced)</small>" : ""}</label>
        <input
          data-field="description"
          value="${esc(x.description)}"
          placeholder="Describe the expense"
          ${lock}>
        </div>
        <div class="field">
        <label>Category</label>
        <select data-field="category" ${lock}>${CATEGORIES.map(
          (c) => `<option
          ${x.category === c ? "selected" : ""}>${c}</option>`,
        ).join("")}</select>
        </div>
        <div class="field">
        <label>Amount</label>
        <input type="number" min="0" step="0.01" data-field="amount" value="${esc(x.amount)}"
          placeholder="Enter an amount" ${lock}>
        </div>
        <div class="field">
        <label>Currency</label>
        <input data-field="currency" value="${esc(x.currency || "PHP")}" maxlength="5"
          ${lock}>
        </div>${linkedAction}</div>`;
            })
            .join("") ||
          '<div class="expense-empty">No expenses for this day.</div>'
        }<footer class="expense-foot">
        <button class="btn small no-print" data-action="add-expense">＋ Add expense</button>
        <span>${items.length} entr${items.length === 1 ? "y" : "ies"}</span>
        </footer>
        </article>`;
  }
  function packCategoryOptions(selected) {
    return PACK_CATEGORIES.map(
      (c) =>
        `<option
          value="${c}"
          ${selected === c ? "selected" : ""}>
          ${c[0].toUpperCase() + c.slice(1)}
        </option>`,
    ).join("");
  }
  function packingItemHtml(x) {
    return `<li class="packing-item pack-${x.category} ${x.checked ? "checked" : ""}"
          data-item="${x.id}">
        <input type="checkbox" data-field="checked" ${x.checked ? "checked" : ""}>
        <input type="text" data-field="label" value="${esc(x.label)}">
        <select class="pack-category-select no-print" data-field="category"
          aria-label="Packing category">${packCategoryOptions(x.category)}</select>
        <span class="pack-badge print-only pack-${x.category}">${x.category}</span>
        <button class="btn small danger no-print" data-action="remove-item">×</button>
        </li>`;
  }
  function packingPanel(t) {
    return `<section class="panel ${tab === "packing" ? "active" : ""}" data-panel="packing">
        <h2>Packing checklist</h2>
        <form class="form-row no-print" id="packForm">
        <div class="form-field">
        <label>New item</label>
        <input id="packInput" required placeholder="Enter an item to pack">
        </div>
        <div class="form-field pack-category-field">
        <label>Category</label>
        <select id="packCategory">${packCategoryOptions("misc")}</select>
        </div>
        <button class="btn">Add item</button>
        </form>
        <div class="packing-groups">${PACK_CATEGORIES.map((c) => {
          const items = t.packingList.filter((x) => x.category === c);
          return `<section class="packing-group pack-${c}">
        <header>
        <span class="pack-badge pack-${c}">${c}</span>
        <small>${items.length}</small>
        </header>
        <ul class="packing-list">${items.map(packingItemHtml).join("")}</ul>
        </section>`;
        }).join("")}</div>
        </section>`;
  }
  // ---------------------------------------------------------------------------
  // Trip mutation and create/edit dialog
  // ---------------------------------------------------------------------------
  // Most controls mutate the active trip through this helper, which persists
  // and redraws the interface in one operation.
  function changeTrip(mut, shouldRender = true) {
    const id = Storage.active()?.id;
    Storage.mutate((s) => {
      const t = s.trips.find((x) => x.id === id);
      if (t) mut(t);
    });
    if (shouldRender) render();
  }
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
  function updateRecordField(e, rerender) {
    const el = e.target,
      card = el.closest("[data-record]");
    if (!card) return;
    changeTrip((t) => {
      const type = card.dataset.recordType,
        r = recordCollection(t, type).find((x) => x.id === card.dataset.record);
      if (!r) return;
      r[el.dataset.recordField] = el.value;
      syncRecordExpense(t, type, r);
    }, rerender);
  }
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
  function updateField(e, rerender = true) {
    const el = e.target,
      field = el.dataset.field;
    if (!field) return;
    const day = el.closest("[data-day]"),
      stop = el.closest("[data-stop]"),
      item = el.closest("[data-item]"),
      expense = el.closest("[data-expense]");
    changeTrip((t) => {
      let obj;
      if (item) obj = t.packingList.find((x) => x.id === item.dataset.item);
      else {
        const d = t.days.find((x) => x.id === day.dataset.day);
        obj = expense
          ? (d.expenses || []).find((x) => x.id === expense.dataset.expense)
          : stop
            ? d.stops.find((x) => x.id === stop.dataset.stop)
            : d;
      }
      obj[field] = el.type === "checkbox" ? el.checked : el.value;
    }, rerender);
  }
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
  // File export helpers
  // ---------------------------------------------------------------------------
  function download(data, name, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportPng(t) {
    const days = t.days,
      h = 190 + days.reduce((n, d) => n + 90 + d.stops.length * 76, 0),
      c = document.createElement("canvas");
    c.width = 1200;
    c.height = Math.max(h, 500);
    const x = c.getContext("2d");
    x.fillStyle = "#f4ead5";
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#174f4b";
    x.font = "bold 54px Georgia";
    x.fillText(t.name, 70, 80);
    x.font = "24px Georgia";
    x.fillText(
      `${t.destination}  •  ${fmt(t.startDate)} – ${fmt(t.endDate)}`,
      70,
      120,
    );
    let y = 175;
    days.forEach((d, i) => {
      x.fillStyle = "#b85f45";
      x.font = "bold 27px Georgia";
      x.fillText(`DAY ${i}  —  ${d.title}`, 70, y);
      y += 38;
      x.fillStyle = "#586661";
      x.font = "19px Georgia";
      x.fillText(dayDateLabel(d.date), 70, y);
      y += 32;
      d.stops.forEach((s) => {
        const time =
          s.timeMode === "range" && s.endTime
            ? `${s.time || "—"} – ${s.endTime}`
            : s.time || "—";
        x.fillStyle = "#253735";
        x.font = "bold 20px Georgia";
        x.fillText(`${time}   ${s.activity || "Untitled stop"}`, 90, y);
        x.font = "17px Georgia";
        x.fillText(s.location || "", 210, y + 25);
        if (s.notes) {
          x.fillStyle = "#6f756e";
          x.fillText(s.notes.slice(0, 90), 210, y + 48);
        }
        y += 76;
      });
      y += 28;
    });
    c.toBlob((b) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = t.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }
  // ---------------------------------------------------------------------------
  // Tour-specific rendering and location editing
  // ---------------------------------------------------------------------------
  function tourOrdinal(s) {
    return (
      Storage.active()
        .days.flatMap((d) => d.stops)
        .filter((item) => item.kind === "tour")
        .findIndex((item) => item.id === s.id) + 1
    );
  }

  function dayFromDraft(t, item) {
    if (item?.date) return t.days.find((day) => day.date === item.date);
    if (Number.isInteger(item?.dayIndex)) return t.days[item.dayIndex];
    if (Number.isInteger(item?.dayNumber)) return t.days[item.dayNumber - 1];
    return t.days[0];
  }

  function cleanDraftText(value) {
    return String(value || "").trim();
  }

  function normalizeDraftKey(value) {
    return cleanDraftText(value)
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function draftEntryLocations(entry) {
    const locations = Array.isArray(entry.tourLocations)
      ? entry.tourLocations.map(cleanDraftText).filter(Boolean)
      : [];
    return entry.kind === "tour"
      ? locations.length
        ? locations
        : [cleanDraftText(entry.location)].filter(Boolean)
      : [cleanDraftText(entry.location)].filter(Boolean);
  }

  function stopLocations(stop) {
    return stop.kind === "tour"
      ? (stop.tourLocations || []).map(cleanDraftText).filter(Boolean)
      : [cleanDraftText(stop.location)].filter(Boolean);
  }

  function isSimilarDraftText(a, b) {
    const left = normalizeDraftKey(a),
      right = normalizeDraftKey(b);
    if (!left || !right) return false;
    return left === right || (left.length > 5 && right.includes(left)) || (right.length > 5 && left.includes(right));
  }

  function isDuplicateDraftEntry(day, entry) {
    const kind = entry.kind === "tour" ? "tour" : "activity",
      activity = cleanDraftText(entry.activity || entry.name),
      locations = draftEntryLocations({ ...entry, kind }).map(normalizeDraftKey).filter(Boolean);

    return (day.stops || []).some((stop) => {
      if ((stop.kind === "tour" ? "tour" : "activity") !== kind) return false;
      const sameActivity = isSimilarDraftText(activity, stop.activity),
        stopLocationKeys = stopLocations(stop).map(normalizeDraftKey).filter(Boolean),
        sameLocation = locations.some((location) => stopLocationKeys.includes(location));
      return sameActivity || (sameLocation && !cleanDraftText(stop.endTime || stop.time));
    });
  }

  function applyTravelDraft(draft) {
    const before = Storage.read(),
      summary = { itinerary: 0, packing: 0, food: 0, expenses: 0, skippedDuplicates: 0 };

    Storage.mutate((s) => {
      const t =
        s.trips.find((trip) => trip.id === s.activeTripId) || s.trips[0];
      if (!t) return;

      (draft.itinerary || []).forEach((dayDraft) => {
        const day = dayFromDraft(t, dayDraft);
        if (!day) return;
        if (cleanDraftText(dayDraft.title)) day.title = cleanDraftText(dayDraft.title);
        (dayDraft.activities || []).forEach((entry) => {
          const kind = entry.kind === "tour" ? "tour" : "activity",
            locations = Array.isArray(entry.tourLocations)
              ? entry.tourLocations.map(cleanDraftText).filter(Boolean)
              : [];
          if (!cleanDraftText(entry.activity || entry.name) || isDuplicateDraftEntry(day, { ...entry, kind })) {
            summary.skippedDuplicates += 1;
            return;
          }
          day.stops.push({
            id: uid(),
            kind,
            time: cleanDraftText(entry.time).slice(0, 5),
            timeMode: kind === "tour" || entry.endTime ? "range" : "single",
            endTime: cleanDraftText(entry.endTime).slice(0, 5),
            activity: cleanDraftText(entry.activity || entry.name),
            location: kind === "tour" ? "" : cleanDraftText(entry.location),
            mapsLink: "",
            tourLocations:
              kind === "tour"
                ? locations.length
                  ? locations
                  : [cleanDraftText(entry.location)].filter(Boolean)
                : [],
            notes: cleanDraftText(entry.notes),
            done: false,
          });
          summary.itinerary += 1;
        });
      });

      (draft.packing || []).forEach((item) => {
        const label = cleanDraftText(item.label || item);
        if (!label) return;
        t.packingList.push({
          id: uid(),
          label,
          category: PACK_CATEGORIES.includes(item.category)
            ? item.category
            : "misc",
          checked: false,
        });
        summary.packing += 1;
      });

      (draft.foodPlaces || []).forEach((item) => {
        const venue = cleanDraftText(item.venue || item.name);
        if (!venue) return;
        t.foodPlaces.push({
          id: uid(),
          venue,
          cuisine: cleanDraftText(item.cuisine),
          location: cleanDraftText(item.location),
          visitDate: cleanDraftText(item.visitDate || item.date),
          mealType: cleanDraftText(item.mealType),
          reservationTime: cleanDraftText(item.reservationTime),
          reservation: "",
          amount: item.amount || "",
          currency: cleanDraftText(item.currency) || "PHP",
          notes: cleanDraftText(item.notes),
        });
        syncRecordExpense(t, "food", t.foodPlaces[t.foodPlaces.length - 1]);
        summary.food += 1;
      });

      (draft.expenses || []).forEach((item) => {
        const day = dayFromDraft(t, item),
          description = cleanDraftText(item.description);
        if (!day || !description) return;
        day.expenses.push({
          id: uid(),
          description,
          category: CATEGORIES.includes(item.category)
            ? item.category
            : "activities",
          amount: item.amount || "",
          currency: cleanDraftText(item.currency) || "PHP",
        });
        summary.expenses += 1;
      });
    });

    render();
    rememberUndo("TravelBot draft added", before);
    return summary;
  }

  window.LakbayApp = {
    applyTravelDraft,
    getActiveTrip: () => structuredClone(Storage.active()),
  };

  function addCompactMapLinks(html, s) {
    if (s.kind === "tour") {
      const locations = (s.tourLocations || []).filter(Boolean);
      if (!locations.length) return html;
      const plain = `<span>${esc(locations.join(" → "))}</span>`,
        linked = `<span>${locations
          .map(
            (location) => `<a class="map-link compact-location-link"
          target="_blank" rel="noopener" href="${mapsUrl(location)}">${esc(location)}</a>`,
          )
          .join(" → ")}</span>`;
      return html.replace(plain, linked);
    }
    if (!s.location) return html;
    return html.replace(
      `<span>${esc(s.location)}</span>`,
      `<a class="map-link compact-location-link" target="_blank" rel="noopener"
          href="${mapsUrl(s.location)}">${esc(s.location)}</a>`,
    );
  }
  function entryHtml(s, j, hasOverlap = false) {
    let html =
      s.kind === "tour"
        ? tourHtml(s, tourOrdinal(s) - 1, hasOverlap)
        : stopHtml(s, j, hasOverlap);
    if (!editingActivities.has(s.id)) html = addCompactMapLinks(html, s);
    return editingActivities.has(s.id)
      ? html.replace(
          /<button class="btn small danger" data-action="remove-stop"[^>]*>\s*×\s*<\/button>/,
          [
            '<button type="button"',
            ' class="btn small secondary cancel-activity"',
            ' data-action="cancel-activity"',
            ' title="Cancel editing" aria-label="Cancel editing">',
            "↩</button>",
          ].join(""),
        )
      : html;
  }
  function tourHtml(s, j, hasOverlap = false) {
    const duration = durationLabel(s.time, s.endTime),
      isUnscheduled = !s.time,
      start = s.time ? formatTime12(s.time) : "Unscheduled",
      time = isUnscheduled
        ? start
        : s.endTime
          ? `${start} – ${formatTime12(s.endTime)}${duration ? ` (${duration})` : ""}`
          : start,
      locations = (s.tourLocations || []).filter(Boolean),
      locationText = locations.join(" → ") || "No locations added",
      actions = `<div class="icon-actions activity-actions no-print">
        <button type="button" class="drag-handle activity-drag-handle" draggable="true"
          data-drag-kind="activity" title="Drag tour" aria-label="Drag tour">⋮⋮</button>`;
    if (!editingActivities.has(s.id))
      return `<div class="stop activity-compact tour-compact ${s.done ? "is-done" : ""}
          ${hasOverlap ? "time-overlap" : ""}"
          data-stop="${s.id}">
        <div class="activity-summary">
        <div class="activity-summary-line">
        <strong class="${isUnscheduled ? "unscheduled-label" : ""}">
          ${esc(time)}
        </strong>
        <span>—</span>
        <span>${esc(s.activity || "Untitled tour")}</span>
        <span>·</span>
        <span>${esc(locationText)}</span>
        </div>
        ${overlapBadge(hasOverlap)}
        <div class="activity-notes">${esc(s.notes)}</div>
        </div>${actions}${doneToggleButton(s)}<button type="button" class="btn small secondary"
          data-action="edit-activity" title="Edit tour" aria-label="Edit tour">✎</button>
        <button class="btn small danger" data-action="remove-stop" title="Remove tour"
          aria-label="Remove tour">×</button>
        </div>
        </div>`;
    return `<div class="stop tour-editor ${hasOverlap ? "time-overlap" : ""}"
          data-stop="${s.id}">
        <div class="stop-schedule">
        <label class="eyebrow">Tour ${j + 1}</label>
        ${overlapBadge(hasOverlap)}
        <label class="time-label">Start time <span class="required">*</span>
        </label>
        <input class="stop-time" type="time" data-field="time" value="${esc(s.time)}"
          required>
        <label class="time-label">End time <span class="required">*</span>
        </label>
        <input class="stop-time" type="time" data-field="endTime" value="${esc(s.endTime)}"
          required>${duration ? `<small class="duration">Duration: ${duration}</small>` : ""}</div>
        <div class="fields">
        <div class="field notes">
        <label>Tour name</label>
        <input data-field="activity" value="${esc(s.activity)}"
          placeholder="Enter the tour name">
        </div>
        <div class="field notes">
        <label>Locations</label>
        <div class="tour-locations">${(s.tourLocations || [])
          .map(
            (location, i) => `<div
          class="tour-location-row">
        <input
          data-tour-location-index="${i}"
          value="${esc(location)}"
          placeholder="Enter a tour location">${
            location
              ? `<a
          class="map-link" target="_blank" rel="noopener" href="${mapsUrl(location)}"
          title="Open in Google Maps">↗</a>`
              : ""
          }<button
          type="button"
          class="btn small danger no-print"
          data-action="remove-tour-location"
          data-index="${i}"
          aria-label="Remove location">×</button>
        </div>`,
          )
          .join("")}</div>
        <button
          type="button"
          class="btn small secondary no-print"
          data-action="add-tour-location">＋
        Location</button>
        </div>
        <div class="field notes">
        <label>Notes</label>
        <textarea
          data-field="notes"
          placeholder="Add guide, pickup, or reminder details">${esc(s.notes)}</textarea>
        <small class="note-character-count" data-note-character-count>
          ${countCharacters(s.notes)} characters
        </small>
        </div>
        </div>${actions}<button type="button" class="btn small save-activity"
          data-action="save-activity" title="Save tour" aria-label="Save tour">✓</button>
        <button class="btn small danger" data-action="remove-stop" title="Remove tour"
          aria-label="Remove tour">×</button>
        </div>
        </div>`;
  }
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
})();
