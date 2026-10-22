export function activityMapSelection(trip, selection) {
  if (!trip || selection?.tripId !== trip.id) return null;
  const stop = trip.days.flatMap(day => day.stops || []).find(item => item.id === selection.stopId);
  if (!stop) return null;
  const locations = (stop.kind === "tour" ? stop.tourLocations || [] : [stop.location])
    .map(value => String(value || "").trim()).filter(Boolean);
  const index = Number.isInteger(selection.locationIndex) && selection.locationIndex >= 0 &&
    selection.locationIndex < locations.length ? selection.locationIndex : 0;
  const location = locations[index] || "", destination = String(trip.destination || "").trim();
  const query = location && destination && !location.toLowerCase().includes(destination.toLowerCase())
    ? `${location}, ${destination}` : location;
  return { stop, locations, index, location, query };
}

export function placeEmbedUrl(query, key) {
  const cleanKey = String(key || "").trim();
  if (!query || !cleanKey || cleanKey.startsWith("__")) return "";
  return `https://www.google.com/maps/embed/v1/place?${new URLSearchParams({key:cleanKey,q:query})}`;
}

export function selectActivityMap(current, tripId, stopId) {
  if (current?.tripId === tripId && current.stopId === stopId) return current;
  return { tripId, stopId, locationIndex: 0 };
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
    const card = event.target.closest("[data-map-card]");
    if (!card || event.target.closest(".activity-drag-handle")) return;
    if (event.target.closest(".activity-compact") && !event.target.closest("button,a,input,select,textarea,label")) {
      card.classList.toggle("is-expanded");
    }
    selectActivity(card.dataset.stop);
  }, true);
}
