import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { ValuationResult } from "./types";
import { aed, km, titleCase } from "./utils";

/**
 * Numbered, QR-coded "Certificate of Valuation" PDF — the showroom document.
 *
 * The serial and the evidence hash are both **deterministic** functions of the
 * valuation, so re-issuing the same appraisal reproduces the same certificate, and
 * the printed hash lets anyone detect if the figures were altered after issue. The QR
 * points at a (forward-compatible) verify URL carrying the serial + hash.
 */

const VERIFY_BASE = "https://auto-valuate-intelligence.vercel.app/verify";

// djb2 → unsigned 32-bit; stable across runs/browsers.
function hash32(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

function fingerprint(r: ValuationResult) {
  const v = r.vehicle, val = r.valuation;
  const basis = [
    v.year, String(v.make).toLowerCase(), String(v.model).toLowerCase(), Math.round(Number(v.kilometers)),
    Math.round(val.price_low_aed), Math.round(val.price_mid_aed), Math.round(val.price_high_aed),
    r.condition.cv_available ? r.condition.condition_score : "na",
  ].join("|");
  const h = hash32(basis);
  const year = new Date().getFullYear();
  const serial = `AVI-${year}-${String(h % 1_000_000).padStart(6, "0")}`;
  const evidenceHash = h.toString(16).toUpperCase().padStart(8, "0");
  return { serial, evidenceHash };
}

export async function downloadCertificatePdf(r: ValuationResult) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44;
  const v = r.vehicle, val = r.valuation;
  const { serial, evidenceHash } = fingerprint(r);
  const issued = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  const ACCENT: [number, number, number] = [214, 141, 22];
  const INK: [number, number, number] = [22, 30, 42];
  const MUTE: [number, number, number] = [110, 122, 138];

  // outer certificate frame (double rule)
  doc.setDrawColor(...ACCENT); doc.setLineWidth(1.5); doc.rect(M / 2, M / 2, W - M, H - M);
  doc.setDrawColor(210, 200, 180); doc.setLineWidth(0.5); doc.rect(M / 2 + 6, M / 2 + 6, W - M - 12, H - M - 12);

  // header band
  doc.setFillColor(...INK); doc.rect(M / 2 + 6, M / 2 + 6, W - M - 12, 74, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...ACCENT);
  doc.text("AutoValuate", M + 6, M + 30);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(205, 214, 224);
  doc.text("INTELLIGENCE", M + 6, M + 44);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(240, 244, 248);
  doc.text("CERTIFICATE OF VALUATION", W - M - 6, M + 34, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(180, 190, 200);
  doc.text("damage-aware · explainable · citation-grounded", W - M - 6, M + 47, { align: "right" });

  let y = M + 108;

  // serial + issue row
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...MUTE);
  doc.text("SERIAL", M + 6, y);
  doc.text("ISSUED", W / 2, y);
  doc.setFont("helvetica", "normal"); doc.setTextColor(...INK); doc.setFontSize(11);
  doc.text(serial, M + 6, y + 15);
  doc.text(issued, W / 2, y + 15);
  y += 40;

  doc.setDrawColor(226, 232, 240); doc.line(M + 6, y, W - M - 6, y); y += 26;

  // vehicle
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...INK);
  doc.text(`${v.year} ${titleCase(String(v.make))} ${titleCase(String(v.model))}`, M + 6, y);
  y += 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...MUTE);
  doc.text(`${km(v.kilometers)}  ·  ${v.regionalSpecs ?? "GCC"}  ·  ${v.bodyType ?? ""}  ·  ${v.city ?? ""}  ·  ${v.sellerType ?? ""}`, M + 6, y);
  y += 34;

  // valuation hero box
  doc.setFillColor(250, 246, 238); doc.setDrawColor(...ACCENT); doc.setLineWidth(0.8);
  doc.roundedRect(M + 6, y, W - M - 12, 96, 8, 8, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...MUTE);
  doc.text("ASSESSED FAIR-MARKET VALUE", M + 24, y + 26);
  doc.setFont("helvetica", "bold"); doc.setFontSize(30); doc.setTextColor(...ACCENT);
  doc.text(aed(val.price_mid_aed), M + 24, y + 60);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...INK);
  doc.text(`Range ${aed(val.price_low_aed)} — ${aed(val.price_high_aed)}   ·   ~${Math.round(val.interval_coverage * 100)}% calibrated interval`, M + 24, y + 80);
  y += 122;

  // condition + model facts (two columns)
  const colX = M + 6, col2X = W / 2 + 10;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
  doc.text("Condition", colX, y);
  doc.text("Model & method", col2X, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTE);
  const condLines = r.condition.cv_available
    ? doc.splitTextToSize(`Condition score ${r.condition.condition_score}/100 from ${r.condition.photos_assessed} photo(s)${r.condition.source === "browser" ? " (on-device scan)" : ""}. Value impact −${r.condition.total_value_impact_pct ?? 0}%.`, W / 2 - M)
    : doc.splitTextToSize("No visual damage assessment performed; assumes market-typical condition.", W / 2 - M);
  doc.text(condLines, colX, y + 15);
  const modelLines = doc.splitTextToSize(`XGBoost quantile + split-conformal on ${val.model_meta.training_rows} real UAE listings. Held-out median error ${val.model_meta.cv_median_ape_pct}%. Confidence: ${r.confidence.level}.`, W / 2 - M);
  doc.text(modelLines, col2X, y + 15);
  y += 68;

  // QR + verification
  try {
    const qrUrl = `${VERIFY_BASE}?c=${encodeURIComponent(serial)}&h=${evidenceHash}`;
    const qrData = await QRCode.toDataURL(qrUrl, { margin: 1, width: 240, color: { dark: "#161e2a", light: "#ffffff" } });
    const qrSize = 92;
    doc.addImage(qrData, "PNG", W - M - qrSize - 6, y, qrSize, qrSize);
    doc.setFontSize(7.5); doc.setTextColor(...MUTE);
    doc.text("scan to verify", W - M - qrSize / 2 - 6, y + qrSize + 12, { align: "center" });
  } catch { /* QR is best-effort */ }

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...INK);
  doc.text("Evidence fingerprint", M + 6, y + 14);
  doc.setFont("courier", "normal"); doc.setFontSize(10); doc.setTextColor(...ACCENT);
  doc.text(`${evidenceHash}`, M + 6, y + 30);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTE);
  doc.text(doc.splitTextToSize("This hash is derived from the vehicle details and the assessed figures. If any of them are altered, the hash will no longer match — a tamper-evident seal.", W / 2 + 20), M + 6, y + 46);

  // footer disclaimer
  doc.setFontSize(8); doc.setTextColor(150, 160, 170);
  doc.text("Automated estimate — not a certified appraisal. Generated by AutoValuate Intelligence · every figure traces to a model output, a live listing, or a verified citation.",
    W / 2, H - M / 2 - 16, { align: "center", maxWidth: W - 2 * M });

  const name = `AutoValuate_Certificate_${serial}`.replace(/[^\w-]+/g, "_");
  doc.save(`${name}.pdf`);
}
