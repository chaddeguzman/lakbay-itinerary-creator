export function createExportTools({ fmt, dayDateLabel }) {
  function download(data, name, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportPng(t) {
    const days = t.days,
      h = 190 + days.reduce((n, d) => n + 90 + d.stops.length * 76, 0),
      c = document.createElement("canvas");
    c.width = 1200;
    c.height = Math.max(h, 500);
    const x = c.getContext("2d");
    x.fillStyle = "#f4ead5";
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#174f4b";
    x.font = "bold 54px Georgia";
    x.fillText(t.name, 70, 80);
    x.font = "24px Georgia";
    x.fillText(
      `${t.destination}  -  ${fmt(t.startDate)} - ${fmt(t.endDate)}`,
      70,
      120,
    );
    let y = 175;
    days.forEach((d, i) => {
      x.fillStyle = "#b85f45";
      x.font = "bold 27px Georgia";
      x.fillText(`DAY ${i}  -  ${d.title}`, 70, y);
      y += 38;
      x.fillStyle = "#586661";
      x.font = "19px Georgia";
      x.fillText(dayDateLabel(d.date), 70, y);
      y += 32;
      d.stops.forEach((s) => {
        const time =
          s.timeMode === "range" && s.endTime
            ? `${s.time || "-"} - ${s.endTime}`
            : s.time || "-";
        x.fillStyle = "#253735";
        x.font = "bold 20px Georgia";
        x.fillText(`${time}   ${s.activity || "Untitled stop"}`, 90, y);
        x.font = "17px Georgia";
        x.fillText(s.location || "", 210, y + 25);
        if (s.notes) {
          x.fillStyle = "#6f756e";
          x.fillText(s.notes.slice(0, 90), 210, y + 48);
        }
        y += 76;
      });
      y += 28;
    });
    c.toBlob((b) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = t.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  return {
    download,
    exportPng,
  };
}
