export const MEAL_TYPES = ["Breakfast", "Lunch", "Snacks", "Dinner", "Other"];

export function mealGroup(value) {
  if (String(value || "").toLowerCase() === "snack") return "Snacks";
  const match = MEAL_TYPES.find((type) => type.toLowerCase() === String(value || "").toLowerCase());
  return match || "Other";
}

export function mealsForDay(trip, day) {
  return (trip.foodPlaces || []).filter((meal) => meal.visitDate === day.date)
    .sort((a, b) => !a.time && b.time ? 1 : a.time && !b.time ? -1 :
      String(a.time || "").localeCompare(String(b.time || "")));
}

export function scheduledEntries(trip, day) {
  return [
    ...(day.stops || []).map((record, index) => ({ kind: "stop", record, index })),
    ...mealsForDay(trip, day).map((record, index) => ({ kind: "meal", record, index })),
  ].sort((a, b) => {
    const aTime = a.record.time || "";
    const bTime = b.record.time || "";
    if (!aTime && bTime) return 1;
    if (aTime && !bTime) return -1;
    return aTime.localeCompare(bTime) ||
      (a.kind === b.kind ? a.index - b.index : a.kind === "stop" ? -1 : 1);
  });
}

export function defaultTravelDay(trip, todayIso) {
  const days = trip?.days || [];
  return days.find((day) => day.date === todayIso) || days[0] || null;
}

function timeMinutes(time) {
  if (!/^\d{2}:\d{2}$/.test(time || "")) return null;
  const [hour, minute] = time.split(":").map(Number);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

function isActive(entry, nowMinutes) {
  const { time, endTime, timeMode } = entry.record;
  if (timeMode !== "range") return false;
  const start = timeMinutes(time), end = timeMinutes(endTime);
  if (start === null || end === null || start === end) return false;
  return start < end
    ? start <= nowMinutes && nowMinutes < end
    : nowMinutes >= start || nowMinutes < end;
}

export function nextScheduledEntry(trip, day, { todayIso, nowMinutes }) {
  if (!day) return null;
  const unfinished = scheduledEntries(trip, day).filter((entry) => !entry.record.done);
  if (day.date !== todayIso) return unfinished[0] || null;
  return unfinished.find((entry) => isActive(entry, nowMinutes)) ||
    unfinished.find((entry) => {
      const start = timeMinutes(entry.record.time);
      return start !== null && start >= nowMinutes;
    }) ||
    unfinished.find((entry) => !entry.record.time) || null;
}

export function unscheduleMissingDays(trip) {
  const dates = new Set((trip.days || []).map((day) => day.date));
  (trip.foodPlaces || []).forEach((meal) => {
    if (meal.visitDate && !dates.has(meal.visitDate)) meal.visitDate = "";
  });
}
