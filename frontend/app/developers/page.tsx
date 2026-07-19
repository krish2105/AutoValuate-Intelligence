"use client";
import { useState } from "react";
import Link from "next/link";
import { Copy, Check, ArrowLeft, Terminal, Braces } from "lucide-react";
import { Logo, SectionCard, Pill } from "@/components/ui";

/**
 * Public API documentation.
 *
 * Accounts and paid tiers were REMOVED: sign-in was broken, and per-user metered keys only mean
 * anything alongside paid plans, which are withdrawn while the AGPL-3.0 licensing question is
 * unresolved (docs/LICENSING.md). What is left is the truth — the API is open, anonymous, and
 * rate-limited per IP. A smaller claim than "metered API keys", but one the project can keep.
 */
const CURL = `curl -X POST https://autovaluate-api.onrender.com/valuate \\
  -H "Content-Type: application/json" \\
  -d '{
    "make": "Toyota",
    "model": "Land Cruiser",
    "year": 2019,
    "kilometers": 90000,
    "bodyType": "SUV",
    "regionalSpecs": "GCC",
    "city": "Dubai"
  }'`;

const ENDPOINTS = [
  { m: "POST", p: "/valuate", d: "Full pipeline: pricing + SHAP + comparables + verified report" },
  { m: "POST", p: "/estimate", d: "Price only — faster, no report or retrieval" },
  { m: "POST", p: "/estimate/batch", d: "Many vehicles in one call (the dealer CSV path)" },
  { m: "GET", p: "/market/depreciation", d: "Price-vs-age curve for a make/model" },
  { m: "POST", p: "/chat", d: "Grounded assistant over a valuation result" },
  { m: "GET", p: "/health", d: "Liveness" },
];

export default function DevelopersPage() {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-6">
      <header className="mb-8 flex items-center justify-between gap-3">
        <Logo />
        <Link href="/" className="inline-flex items-center gap-1.5 rounded-full border bg-surface/70 px-3 py-2 text-xs font-medium text-muted transition hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
      </header>

      <div className="mb-6">
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">Developers</h1>
        <p className="mt-1 text-sm text-muted">
          Value cars programmatically. The API is open — no key, no account, no sign-up.
        </p>
      </div>

      <SectionCard title="Authentication" subtitle="There isn't any — and that's the honest state"
        icon={<Braces className="h-4.5 w-4.5" />} right={<Pill tone="good">no key needed</Pill>}>
        <p className="text-sm text-fg/85">
          Every endpoint is public. Requests are rate-limited per IP at{" "}
          <span className="text-fg">20 requests / minute</span>, which is plenty for evaluation
          and light integration. Responses carry <code>X-RateLimit-Remaining</code>; exceeding the
          limit returns <code>429</code>.
        </p>
        <p className="mt-3 text-xs text-muted">
          There were per-user API keys and paid tiers here. They were removed rather than left
          half-working: the sign-in they depended on was broken, and metered keys only mean
          something next to paid plans, which are withdrawn while the project&apos;s AGPL-3.0
          licensing question is open. Need volume beyond the anonymous limit? The whole stack is
          open source — run your own instance.
        </p>
      </SectionCard>

      <div className="mt-5">
        <SectionCard title="Quick start" subtitle="Copy, paste, run" icon={<Terminal className="h-4.5 w-4.5" />}>
          <div className="relative">
            <pre className="overflow-x-auto rounded-xl border bg-surface-2/50 p-3.5 text-xs leading-relaxed">
              <code>{CURL}</code>
            </pre>
            <button
              onClick={() => { navigator.clipboard.writeText(CURL); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              aria-label="Copy example request"
              className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg border bg-surface/80 backdrop-blur transition hover:border-accent/40"
            >
              {copied ? <Check className="h-4 w-4 text-good" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-3 text-xs text-muted">
            The free instance sleeps when idle, so a first call after a quiet period can take
            ~50s to wake. Retry once rather than treating it as an error.
          </p>
        </SectionCard>
      </div>

      <div className="mt-5">
        <SectionCard title="Endpoints" subtitle="Stable aliases also live under /v1/*" icon={<Braces className="h-4.5 w-4.5" />}>
          <ul className="divide-y">
            {ENDPOINTS.map((e) => (
              <li key={e.p} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <Pill tone={e.m === "GET" ? "info" : "accent"}>{e.m}</Pill>
                <code className="text-sm font-medium">{e.p}</code>
                <span className="w-full text-xs text-muted sm:w-auto sm:flex-1">{e.d}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <p className="mt-8 text-center text-xs text-muted">
        Every response carries the same model version and confidence disclosure the web app
        shows. An automated estimate — not a certified appraisal.
      </p>
    </div>
  );
}
