const mapText = value => typeof value === "string" ? value.trim() : "";

export function mapEntryDay(trip, entry, entryType = "activity") {
  return (trip?.days || []).find(day => entryType === "meal"
    ? !!entry.visitDate && day.date === entry.visitDate
    : (day.stops || []).some(stop => stop.id === entry.id));
}

export function mapLocationContext(day, entry = {}) {
  const override = !!(mapText(entry.mapCity) || mapText(entry.mapCountry)),
    source = override ? entry : day;
  return {city:mapText(source?.mapCity), country:mapText(source?.mapCountry), override};
}

export function mapLocationQuery(location, day, entry = {}) {
  const clean = mapText(location), {city, country} = mapLocationContext(day, entry);
  if (!clean || !city || !country) return "";
  const addressParts = clean.split(",").map(part => part.trim().toLowerCase());
  return [clean, ...[city, country].filter(part => !addressParts.includes(part.toLowerCase()))].join(", ");
}

export function activityMapSelection(trip, selection) {
  if (!trip || selection?.tripId !== trip.id) return null;
  const entryType = selection.entryType === "meal" ? "meal" : "activity";
  const stop = (entryType === "meal" ? trip.foodPlaces || [] : trip.days.flatMap(day => day.stops || []))
    .find(item => item.id === selection.stopId);
  if (!stop) return null;
  const locations = (entryType === "meal" ? [stop.venue] : stop.kind === "tour" ? stop.tourLocations || [] : [stop.location])
    .map(value => String(value || "").trim()).filter(Boolean);
  const index = Number.isInteger(selection.locationIndex) && selection.locationIndex >= 0 &&
    selection.locationIndex < locations.length ? selection.locationIndex : 0;
  const location = locations[index] || "", day = mapEntryDay(trip, stop, entryType),
    context = mapLocationContext(day, stop), query = mapLocationQuery(location, day, stop);
  return { stop, entryType, locations, index, location, query, day, context };
}

export function placeEmbedUrl(query, key) {
  const cleanKey = String(key || "").trim();
  if (!query || !cleanKey || cleanKey.startsWith("__")) return "";
  return `https://www.google.com/maps/embed/v1/place?${new URLSearchParams({key:cleanKey,q:query})}`;
}

export function selectActivityMap(current, tripId, stopId, entryType = "activity") {
  if (current?.tripId === tripId && current.stopId === stopId && (current.entryType || "activity") === entryType) return current;
  return { tripId, stopId, locationIndex: 0, ...(entryType === "meal" ? { entryType } : {}) };
}

// Capture clicks before editor controls render or stop propagation. Selection
// only updates the map panel, so inputs keep their native focus and behavior.
export function bindItineraryCardSelection(root, { selectActivity }) {
  let suppressReleaseClick = false;
  root.addEventListener("pointerdown", () => { suppressReleaseClick = false; }, true);
  root.addEventListener("keydown", () => { suppressReleaseClick = false; }, true);
  root.addEventListener("dragstart", event => {
    if (!event.target.closest("[data-map-card]")) return;
    if (!event.target.closest(".activity-drag-handle")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    suppressReleaseClick = true;
  }, true);
  root.addEventListener("click", event => {
    if (suppressReleaseClick) {
      suppressReleaseClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const meal = event.target.closest("[data-map-meal]"),
      card = meal || event.target.closest("[data-map-card]");
    if (!card || event.target.closest(".activity-drag-handle")) return;
    if (event.target.closest(".activity-compact") && !event.target.closest("button,a,input,select,textarea,label")) {
      card.classList.toggle("is-expanded");
    }
    selectActivity(meal ? meal.dataset.mapMeal : card.dataset.stop, meal ? "meal" : "activity");
  }, true);
}
