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
