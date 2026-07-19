"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/ui";

/**
 * Pricing — there is none.
 *
 * The three-tier (Free / Pro / Dealer) page and its Stripe checkout were removed. Paid plans
 * cannot be advertised while the AGPL-3.0 licensing question is unresolved (docs/LICENSING.md) —
 * charging for closed-source use of AGPL-derived weights is exactly the claim this project
 * exists not to make. The route is kept, rather than deleted, so old links land somewhere honest
 * instead of a 404.
 */
const FREE = [
  "Unlimited valuations in the browser",
  "On-device damage scan — photos never leave your device",
  "SHAP explanation of every price driver + comparable listings",
  "Citation-grounded report and grounded assistant",
  "Dealer bulk CSV valuation (CSV in, valued CSV out)",
  "Open API — no key, no account (20 requests / minute)",
  "PDF export and shareable public links",
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <header className="mb-10 flex items-center justify-between gap-3">
        <Logo />
        <Link href="/" className="inline-flex items-center gap-1.5 rounded-full border bg-surface/70 px-3 py-2 text-xs font-medium text-muted transition hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
      </header>

      <div className="mb-8 text-center">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          It&apos;s <span className="text-accent">free</span>.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-sm text-muted">
          The whole product is free to use. The damage scan runs on your own device, so it costs
          nothing to give away — and there are no paid tiers to upsell you to.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="card mx-auto max-w-md p-6"
      >
        <p className="text-sm font-semibold">Everything, at no cost</p>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="tnum text-3xl font-semibold tracking-tight">AED 0</span>
          <span className="text-xs text-muted">forever</span>
        </p>
        <ul className="mt-5 space-y-2">
          {FREE.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" />
              <span className="text-fg/90">{f}</span>
            </li>
          ))}
        </ul>
        <Link href="/"
          className="mt-6 block rounded-xl bg-accent py-2.5 text-center text-sm font-semibold text-accent-fg transition hover:brightness-105">
          Value a car
        </Link>
      </motion.div>

      <p className="mx-auto mt-8 max-w-xl text-center text-xs text-muted">
        There were Pro and Dealer plans here. They were removed while the project&apos;s AGPL-3.0
        licensing is unresolved — see{" "}
        <a href="https://github.com/krish2105/AutoValuate-Intelligence/blob/main/docs/LICENSING.md"
          className="text-fg underline decoration-muted/40 underline-offset-2" target="_blank" rel="noreferrer">
          docs/LICENSING.md
        </a>
        . The stack is open source; run your own instance if you need more than the anonymous
        API limit.
      </p>
    </div>
  );
}
