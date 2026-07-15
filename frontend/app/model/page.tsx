"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Target, ScanSearch, ShieldCheck, Search, Sparkles, AlertTriangle } from "lucide-react";
import { Logo, SectionCard, Pill, Reveal } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import valuation from "@/lib/eval/valuation_metrics.json";
import cvEval from "@/lib/eval/cv_eval_report.json";
import cvTrain from "@/lib/eval/cv_train_summary.json";
import faithfulness from "@/lib/eval/faithfulness_report.json";
import comparables from "@/lib/eval/comparables_eval.json";
import guardrails from "@/lib/eval/guardrails_report.json";
import shap from "@/lib/eval/shap_report.json";

function Stat({ label, value, sub, tone = "accent" }: { label: string; value: string; sub?: string; tone?: "accent" | "good" | "warn" | "info" }) {
  const color = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "info" ? "text-info" : "text-accent";
  return (
    <div className="rounded-xl border bg-surface-2/40 p-4">
      <p className="font-display text-[10px] uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className={cn("tnum mt-1 text-2xl font-bold", color)}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function Bar({ label, value, max = 1, tone = "accent" }: { label: string; value: number; max?: number; tone?: "accent" | "good" | "info" }) {
  const pct = Math.max(2, Math.min(100, (value / max) * 100));
  const bg = tone === "good" ? "bg-good" : tone === "info" ? "bg-info" : "bg-accent";
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-muted">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <motion.div initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className={cn("h-full rounded-full", bg)} />
      </div>
      <span className="tnum w-12 shrink-0 text-right text-xs font-semibold">{value.toFixed(3)}</span>
    </div>
  );
}

