import test from "node:test";
import assert from "node:assert/strict";
import { createPanelRenderers } from "../scripts/render-panels.js";

const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
globalThis.window = {};
const trip = () => ({
  id: "trip",
  name: "Chiang Mai 2026",
  destination: "Chiang Mai, Thailand",
  startDate: "2026-10-23",
  endDate: "2026-11-01",
  days: ["2026-10-23", "2026-10-24"].map((date) => ({ id: date, date, title: "Explore", stops: [], expenses: [] })),
});

function renderers(t, toasts) {
  return createPanelRenderers({
    CATEGORIES: [],
    PACK_CATEGORIES: [],
    Storage: {
      read: () => ({ ui: { collapsedDaysByTrip: {} } }),
      active: () => t,
      mutate: (mutator) => mutator({ trips: [t] }),
    },
    dayDateLabel: (value) => value,
    editingActivities: new Set(),
    esc,
    fmt: (value) => value,
    getTab: () => "weather",
    money: (value) => String(value),
    openMealCards: new Set(),
    render() {},
    today: () => "2026-09-24",
    toast: (message) => toasts.push(message),
    uid: () => "id",
  });
}

test("weather falls back to last year's same date range and labels the source", async () => {
  const t = trip(),
    toasts = [],
    calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const request = String(url);
    calls.push(request);
    if (request.includes("geocoding-api"))
      return { ok: true, json: async () => ({ results: [{ name: "Chiang Mai", admin1: "Chiang Mai", country: "Thailand", latitude: 18.79, longitude: 98.99 }] }) };
    if (request.includes("https://api.open-meteo.com/")) return { ok: false, status: 400, json: async () => ({}) };
    return {
      ok: true,
      json: async () => ({
        daily: {
          time: ["2025-10-23", "2025-10-24"],
          weather_code: [61, 3],
          temperature_2m_max: [30, 31],
          temperature_2m_min: [22, 23],
          precipitation_probability_max: [70, 10],
          precipitation_sum: [4, 0],
        },
      }),
    };
  };
  try {
    const panel = renderers(t, toasts);
    await panel.refreshWeather(t);
    assert.equal(t.weatherForecast.source, "historical");
    assert.equal(t.weatherForecast.sourceYear, 2025);
    assert.equal(t.weatherForecast.days[0].date, "2026-10-23");
    assert.match(t.weatherForecast.sourceLabel, /Last year's historical weather/);
    assert.match(calls.find((call) => call.includes("archive-api")), /start_date=2025-10-23/);
    assert.doesNotMatch(calls.find((call) => call.includes("archive-api")), /precipitation_probability_max/);
    assert.match(panel.weatherPanel(t), /Last year's historical weather/);
    assert.doesNotMatch(panel.weatherPanel(t), /null% rain/);
    assert.deepEqual(toasts, ["Fetching weather...", "Weather forecast updated"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
