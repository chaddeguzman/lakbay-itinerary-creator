export function createPanelRenderers(ctx) {
  const {
    CATEGORIES,
    PACK_CATEGORIES,
    Storage,
    dayDateLabel,
    editingActivities,
    esc,
    fmt,
    getTab,
    money,
    render,
    today,
    toast,
    uid,
  } = ctx;

  function itineraryPanel(t) {
    const collapsedDays = new Set(
      Storage.read().ui.collapsedDaysByTrip[t.id] || [],
    );
    return `<section
      class="panel ${getTab() === "itinerary" ? "active" : ""}"
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
    return `<section class="panel ${getTab() === "maps" ? "active" : ""}" data-panel="maps">
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
    return `<section class="panel ${getTab() === "weather" ? "active" : ""}" data-panel="weather">
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
    return `<section class="panel ${getTab() === "flight" ? "active" : ""}" data-panel="flight">
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
    return `<section class="panel ${getTab() === "hotel" ? "active" : ""}" data-panel="hotel">
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
    return `<section class="panel ${getTab() === "food" ? "active" : ""}" data-panel="food">
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
    return `<section class="panel ${getTab() === "expenses" ? "active" : ""}" data-panel="expenses">
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
    return `<section class="panel ${getTab() === "packing" ? "active" : ""}" data-panel="packing">
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

  return {
    itineraryPanel,
    mapsPanel,
    weatherPanel,
    flightPanel,
    hotelPanel,
    foodPanel,
    expensesPanel,
    packingPanel,
    mapsUrl,
    recordCollection,
    syncRecordExpense,
    refreshWeather,
    countCharacters,
  };
}
