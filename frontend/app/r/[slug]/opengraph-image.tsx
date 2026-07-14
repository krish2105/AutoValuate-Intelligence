import { ImageResponse } from "next/og";
import { loadSharedValuation } from "@/lib/supabase";

export const runtime = "edge";
export const alt = "AutoValuate — shared car valuation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0f1620";
const SURFACE = "#151d28";
const ACCENT = "#f5a623";
const FG = "#f2f5f8";
const MUTED = "#8a95a5";

const aed = (n: number) => "AED " + Math.round(n).toLocaleString("en-US");

/** Social share card — generated at the edge with no external service (free). */
export default async function Image({ params }: { params: { slug: string } }) {
  const shared = await loadSharedValuation(params.slug);

  const label = shared?.label ?? "Car valuation";
  const mid = shared ? aed(shared.mid_aed) : "AutoValuate";
  const lo = shared ? aed(shared.result.valuation.price_low_aed) : "";
  const hi = shared ? aed(shared.result.valuation.price_high_aed) : "";
  const cov = shared ? Math.round(shared.result.valuation.interval_coverage * 100) : 0;

  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        justifyContent: "space-between", background: BG, padding: 64,
        fontFamily: "sans-serif", color: FG,
      }}>
        {/* brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, background: ACCENT,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 30, fontWeight: 800, color: BG,
          }}>A</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>AutoValuate</span>
            <span style={{ fontSize: 14, color: MUTED, letterSpacing: 3 }}>INTELLIGENCE</span>
          </div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 34, color: MUTED }}>{label}</span>
          <span style={{ fontSize: 96, fontWeight: 800, color: ACCENT, letterSpacing: -2 }}>{mid}</span>
          {shared && (
            <span style={{ fontSize: 26, color: MUTED }}>
              {lo} – {hi} · calibrated {cov}% confidence range
            </span>
          )}
        </div>

        {/* footer strip */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: SURFACE, borderRadius: 16, padding: "18px 28px",
        }}>
          <span style={{ fontSize: 22, color: FG }}>
            Damage-aware · explainable · every figure Verifier-checked
          </span>
          <span style={{ fontSize: 22, color: ACCENT, fontWeight: 700 }}>auto-valuate-intelligence.vercel.app</span>
        </div>
      </div>
    ),
    size,
  );
}
