"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Clock, Radio, ArrowDown, ShieldCheck } from "lucide-react";
import type { TraceStep, ValuationResult, VehicleInput } from "@/lib/types";
import { streamValuation, apiInfo, wakeBackend } from "@/lib/api";
import { loadHistory, saveToHistory, clearHistory, type HistoryItem } from "@/lib/history";
import { Logo, Reveal, SectionCard } from "@/components/ui";
import { Hero } from "@/components/hero";
import { ThemeToggle } from "@/components/theme-toggle";
import { VehicleForm } from "@/components/vehicle-form";
import { DemoGarage } from "@/components/demo-garage";
import type { DemoCar } from "@/lib/demo-garage";
import { ReasoningTrace } from "@/components/reasoning-trace";
import { ValuationDashboard } from "@/components/valuation-dashboard";
import { WhatIf } from "@/components/what-if";
import { DealScore } from "@/components/deal-score";
import { DamageReport } from "@/components/damage-report";
import { Comparables } from "@/components/comparables";
import { MarketAnalytics } from "@/components/market-analytics";
import { Depreciation } from "@/components/depreciation";
import { RepairEstimateCard } from "@/components/repair-estimate";
import { Forecast } from "@/components/forecast";
import { SellerReport } from "@/components/seller-report";
import { Negotiation } from "@/components/negotiation";
import { ListingPack } from "@/components/listing-pack";
import { Assistant } from "@/components/assistant";
import { ConfidencePanel } from "@/components/confidence-panel";
import { HistoryDrawer } from "@/components/history-drawer";
import { useAuth, AuthModal, UserButton } from "@/components/auth";
import { CardBoundary } from "@/components/card-boundary";
import { CommandPalette } from "@/components/command-palette";
import { Onboarding } from "@/components/onboarding";
import { saveValuationCloud, loadValuationsCloud, clearValuationsCloud } from "@/lib/supabase";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [demo, setDemo] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<VehicleInput | null>(null);
  const [asking, setAsking] = useState<number | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const { session } = useAuth();
  const resultsRef = useRef<HTMLDivElement>(null);
  const appraiseRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // History: cloud (per-user) when signed in, else local.
  async function refreshHistory() {
    if (session) {
      try {
        const rows = await loadValuationsCloud();
        setHistory(rows.map((r) => ({ id: r.id, ts: new Date(r.created_at).getTime(), label: r.label, mid: Number(r.mid_aed), result: r.result })));
        return;
      } catch { /* fall through to local */ }
    }
    setHistory(loadHistory());
  }

  // Wake the (free-tier, sleeping) backend immediately, then probe it. Without the wake
  // ping the probe times out on a cold dyno and the app used to silently serve DEMO data.
  useEffect(() => {
    wakeBackend();
    apiInfo().then((i) => setOnline(i.online));
    // re-probe once the cold start has had time to finish, so the header stops saying "demo"
    const t = setTimeout(() => apiInfo().then((i) => setOnline(i.online)), 20_000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => { refreshHistory(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session]);

  async function run(input: VehicleInput) {
    setLoading(true); setSteps([]); setResult(null); setDemo(false); setError(null);
    // Held only here, never merged into `result` — result is what gets persisted to Supabase
    // and to public share links, and the asking price is the user's own private number.
    setAsking(input.asking_price_aed ?? null);
    abortRef.current = new AbortController();
    await streamValuation(input, {
      onStep: (s) => setSteps((p) => [...p, s]),
      onResult: (r, isDemo) => {
        setResult(r); setDemo(isDemo); setLoading(false);
        if (session && !isDemo) { saveValuationCloud(r).then(refreshHistory).catch(() => setHistory(saveToHistory(r))); }
        else setHistory(saveToHistory(r));
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      },
      onError: (msg) => { setLoading(false); setError(msg); },
    }, abortRef.current.signal, undefined, false);
  }

  function cancel() {
    abortRef.current?.abort();
    setLoading(false);
    setSteps([]);
  }

  function pickDemo(car: DemoCar) {
    if (loading) return;
    setPreset(car.input);            // fills the form for context
    appraiseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    run(car.input);                  // runs the full pipeline immediately
  }

  const lastStep = steps[steps.length - 1];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6">
      {/* header */}
      <header className="sticky top-3 z-30 mb-8">
        {/* wrap on very narrow phones (320px): the action row is 16px too wide to sit
            beside the logo, and wrapping beats hiding controls the user needs. */}
        <div className="glass flex flex-wrap items-center justify-between gap-y-2 rounded-2xl px-3 py-2.5 sm:px-4">
          <Logo />
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2/70 px-2 py-1 text-[11px] font-medium sm:px-2.5">
              <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-good" : "bg-warn"} ${online ? "animate-pulse" : ""}`} />
              <span className="hidden sm:inline">{online === null ? "checking…" : online ? "API live" : "demo mode"}</span>
            </span>
            <button onClick={() => setDrawer(true)} aria-label="History"
              className="grid h-10 w-10 place-items-center rounded-full border bg-surface/70 backdrop-blur transition hover:bg-surface-2">
              <Clock className="h-[18px] w-[18px]" />
            </button>
            <CommandPalette
              hasResult={!!result}
              onNewValuation={() => appraiseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              onOpenHistory={() => setDrawer(true)}
              onScrollTo={() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            />
            <UserButton session={session} onSignIn={() => setAuthOpen(true)} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* main landmark: everything between the sticky header and the footer */}
      <main>
      {/* cinematic hero */}
      <Hero onBegin={() => appraiseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />

      {/* main grid */}
      <div ref={appraiseRef} id="appraise" className="grid scroll-mt-24 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* left: form + trace */}
        <div className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Reveal delay={0.05}>
            <SectionCard title="Your vehicle" subtitle="Photos optional · details required" icon={<Activity className="h-4.5 w-4.5" />}>
              <div className="mb-5">
                <DemoGarage onPick={pickDemo} disabled={loading} />
              </div>
              <VehicleForm onSubmit={run} loading={loading} preset={preset} />
            </SectionCard>
          </Reveal>

          <AnimatePresence>
            {(loading || steps.length > 0) && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <SectionCard title="Live reasoning trace" subtitle="Each agent, streamed in real time" icon={<Radio className="h-4.5 w-4.5" />}
                  right={loading ? (
                    <button onClick={cancel} className="rounded-lg border px-2.5 py-1 text-xs text-muted transition hover:text-bad hover:border-bad/40">Cancel</button>
                  ) : undefined}>
                  <ReasoningTrace steps={steps} active={loading} />
                </SectionCard>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-bad/30 bg-bad/8 px-4 py-3 text-sm text-bad">
              <span className="mt-0.5">⚠</span>
              <div>{error} <button onClick={() => setError(null)} className="ml-1 underline">dismiss</button></div>
            </div>
          )}
        </div>

        {/* screen-reader live announcer */}
        <div aria-live="polite" className="sr-only">
          {loading && lastStep ? `Step: ${lastStep.step} — ${lastStep.detail}` : ""}
          {result ? `Valuation complete. Estimated value ${Math.round(result.valuation.price_mid_aed).toLocaleString()} dirhams, ${result.confidence.level} confidence.` : ""}
          {error ? `Error: ${error}` : ""}
        </div>

        {/* right: results.
            NOTE: deliberately NOT wrapped in <AnimatePresence mode="wait"> — with three
            children swapping quickly (empty → loading → result) the skeleton's
            exit-complete callback could fail to fire, so the result pane never mounted
            and users saw a blank column after "Value my car". Plain conditional
            rendering with mount animations is deadlock-proof. */}
        <div ref={resultsRef} className="min-w-0 space-y-5">
            {!result && !loading && (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-accent/10 text-accent">
                  <Activity className="h-7 w-7" />
                </motion.div>
                <p className="text-sm font-medium">Your valuation appears here</p>
                <p className="mt-1 max-w-xs text-xs text-muted">Fill in the details and hit “Value my car”. The full reasoning trace streams live, then the results build in.</p>
                <ArrowDown className="mt-4 h-4 w-4 animate-bounce text-muted lg:hidden" />
              </motion.div>
            )}

            {loading && !result && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="space-y-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="card overflow-hidden p-6">
                    <div className="relative overflow-hidden rounded-lg">
                      <div className="h-4 w-1/3 rounded bg-surface-2" />
                      <div className="mt-4 h-16 rounded bg-surface-2" />
                      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                    </div>
                  </div>
                ))}
                <p className="text-center text-xs text-muted">
                  {online === false ? "Backend offline — waking analysis engine / showing demo…" : "Running the model pipeline…"}
                </p>
              </motion.div>
            )}

            {result && (
              <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                {demo && (
                  <div className="rounded-xl border border-warn/30 bg-warn/8 px-4 py-2.5 text-xs text-warn">
                    Demo data shown — the live API wasn’t reachable. Numbers mirror a real pipeline run.
                  </div>
                )}
                {/* each card in its own boundary: one crashing section degrades to a
                    one-line notice instead of blanking the entire valuation */}
                <CardBoundary name="confidence"><ConfidencePanel c={result.confidence} /></CardBoundary>
                <CardBoundary name="valuation"><ValuationDashboard v={result.valuation} /></CardBoundary>
                <CardBoundary name="deal score"><DealScore result={result} asking={asking} /></CardBoundary>
                <CardBoundary name="what-if explorer"><WhatIf result={result} online={online} /></CardBoundary>
                <CardBoundary name="damage assessment"><DamageReport c={result.condition} valuation={result.valuation} /></CardBoundary>
                <CardBoundary name="repair estimate"><RepairEstimateCard result={result} /></CardBoundary>
                <CardBoundary name="market analytics"><MarketAnalytics result={result} /></CardBoundary>
                <CardBoundary name="depreciation"><Depreciation result={result} /></CardBoundary>
                <CardBoundary name="forecast"><Forecast result={result} /></CardBoundary>
                <CardBoundary name="comparables"><Comparables items={result.comparables} /></CardBoundary>
                <CardBoundary name="seller report"><SellerReport result={result} /></CardBoundary>
                <CardBoundary name="assistant"><Assistant result={result} /></CardBoundary>
                <CardBoundary name="negotiation coach"><Negotiation result={result} /></CardBoundary>
                <CardBoundary name="listing pack"><ListingPack result={result} /></CardBoundary>
              </motion.div>
            )}
        </div>
      </div>
      </main>

      <footer className="mt-16 border-t pt-6 text-center text-xs text-muted">
        <p>AutoValuate Intelligence · trained damage detector + explainable pricing + agentic RAG · not a certified appraisal.</p>
        <a href="/model" className="mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium text-muted transition hover:text-accent hover:border-accent/40">
          <ShieldCheck className="h-3.5 w-3.5" /> See the model report card — every metric, failures included
        </a>
      </footer>

      <HistoryDrawer
        open={drawer} items={history} onClose={() => setDrawer(false)}
        onSelect={(it) => { setResult(it.result); setDemo(false); setSteps(it.result.trace); setDrawer(false); setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 120); }}
        onClear={() => { if (session) { clearValuationsCloud().then(refreshHistory); } else { setHistory(clearHistory()); } }}
      />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <Onboarding />
    </div>
  );
}
