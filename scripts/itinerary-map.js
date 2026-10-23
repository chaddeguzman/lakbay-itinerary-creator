const mapText = value => typeof value === "string" ? value.trim() : "";

export function mapEntryDay(trip, entry, entryType = "activity") {
  return (trip?.days || []).find(day => entryType === "meal"
    ? !!entry.visitDate && day.date === entry.visitDate
    : (day.stops || []).some(stop => stop.id === entry.id));
}

// Existing entry locations are authoritative. A venue-only meal can borrow a
// nearby scheduled root, never the trip-wide destination or the viewer's locale.
export function mapLocationQuery(location) {
  return mapText(location);
}

const normalizedVenue = value => mapText(value).toLowerCase().replace(/\s+/g, " ");
const minutes = value => /^\d{2}:\d{2}$/.test(value || "")
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;

export function mealMapQuery(trip, meal) {
  const venue = mapText(meal.venue), ownLocation = mapText(meal.location),
    matches = (trip?.foodLibrary || []).filter(place => normalizedVenue(place.venue) === normalizedVenue(venue)),
    saved = (meal.savedPlaceId && (trip?.foodLibrary || []).find(place => place.id === meal.savedPlaceId)) ||
      (venue && matches.length === 1 ? matches[0] : null),
    location = ownLocation || mapText(saved?.location);
  if (location) return !venue || normalizedVenue(location).includes(normalizedVenue(venue))
    ? location : `${venue}, ${location}`;
  if (!venue) return "";
  const day = mapEntryDay(trip, meal, "meal"), targetTime = minutes(meal.time),
    roots = (day?.stops || []).flatMap(stop => {
      const locations = (stop.kind === "tour" ? stop.tourLocations || [] : [stop.location]).map(mapText).filter(Boolean);
      if (!locations.length) return [];
      const roots = [{location:locations[0], time:minutes(stop.time)}], end = minutes(stop.endTime), start = minutes(stop.time);
      // Once a tour finishes, its last destination is the useful nearby root.
      if (stop.kind === "tour" && locations.length > 1 && end !== null && start !== null && end >= start)
        roots.push({location:locations.at(-1), time:end});
      return roots;
    }),
    timed = roots.filter(root => root.time !== null).sort((a,b) => a.time - b.time),
    preceding = targetTime === null ? [] : timed.filter(root => root.time <= targetTime),
    unique = [...new Set(roots.map(root => root.location))],
    anchor = targetTime !== null && timed.length
      ? (preceding.at(-1) || timed[0]).location : unique.length === 1 ? unique[0] : "";
  return anchor && normalizedVenue(anchor) !== normalizedVenue(venue) ? `${venue} near ${anchor}`
    : anchor || "";
}

export function activityMapSelection(trip, selection) {
  if (!trip || selection?.tripId !== trip.id) return null;
  const entryType = selection.entryType === "meal" ? "meal" : "activity";
  const stop = (entryType === "meal" ? trip.foodPlaces || [] : trip.days.flatMap(day => day.stops || []))
    .find(item => item.id === selection.stopId);
  if (!stop) return null;
  const mealQuery = entryType === "meal" ? mealMapQuery(trip, stop) : "";
  const locations = (entryType === "meal" ? [stop.venue || stop.location || mealQuery] : stop.kind === "tour" ? stop.tourLocations || [] : [stop.location])
    .map(value => String(value || "").trim()).filter(Boolean);
  const index = Number.isInteger(selection.locationIndex) && selection.locationIndex >= 0 &&
    selection.locationIndex < locations.length ? selection.locationIndex : 0;
  const location = locations[index] || "", day = mapEntryDay(trip, stop, entryType),
    query = entryType === "meal" ? mealQuery : mapLocationQuery(location);
  return { stop, entryType, locations, index, location, query, day };
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
