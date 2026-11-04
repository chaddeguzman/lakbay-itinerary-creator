// Session-only presentation state. Trip records and backups stay independent.
export function createDayWorkspace() {
  const selectedDays = new Map();
  let scope = null, openEntry = null, activeTab = "itinerary";

  function read(trip, tab = activeTab) {
    const days = trip?.days || [];
    let dayId = selectedDays.get(trip?.id);
    if (!days.some(day => day.id === dayId)) dayId = days[0]?.id || null;
    if (trip?.id) selectedDays.set(trip.id, dayId);
    const nextScope = JSON.stringify([trip?.id, tab, dayId]);
    if (scope !== nextScope) openEntry = null;
    scope = nextScope;
    activeTab = tab;
    if (openEntry && !validEntry(trip, tab, dayId, openEntry)) openEntry = null;
    return { dayId, openEntry: openEntry ? { ...openEntry } : null };
  }

  function validEntry(trip, tab, dayId, entry) {
    const day = trip?.days?.find(item => item.id === dayId);
    if (entry.kind === "activity")
      return tab === "itinerary" && !!day?.stops?.some(stop => stop.id === entry.id);
    if (entry.kind !== "meal") return false;
    return !!trip?.foodPlaces?.some(meal => meal.id === entry.id &&
      (meal.visitDate ? !!day && meal.visitDate === day.date : tab === "food"));
  }

  function selectDay(trip, dayId) {
    if (!trip?.days?.some(day => day.id === dayId)) return;
    if (selectedDays.get(trip.id) !== dayId) openEntry = null;
    selectedDays.set(trip.id, dayId);
  }

  function setTab(tab) {
    if (activeTab !== tab) { openEntry = null; scope = null; }
    activeTab = tab;
  }

  function setEntry(trip, tab, entry, toggle) {
    const state = read(trip, tab);
    const same = openEntry?.kind === entry.kind && openEntry?.id === entry.id;
    openEntry = validEntry(trip, tab, state.dayId, entry) && !(toggle && same)
      ? { kind: entry.kind, id: entry.id } : null;
  }

  return { read, selectDay, setTab,
    toggleEntry: (trip, tab, entry) => setEntry(trip, tab, entry, true),
    openEntry: (trip, tab, entry) => setEntry(trip, tab, entry, false),
  };
}

// Replacing the pane should not strand keyboard users outside their day.
export function restoreWorkspaceFocus(root, focus) {
  if (!focus) return;
  const card = [...root.querySelectorAll(".panel.active .workspace-entry, .panel.active .meal-card")]
    .find(element => (focus.kind === "meal" ? element.dataset.record : element.dataset.stop) === focus.id);
  let target = card?.querySelector(focus.control);
  if (!target?.getClientRects().length)
    target = card?.querySelector(focus.kind === "meal" ? ":scope > summary" : ".workspace-entry-summary");
  if (!target?.getClientRects().length)
    target = root.querySelector('.panel.active .workspace-day[aria-pressed="true"]');
  target?.focus({preventScroll: true});
  if (focus.selection && target?.setSelectionRange) target.setSelectionRange(...focus.selection);
}
