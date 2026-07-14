"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, ArrowLeft, Sparkles } from "lucide-react";
import { Logo } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Phase J — plans.
 *
 * Checkout runs against Stripe TEST mode via a payment link, so the full purchase flow is
 * demonstrable without processing a real payment and without leaving the free tier. If no
 * link is configured we say so plainly rather than pretending a button works.
 */
const LINKS: Record<string, string | undefined> = {
  pro: process.env.NEXT_PUBLIC_STRIPE_LINK_PRO,
  dealer: process.env.NEXT_PUBLIC_STRIPE_LINK_DEALER,
};

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "AED 0",
    cadence: "forever",
    blurb: "Value your own car, with the full explanation.",
    features: [
      "Unlimited valuations in the browser",
      "On-device damage scan (photos never leave your device)",
      "SHAP explanation + comparable listings",
      "Citation-grounded report & assistant",
      "PDF export and share links",
      "100 API calls / day",
    ],
    cta: "Start free",
  },
  {
    id: "pro",
    name: "Pro",
    price: "AED 49",
    cadence: "per month",
    blurb: "For people who sell cars regularly.",
    features: [
      "Everything in Free",
      "1,000 API calls / day",
      "Sell-timing forecast & repair-cost estimator",
      "Valuation history synced across devices",
      "Priority model queue",
    ],
    cta: "Upgrade to Pro",
    featured: true,
  },
  {
    id: "dealer",
    name: "Dealer",
    price: "AED 199",
    cadence: "per month",
    blurb: "For dealerships valuing inventory daily.",
    features: [
      "Everything in Pro",
      "5,000 API calls / day",
      "Bulk fleet valuation (CSV in, CSV out)",
      "White-label PDF reports with your logo",
      "Saved fleets",
    ],
    cta: "Upgrade to Dealer",
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6">
      <header className="mb-10 flex items-center justify-between gap-3">
        <Logo />
        <Link href="/" className="inline-flex items-center gap-1.5 rounded-full border bg-surface/70 px-3 py-2 text-xs font-medium text-muted transition hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
      </header>

      <div className="mb-10 text-center">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Honest valuations, <span className="text-accent">honest pricing</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-sm text-muted">
          The core product is free and always will be — the damage scan runs on your own device, so it costs us
          nothing to give away. You pay only when you need volume or the dealer workflow.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p, i) => {
          const link = LINKS[p.id];
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              className={cn(
                "card relative flex flex-col p-6",
                p.featured && "border-accent/40 shadow-glow",
              )}
            >
              {p.featured && (
                <span className="absolute -top-2.5 left-6 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-semibold text-accent-fg">
                  <Sparkles className="h-3 w-3" /> Most popular
                </span>
              )}

              <p className="text-sm font-semibold">{p.name}</p>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span className="tnum text-3xl font-semibold tracking-tight">{p.price}</span>
                <span className="text-xs text-muted">{p.cadence}</span>
              </p>
              <p className="mt-2 text-xs text-muted">{p.blurb}</p>

              <ul className="mt-5 flex-1 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" />
                    <span className="text-fg/90">{f}</span>
                  </li>
                ))}
              </ul>

              {p.id === "free" ? (
                <Link href="/"
                  className="mt-6 rounded-xl border py-2.5 text-center text-sm font-medium transition hover:border-accent/40 hover:text-accent">
                  {p.cta}
                </Link>
              ) : link ? (
                <a href={link} target="_blank" rel="noreferrer"
                  className={cn(
                    "mt-6 rounded-xl py-2.5 text-center text-sm font-semibold transition",
                    p.featured
                      ? "bg-accent text-accent-fg hover:brightness-105"
                      : "border hover:border-accent/40 hover:text-accent",
                  )}>
                  {p.cta}
                </a>
              ) : (
                <div className="mt-6">
                  <button disabled
                    className="w-full cursor-not-allowed rounded-xl border py-2.5 text-center text-sm font-medium text-muted opacity-70">
                    {p.cta}
                  </button>
                  <p className="mt-1.5 text-center text-[11px] text-muted">
                    Checkout isn&apos;t connected yet — set a Stripe test payment link to enable it.
                  </p>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-muted">
        Every plan runs the same model and the same Verifier. Paying more buys you volume and workflow — never a
        different answer.
      </p>
    </div>
  );
}