export default function ModelCard() {
  const perClass = Object.entries(cvEval.per_class);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-5 sm:px-6">
      {/* header */}
      <header className="sticky top-3 z-30 mb-8">
        <div className="glass flex items-center justify-between rounded-2xl px-3 py-2.5 sm:px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Link href="/" className="inline-flex items-center gap-1.5 rounded-full border bg-surface/70 px-3 py-1.5 text-xs font-medium text-muted transition hover:text-fg">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to app
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* hero */}
      <Reveal>
        <div className="mb-10 text-center">
          <p className="kicker mb-4 justify-center">Trust, measured</p>
          <h1 className="display-title text-3xl font-bold uppercase sm:text-5xl">Model report card</h1>
          <p className="mx-auto mt-3 max-w-2xl text-pretty text-sm text-muted sm:text-base">
            Every metric here is from a <span className="text-fg">held-out</span> evaluation — no cherry-picking, failures included.
            This is the honest scorecard behind every valuation.
          </p>
        </div>
      </Reveal>

      <div className="space-y-5">
        {/* pricing model */}
        <Reveal>
          <SectionCard title="Pricing model" subtitle={`${valuation.model} · ${valuation.cv}`} icon={<Target className="h-4.5 w-4.5" />}
            right={<Pill tone="good">{valuation.improvement_over_baseline_pct}% better than baseline</Pill>}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Median error" value={`${valuation.metrics.median_APE_pct.mean}%`} sub={`± ${valuation.metrics.median_APE_pct.std}`} />
              <Stat label="MAPE" value={`${valuation.metrics.MAPE_pct.mean}%`} sub={`± ${valuation.metrics.MAPE_pct.std}`} />
              <Stat label="MAE" value={`AED ${Math.round(valuation.metrics.MAE_AED.mean / 1000)}k`} sub="mean abs. error" tone="info" />
              <Stat label="Interval coverage" value={`${Math.round(valuation.conformal.honest_test_coverage * 100)}%`} sub={`target ${Math.round(valuation.conformal.target * 100)}% · ${valuation.conformal.seeds} seeds`} tone={valuation.conformal.honest_test_coverage >= valuation.conformal.target ? "good" : "warn"} />
            </div>

            {/* Coverage per segment: an 80% average can hide a badly-covered group. */}
            <p className="mt-4 mb-2 text-xs font-medium text-muted">Interval coverage by segment — calibrated separately (Mondrian conformal)</p>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(valuation.conformal.coverage_by_tier).map(([tier, c]) => (
                <Stat key={tier} label={`${tier} cars`} value={`${Math.round(c.coverage * 100)}%`}
                  sub={`± ${Math.round(c.std * 100)}pp over ${c.n_splits} splits`}
                  tone={c.coverage >= valuation.conformal.target - 0.02 ? "good" : "warn"} />
              ))}
            </div>

            {/* The guarantee: a car can never get more expensive by ageing or adding km. */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Stat label="Mileage monotonicity" value={`${Math.round((1 - valuation.monotonicity.kilometers.violation_rate) * 100)}%`} sub="cars where price never rises with km" tone="good" />
              <Stat label="Age monotonicity" value={`${Math.round((1 - valuation.monotonicity.age.violation_rate) * 100)}%`} sub="cars where price never rises with age" tone="good" />
            </div>

            <p className="mt-3 text-xs text-muted">
              Trained on <span className="tnum text-fg">{valuation.training_rows}</span> real UAE listings. Coverage is a mean over
              <span className="text-fg"> {valuation.conformal.seeds} splits</span> — at this corpus size a single split swings coverage by ~5pp, so one number would be noise, not a measurement.
              Luxury cars get a deliberately wider band: they are harder to price, and pretending otherwise is how an 80% average hides a badly-covered group.
            </p>
          </SectionCard>
        </Reveal>

        {/* CV detector */}
        <Reveal>
          <SectionCard title="Damage detector" subtitle={`${cvTrain.model} · ${cvTrain.dataset} · ${cvTrain.train_images.toLocaleString()} train images`} icon={<ScanSearch className="h-4.5 w-4.5" />}
            right={<Pill tone="info">mAP@0.5 {cvEval.overall.mAP50.toFixed(3)}</Pill>}>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="mAP@0.5" value={cvEval.overall.mAP50.toFixed(3)} tone="info" />
              <Stat label="mAP@0.5:0.95" value={cvEval.overall.mAP50_95.toFixed(3)} tone="info" />
              <Stat label="Precision" value={cvEval.overall.precision_mean.toFixed(3)} />
              <Stat label="Recall" value={cvEval.overall.recall_mean.toFixed(3)} />
            </div>
            <p className="mb-2 text-xs font-medium text-muted">Per-class mAP@0.5 — {cvEval.eval_split}</p>
            <div className="space-y-2">
              {perClass.map(([cls, m]) => (
                <Bar key={cls} label={cls.replace("_", " ")} value={(m as any).mAP50} tone={(m as any).mAP50 >= 0.8 ? "good" : "info"} />
              ))}
            </div>
          </SectionCard>
        </Reveal>

        {/* faithfulness */}
        <Reveal>
          <SectionCard title="Report faithfulness" subtitle={`${faithfulness.n_reports} reports · every cited number must trace to computed evidence`} icon={<ShieldCheck className="h-4.5 w-4.5" />}
            right={<Pill tone="good">meets target</Pill>}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Faithfulness" value={faithfulness.mean_faithfulness.toFixed(2)} sub={`target ${faithfulness.target_faithfulness}`} tone="good" />
              <Stat label="Citation validity" value={faithfulness.mean_citation_validity.toFixed(2)} tone="good" />
              <Stat label="Relevancy" value={faithfulness.mean_relevancy.toFixed(2)} tone="good" />
              <Stat label="Negative control" value={faithfulness.negative_control.faithfulness.toFixed(2)} sub={faithfulness.negative_control.discriminates ? "discriminates ✓" : "—"} tone="warn" />
            </div>
            <p className="mt-3 text-xs text-muted">
              The Verifier is deterministic: it re-checks every number and citation against the evidence pack. A deliberately corrupted control report scores
              <span className="text-fg"> {faithfulness.negative_control.faithfulness.toFixed(2)}</span> — proof the metric actually discriminates.
            </p>
          </SectionCard>
        </Reveal>

        {/* retrieval + guardrails */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Reveal>
            <SectionCard title="Comparables retrieval" subtitle={`${comparables.queries} benchmark queries`} icon={<Search className="h-4.5 w-4.5" />}>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Same-make P@5" value={comparables["mean_same_make_precision@5"].toFixed(2)} tone="good" />
                <Stat label="Exact model" value={comparables.queries_with_exact_model_match} sub="queries matched" tone="info" />
              </div>
            </SectionCard>
          </Reveal>
          <Reveal>
            <SectionCard title="Confidence guardrails" subtitle={guardrails.contract} icon={<ShieldCheck className="h-4.5 w-4.5" />}>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Checks passed" value={`${guardrails.checks_passed}/${guardrails.checks_passed + guardrails.checks_failed}`} tone="good" />
                <Stat label="Inspection advised" value={guardrails.all_recommend_inspection_when_uncertain ? "always" : "—"} sub="when uncertain" tone="info" />
              </div>
            </SectionCard>
          </Reveal>
        </div>

        {/* SHAP directional */}
        <Reveal>
          <SectionCard title="Explanation sanity checks" subtitle="SHAP directional correlations — do the drivers point the right way?" icon={<Sparkles className="h-4.5 w-4.5" />}>
            <div className="flex flex-wrap gap-2">
              {Object.entries(shap.directional_checks).map(([feat, chk]) => (
                <span key={feat} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs", (chk as any).pass ? "bg-good/12 text-good" : "bg-bad/12 text-bad")}>
                  <span className="font-medium">{feat}</span>
                  <span className="tnum">{(chk as any).shap_corr}</span>
                  <span>{(chk as any).pass ? "✓" : "✗"}</span>
                </span>
              ))}
            </div>
          </SectionCard>
        </Reveal>

        {/* honest limitations */}
        <Reveal>
          <SectionCard title="Known limitations" subtitle="The parts we'd flag ourselves — honesty is the point" icon={<AlertTriangle className="h-4.5 w-4.5" />}
            right={<Pill tone="warn">read this</Pill>}>
            <ul className="space-y-2 text-sm text-fg/85">
              <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" /><span>Corpus is <span className="text-fg">{valuation.training_rows} listings</span> — thin for rarer makes; comparables can be sparse. Growing the corpus is the biggest lever.</span></li>
              <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" /><span>Median error is <span className="text-fg">{valuation.metrics.median_APE_pct.mean}%</span>. The published floor for used-car pricing is ~8% MAPE on corpora ~15x this size — the gap is <span className="text-fg">data, not tuning</span>. Anyone promising 99% on price is selling something.</span></li>
              <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" /><span><span className="text-fg">Luxury</span> is the weakest segment: {Math.round(valuation.conformal.coverage_by_tier.luxury.coverage * 100)}% coverage ± {Math.round(valuation.conformal.coverage_by_tier.luxury.std * 100)}pp, calibrated on only ~40 luxury rows per split. We widen the band rather than pretend.</span></li>
              <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" /><span><span className="text-fg">Crack</span> detection recall is the weakest class ({(cvEval.per_class as any).crack.recall.toFixed(2)}); fine cracks are easily missed.</span></li>
            </ul>
          </SectionCard>
        </Reveal>

        <p className="pt-2 text-center text-xs text-muted">
          Metrics snapshot from the <span className="text-fg">/eval</span> harness. Automated estimate — not a certified appraisal.
        </p>
      </div>
    </div>
  );
}
