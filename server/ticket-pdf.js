import { readFileSync } from "node:fs";
import { code128 } from "@bwip-js/node";
import PDFDocument from "pdfkit";
import { ticketCodePattern } from "../src/ticket-types.js";

export const ticketVenue = "Selah Hall";
export const ticketDate = "Jumat, 27 November 2026";

const titleArt = readFileSync(new URL("./assets/ticket-title.png", import.meta.url));
const ink = "#201408";
const paper = "#ECE0CC";

export async function renderTicketPdf(code, kind, position) {
  if (!ticketCodePattern.test(code)) throw new Error("Invalid ticket code");
  const barcode = await code128({
    text: code,
    scale: 4,
    height: 15,
    paddingwidth: 12,
    backgroundcolor: "FFFAF1",
  });
  const doc = new PDFDocument({
    size: [672, 252],
    margin: 0,
    info: { Title: "Tiket REDIAL 5.0 - " + code },
  });
  const chunks = [];
  const result = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.path("M 40 12 H 443 C 443 43 493 43 493 12 H 632 Q 632 40 660 40 V 212 Q 632 212 632 240 H 493 C 493 209 443 209 443 240 H 40 Q 40 212 12 212 V 40 Q 40 40 40 12 Z").fill(paper);
  doc.strokeColor("#A56D22").lineWidth(0.8).dash(5, { space: 4 });
  doc.path("M 48 23 H 433 Q 440 49 461 50 V 202 Q 440 203 433 229 H 48 Q 42 209 24 204 V 48 Q 42 43 48 23 Z").stroke();
  doc.path("M 503 23 H 624 Q 630 43 648 48 V 204 Q 630 209 624 229 H 503 Q 496 203 475 202 V 50 Q 496 49 503 23 Z").stroke();
  doc.undash();

  // The lower edge of the source title sits next to labels from the sample.
  doc.save().path("M 33 40 H 408 V 62 H 443 V 164 H 369 V 146 H 33 Z").clip();
  doc.image(titleArt, 33, 40, { width: 410 });
  doc.restore();

  doc.fillColor("#735337").font("Courier-Bold").fontSize(10);
  doc.text("TANGGAL", 60, 171, { lineBreak: false });
  doc.text("LOKASI", 280, 171, { lineBreak: false });
  doc.fillColor(ink).font("Courier").fontSize(13);
  doc.text(ticketDate, 60, 187, { lineBreak: false });
  doc.text(ticketVenue, 280, 187, { lineBreak: false });

  const stub = { width: 166, align: "center", lineBreak: false };
  doc.font("Times-Bold").fontSize(20).text("TIKET MASUK", 480, 57, stub);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#735337")
    .text(kind === "DUO" ? `DUO  /  ${position} DARI 2` : "SINGLE", 480, 87, stub);
  doc.roundedRect(485, 106, 156, 65, 4).fill("#FFFAF1");
  doc.image(barcode, 486, 110, { width: 154, height: 55 });
  doc.fillColor(ink).font("Courier-Bold").fontSize(12).text(code, 480, 181, stub);
  doc.end();
  return result;
}
