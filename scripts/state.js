// The app is intentionally client-only. All trip data lives in localStorage.
export const KEY = "itineraryApp:v1";
export const CORRUPT_BACKUP_KEY = `${KEY}:corrupt-backup`;
export const CATEGORIES = ["food", "transport", "activities", "lodging"];
export const PACK_CATEGORIES = [
  "essentials",
  "electronics",
  "toiletries",
  "misc",
];
export const DEFAULT_PACK = [
  "Passport / valid ID",
  "Phone and chargers",
  "Medication",
  "Travel documents",
];

export function normalizeTrip(t) {
  t.days = Array.isArray(t.days) ? t.days : [];
  t.days.forEach((d) => {
    d.stops = Array.isArray(d.stops) ? d.stops : [];
    d.stops.forEach((s) => {
      s.kind = s.kind === "tour" ? "tour" : "activity";
      s.done = !!s.done;
      s.timeMode =
        s.kind === "tour" ? "range" : s.timeMode === "range" ? "range" : "single";
      s.endTime = s.endTime || "";
      s.tourLocations = Array.isArray(s.tourLocations) ? s.tourLocations : [];
    });
    d.expenses = Array.isArray(d.expenses) ? d.expenses : [];
  });
  t.packingList = Array.isArray(t.packingList) ? t.packingList : [];
  t.packingList.forEach((x) => {
    if (!PACK_CATEGORIES.includes(x.category)) {
      x.category = /charger|phone|camera|adapter|laptop/i.test(x.label)
        ? "electronics"
        : /passport|medication|document|ticket|wallet/i.test(x.label)
          ? "essentials"
          : "misc";
    }
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

export function normalizeState(x) {
  const s = x && Array.isArray(x.trips) ? x : { trips: [], activeTripId: null };
  s.trips.forEach(normalizeTrip);
  s.ui = s.ui && typeof s.ui === "object" && !Array.isArray(s.ui) ? s.ui : {};
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
            typeof dayId === "string" && validDaysByTrip.get(tripId).has(dayId),
        ),
      ]),
  );
  return s;
}

export function createStorage({ onSaved = () => {}, onCorrupt = () => {} } = {}) {
  function preserveCorruptStorage(raw) {
    if (!raw) return;
    try {
      localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
      localStorage.removeItem(KEY);
      onCorrupt(
        "Your saved data couldn't be read - a backup copy was kept. Try Import or contact support.",
      );
    } catch (error) {
      console.warn("Could not preserve corrupted itinerary data:", error);
    }
  }

  return {
    read() {
      let raw = null;
      try {
        raw = localStorage.getItem(KEY);
        return normalizeState(JSON.parse(raw));
      } catch {
        preserveCorruptStorage(raw);
        return normalizeState(null);
      }
    },
    write(s) {
      localStorage.setItem(KEY, JSON.stringify(normalizeState(s)));
      onSaved();
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
}
