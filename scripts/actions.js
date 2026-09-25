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
      if (el.dataset.timePart) {
        const match = /^(\d{2}):(\d{2})$/.exec(String(r.time || "")),
          currentHour24 = match ? Number(match[1]) : 0,
          currentHour12 = currentHour24 % 12 || 12,
          currentClock = match
            ? `${String(currentHour12).padStart(2, "0")}:${match[2]}`
            : "12:00",
          currentPeriod = currentHour24 >= 12 ? "PM" : "AM",
          clock = el.dataset.timePart === "clock" ? el.value : currentClock,
          period = el.dataset.timePart === "period" ? el.value : currentPeriod,
          [hour, minute] = clock.split(":").map(Number),
          hour24 = (hour % 12) + (period === "PM" ? 12 : 0);
        r.time = `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      } else {
        r[el.dataset.recordField] = el.value;
      }
      syncRecordExpense(t, type, r);
    }, rerender);
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

  return {
    changeTrip,
    mutateWithUndo,
    updateField,
    updateRecordField,
  };
}
