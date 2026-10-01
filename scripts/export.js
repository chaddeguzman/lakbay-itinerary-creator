import { scheduledEntries } from "./meals.js";

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const PDF_WIDTH = 595.28;
const PDF_HEIGHT = 841.89;

function pdfFromJpegs(pages) {
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const add = (bytes) => { chunks.push(bytes); length += bytes.length; };
  const write = (value) => add(encoder.encode(value));
  const start = (number) => { offsets[number] = length; write(`${number} 0 obj\n`); };
  const end = () => write("endobj\n");

  write("%PDF-1.4\n%Lakbay\n");
  start(1);
  write("<< /Type /Catalog /Pages 2 0 R >>\n");
  end();
  start(2);
  write(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>\n`);
  end();

  pages.forEach((jpeg, i) => {
    const page = 3 + i * 3;
    const content = page + 1;
    const image = page + 2;
    const commands = `q\n${PDF_WIDTH} 0 0 ${PDF_HEIGHT} 0 0 cm\n/Im0 Do\nQ\n`;
    start(page);
    write(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>\n`);
    end();
    start(content);
    write(`<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}endstream\n`);
    end();
    start(image);
    write(`<< /Type /XObject /Subtype /Image /Width ${PAGE_WIDTH} /Height ${PAGE_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    add(jpeg);
    write("\nendstream\n");
    end();
  });

  const xref = length;
  write(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i++) {
    write(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  write(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: "application/pdf" });
}

function wrappedLines(context, value, width) {
  const lines = [];
  for (const paragraph of String(value ?? "").split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      for (const character of Array.from(word)) {
        if (line && context.measureText(line + character).width > width) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function createExportTools({ fmt, dayDateLabel }) {
  function download(data, name, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportPdf(trip) {
    const styles = getComputedStyle(document.documentElement);
    const themeColor = (name) => styles.getPropertyValue(name).trim();
    const colors = {
      background: themeColor("--paper"),
      band: document.documentElement.dataset.theme === "dark" ? themeColor("--day-even") : "#e6eee7",
      ink: themeColor("--ink"),
      accent: themeColor("--teal"),
      muted: themeColor("--muted"),
      line: themeColor("--line"),
    };
    const margin = 84;
    const textWidth = PAGE_WIDTH - margin * 2;
    const bottom = PAGE_HEIGHT - 105;
    const pages = [];
    let canvas;
    let context;
    let y;

    function finishPage() {
      context.strokeStyle = colors.line;
      context.beginPath();
      context.moveTo(margin, PAGE_HEIGHT - 79);
      context.lineTo(PAGE_WIDTH - margin, PAGE_HEIGHT - 79);
      context.stroke();
      context.fillStyle = colors.muted;
      context.font = "17px Arial";
      context.fillText(`Page ${pages.length + 1}`, PAGE_WIDTH - margin - 60, PAGE_HEIGHT - 48);
      const binary = atob(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
      pages.push(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
    }

    function newPage(continued = false) {
      canvas = document.createElement("canvas");
      canvas.width = PAGE_WIDTH;
      canvas.height = PAGE_HEIGHT;
      context = canvas.getContext("2d");
      context.fillStyle = colors.background;
      context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      context.fillStyle = colors.accent;
      context.fillRect(0, 0, PAGE_WIDTH, 15);
      context.font = "bold 27px Georgia";
      context.fillText("LAKBAY", margin, 91);
      context.fillStyle = colors.muted;
      context.font = "19px Arial";
      context.fillText(continued ? `${trip.name} (continued)` : "Travel itinerary", margin + 165, 89);
      y = 155;
    }

    function ensureSpace(height) {
      if (y + height <= bottom) return;
      finishPage();
      newPage(true);
    }

    function drawText(value, font, color, lineHeight, indent = 0) {
      context.font = font;
      const lines = wrappedLines(context, value, textWidth - indent);
      for (const line of lines) {
        ensureSpace(lineHeight);
        context.font = font;
        context.fillStyle = color;
        context.fillText(line, margin + indent, y);
        y += lineHeight;
      }
    }

    newPage();
    drawText(trip.name || "Untitled trip", "bold 47px Georgia", colors.accent, 58);
    y += 4;
    drawText(`${trip.destination || ""}  |  ${fmt(trip.startDate)} - ${fmt(trip.endDate)}`, "23px Arial", colors.muted, 31);
    if (trip.description) {
      y += 10;
      drawText(trip.description, "20px Arial", colors.muted, 29);
    }
    y += 34;

    trip.days.forEach((day, index) => {
      context.font = "bold 29px Georgia";
      const headingLines = wrappedLines(context, `DAY ${index}  ${day.title || "Untitled day"}`, textWidth - 20);
      ensureSpace(headingLines.length * 36 + 92);
      context.fillStyle = colors.band;
      context.fillRect(margin - 14, y - 29, textWidth + 28, headingLines.length * 36 + 46);
      drawText(`DAY ${index}  ${day.title || "Untitled day"}`, "bold 29px Georgia", colors.accent, 36, 6);
      drawText(dayDateLabel(day.date), "19px Arial", colors.muted, 27, 6);
      y += 25;

      const entries = scheduledEntries(trip, day);
      if (!entries.length) {
        drawText("No scheduled entries", "italic 20px Georgia", colors.muted, 30, 15);
      }
      entries.forEach(({ kind, record }) => {
        ensureSpace(108);
        const time = record.timeMode === "range" && record.endTime
          ? `${record.time || "-"} - ${record.endTime}`
          : record.time || "-";
        const label = kind === "meal"
          ? `${record.mealType || "Meal"}: ${record.venue || "Meal"}`
          : record.activity || "Untitled stop";
        drawText(`${time}  ${label}`, "bold 21px Arial", colors.ink, 30, 16);
        const location = record.tourLocations?.length
          ? record.tourLocations.join("  >  ")
          : record.location;
        if (location) drawText(location, "18px Arial", colors.muted, 25, 34);
        if (record.notes) drawText(record.notes, "18px Arial", colors.muted, 25, 34);
        y += 20;
      });
      y += 20;
    });

    finishPage();
    const filename = trip.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "trip";
    download(pdfFromJpegs(pages), `${filename}.pdf`, "application/pdf");
  }

  return { download, exportPdf };
}
