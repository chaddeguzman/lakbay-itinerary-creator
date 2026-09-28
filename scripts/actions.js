export function createActions({
  Storage,
  recordCollection,
  rememberUndo,
  render,
  syncRecordExpense,
}) {
  function mutateWithUndo(label, mut) {
    const before = Storage.read();
    Storage.mutate(mut);
    rememberUndo(label, before);
  }

  function changeTrip(mut, shouldRender = true) {
    const id = Storage.active()?.id;
    Storage.mutate((s) => {
      const t = s.trips.find((x) => x.id === id);
      if (t) mut(t);
    });
    if (shouldRender) render();
  }

  function updateRecordField(e, rerender) {
    const el = e.target,
      card = el.closest("[data-record]");
    if (!card) return;
    changeTrip((t) => {
      const type = card.dataset.recordType,
        r = recordCollection(t, type).find((x) => x.id === card.dataset.record);
      if (!r) return;
      r[el.dataset.recordField] = el.value;
      syncRecordExpense(t, type, r);
    }, rerender);
  }

  function updateScheduledTime(picker, value) {
    const field = picker.dataset.timeField,
      record = picker.closest("[data-record]");
    if (field !== "time" && field !== "endTime") return;
    if (record) {
      changeTrip((t) => {
        const type = record.dataset.recordType,
          item = recordCollection(t, type).find((x) => x.id === record.dataset.record);
        if (!item) return;
        item[field] = value;
        syncRecordExpense(t, type, item);
      });
      return;
    }
    const day = picker.closest("[data-day]"),
      stop = picker.closest("[data-stop]");
    if (!day || !stop) return;
    changeTrip((t) => {
      const item = t.days.find((x) => x.id === day.dataset.day)
        ?.stops.find((x) => x.id === stop.dataset.stop);
      if (item) item[field] = value;
    });
  }
  function updateField(e, rerender = true) {
    const el = e.target,
      field = el.dataset.field;
    if (!field) return;
    const day = el.closest("[data-day]"),
      stop = el.closest("[data-stop]"),
      item = el.closest("[data-item]"),
      expense = el.closest("[data-expense]");
    changeTrip((t) => {
      let obj;
      if (item) obj = t.packingList.find((x) => x.id === item.dataset.item);
      else {
        const d = t.days.find((x) => x.id === day.dataset.day);
        obj = expense
          ? (d.expenses || []).find((x) => x.id === expense.dataset.expense)
          : stop
            ? d.stops.find((x) => x.id === stop.dataset.stop)
            : d;
      }
      obj[field] = el.type === "checkbox" ? el.checked : field === "title" ? el.value.slice(0, 40) : el.value;
    }, rerender);
  }

  function toggleScheduledEntryDone(dayId, entryId, kind) {
    if (kind !== "stop" && kind !== "meal") return null;
    const before = Storage.read(),
      trip = before.trips.find((t) => t.id === before.activeTripId) || before.trips[0],
      day = trip?.days.find((d) => d.id === dayId);
    if (!day) return null;
    const entry = kind === "stop"
      ? day.stops.find((item) => item.id === entryId)
      : trip.foodPlaces.find((item) => item.id === entryId && day.date && item.visitDate === day.date);
    if (!entry) return null;

    const done = !entry.done,
      type = kind === "meal" ? "Meal" : entry.kind === "tour" ? "Tour" : "Activity",
      label = kind === "meal" ? entry.venue || entry.mealType || "Meal" : entry.activity || type;
    Storage.mutate((state) => {
      const current = state.trips.find((t) => t.id === trip.id),
        currentDay = current.days.find((d) => d.id === dayId),
        record = kind === "stop"
          ? currentDay.stops.find((item) => item.id === entryId)
          : current.foodPlaces.find((item) => item.id === entryId && item.visitDate === currentDay.date);
      record.done = done;
    });
    render();
    rememberUndo(done ? `${type} marked done` : `${type} reopened`, before);
    return { done, label };
  }

  return {
    changeTrip,
    mutateWithUndo,
    toggleScheduledEntryDone,
    updateField,
    updateRecordField,
    updateScheduledTime,
  };
}
