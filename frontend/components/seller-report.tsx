"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Quote, Download } from "lucide-react";
import type { ValuationResult } from "@/lib/types";
import { downloadReportPdf } from "@/lib/pdf";
import { chunkParagraph, displayForCitation } from "@/lib/report";
import { SectionCard, Pill } from "./ui";

function evidenceFor(evidence: ValuationResult["evidence"], id: string): string | null {
  for (const group of Object.values(evidence)) {
    if (group[id]) {
      const d = group[id];
      const parts = Object.entries(d).map(([k, v]) => `${k}: ${v}`);
      return parts.join(" · ");
    }
  }
  return null;
}

/** Splits report text into runs, turning [ID] markers into interactive citation chips. */
export function SellerReport({ result }: { result: ValuationResult }) {
  const [open, setOpen] = useState<string | null>(null);
  const { report, evidence, report_provider } = result;

  const paras = report.split("\n\n");
  return (
    <SectionCard
      title="Seller report" subtitle={`Synthesized via ${report_provider} · every figure citation-grounded`}
      icon={<FileText className="h-4.5 w-4.5" />}
      right={
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadReportPdf(result)}
            aria-label="Download PDF report"
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs text-muted transition hover:border-accent/40 hover:text-accent"
          >
            <Download className="h-3.5 w-3.5" /> PDF
          </button>
          <Pill tone={result.verification.passed ? "good" : "warn"}>{result.verification.passed ? "verified" : "flagged"}</Pill>
        </div>
      }
    >
      <div className="space-y-3 text-sm leading-relaxed text-fg/90">
        {(() => { let base = 0; return paras.map((p, pi) => {
          const chunks = chunkParagraph(p, report, base);
          base += p.length + 2; // account for the "\n\n" the split removed
          return (
          <p key={pi}>
            {chunks.map((chunk, ci) => {
              if (!chunk.cite) return <span key={ci}>{chunk.text}</span>;
              const id = chunk.cite;
              const detail = evidenceFor(evidence, id);
              const value = displayForCitation(evidence, id);
              const label = chunk.injected && value ? value : id;
              return (
                <button
                  key={ci}
                  onClick={() => setOpen(open === `${pi}-${ci}` ? null : `${pi}-${ci}`)}
                  className="relative mx-0.5 inline-flex items-center rounded-md bg-accent/12 px-1.5 py-0.5 align-baseline text-[11px] font-semibold text-accent transition hover:bg-accent/20"
                >
                  {label}
                  <AnimatePresence>
                    {open === `${pi}-${ci}` && detail && (
                      <motion.span
                        initial={{ opacity: 0, y: 6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.96 }}
                        className="absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[240px] -translate-x-1/2 rounded-xl border bg-surface p-2.5 text-left text-[11px] font-normal text-fg shadow-lift"
                      >
                        <span className="mb-1 flex items-center gap-1 font-semibold text-accent"><Quote className="h-3 w-3" />source {id}</span>
                        <span className="text-muted">{detail}</span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              );
            })}
          </p>
          );
        }); })()}
      </div>
      <p className="mt-4 flex items-center gap-1.5 border-t pt-3 text-xs text-muted">
        <span className="tnum text-fg">{result.verification.numbers_checked}</span> numbers and
        <span className="tnum text-fg">{result.verification.citations_checked}</span> citations checked by the Verifier —
        {result.verification.passed ? " all trace to a computed value." : ` ${result.verification.violations.length} flagged.`}
      </p>
    </SectionCard>
  );
}
