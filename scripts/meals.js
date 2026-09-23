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

export function unscheduleMissingDays(trip) {
  const dates = new Set((trip.days || []).map((day) => day.date));
  (trip.foodPlaces || []).forEach((meal) => {
    if (meal.visitDate && !dates.has(meal.visitDate)) meal.visitDate = "";
  });
}
