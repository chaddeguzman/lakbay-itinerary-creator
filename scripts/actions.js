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
      obj[field] = el.type === "checkbox" ? el.checked : el.value;
    }, rerender);
  }

  return {
    changeTrip,
    mutateWithUndo,
    updateField,
    updateRecordField,
  };
}
