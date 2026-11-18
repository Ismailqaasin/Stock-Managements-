import PDFDocument from "pdfkit";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
export const catalog = JSON.parse(
  readFileSync("database/report-labels.json", "utf8"),
);

export function pdf(res, resource, settings, rows, query, so, dir) {
  const spec = catalog[resource];
  function cell(row, key) {
    const value = row[key];
    if (value == null) return "—";
    if (
      ["selling_price", "total_amount", "unit_price", "line_total"].includes(
        key,
      )
    )
      return (
        settings.currency_symbol +
        Number(value).toLocaleString(so ? "so" : "en", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    if (key === "date") {
      const [y, m, d] = String(value).slice(0, 10).split("-");
      if (settings.date_format === "DD/MM/YYYY") return `${d}/${m}/${y}`;
      if (settings.date_format === "MM/DD/YYYY") return `${m}/${d}/${y}`;
    }
    if (
      so &&
      ["status", "type", "action", "condition"].includes(key) &&
      Object.hasOwn(catalog.values, value)
    )
      return catalog.values[value];
    return String(value).slice(0, 600);
  }

  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    bufferPages: true,
    info: { Title: spec[so ? 1 : 0], Author: settings.system_name },
  });
  res.type("application/pdf");
  doc.pipe(res);
  const W = 515;
  const header = () => {
    doc
      .fillColor("#23563f")
      .font("Helvetica-Bold")
      .fontSize(22)
      .text(settings.system_name, 40, 40);
    doc
      .fontSize(10)
      .fillColor("#58675f")
      .font("Helvetica")
      .text(
        [
          settings.company_name,
          settings.company_address,
          settings.company_phone,
          settings.company_email,
        ]
          .filter(Boolean)
          .join("  |  "),
      );
    if (settings.logo_path) {
      const logo = path.join(dir, "uploads", path.basename(settings.logo_path));
      if (existsSync(logo) && !logo.endsWith(".webp"))
        doc.image(logo, 480, 34, { fit: [50, 30] });
    }
    doc
      .moveDown(1.3)
      .fillColor("#172d22")
      .font("Helvetica-Bold")
      .fontSize(17)
      .text(spec[so ? 1 : 0]);
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(
        Object.entries(query)
          .filter(([k]) => !["page", "pageSize"].includes(k))
          .map(([k, v]) => `${k}: ${v}`)
          .join("   "),
      );
    doc.moveDown();
  };
  header();
  function table(keys, data) {
    const w = W / keys.length;
    const head = () => {
      let y = doc.y;
      doc.rect(40, y, W, 24).fill("#e8f0e9");
      keys.forEach((k, i) =>
        doc
          .fillColor("#264532")
          .font("Helvetica-Bold")
          .fontSize(8)
          .text(
            so ? (catalog.fields[k] ?? k) : k.replaceAll("_", " "),
            44 + i * w,
            y + 7,
            { width: w - 7, lineBreak: false },
          ),
      );
      doc.y = y + 27;
    };
    head();
    for (const row of data) {
      const vals = keys.map((k) => cell(row, k));
      doc.font("Helvetica").fontSize(9);
      const height = Math.max(
        23,
        ...vals.map((s) => doc.heightOfString(s, { width: w - 8 }) + 10),
      );
      if (doc.y + height > 764) {
        doc.addPage();
        header();
        head();
      }
      const y = doc.y;
      vals.forEach((s, i) =>
        doc
          .font("Helvetica")
          .fillColor("#293a30")
          .text(s, 44 + i * w, y + 4, { width: w - 8 }),
      );
      doc
        .moveTo(40, y + height)
        .lineTo(555, y + height)
        .strokeColor("#d6dfd8")
        .stroke();
      doc.y = y + height + 2;
    }
  }
  table(spec.slice(2), rows);
  if (!rows.length)
    doc.text(so ? "Xog lama helin" : "No matching records.", 44, doc.y + 8);
  for (const row of rows)
    if (row.items) {
      doc.moveDown();
      table(
        resource === "orders"
          ? ["product", "quantity", "unit_price", "line_total"]
          : resource === "returns"
            ? ["product", "quantity", "condition"]
            : ["product", "quantity"],
        row.items,
      );
    }
  const range = doc.bufferedPageRange(),
    date = new Intl.DateTimeFormat(so ? "so" : "en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: settings.time_zone,
    }).format(new Date());
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc
      .fillColor("#627168")
      .fontSize(8)
      .text(`${date}  ·  ${settings.time_zone}`, 40, 786, { lineBreak: false });
    doc.text(`${so ? "Bogga" : "Page"} ${i + 1} / ${range.count}`, 465, 786, {
      lineBreak: false,
    });
  }
  doc.end();
}
