import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { loadSharedValuation } from "@/lib/supabase";
import { SharedReport } from "@/components/shared-report";
import { Logo } from "@/components/ui";

export const revalidate = 300; // shared reports are immutable; cache them at the edge

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const shared = await loadSharedValuation(params.slug);
  if (!shared) return { title: "Report not found — AutoValuate" };
  const mid = `AED ${Math.round(shared.mid_aed).toLocaleString("en-AE")}`;
  return {
    title: `${shared.label} — valued at ${mid} | AutoValuate`,
    description: `An explainable, damage-aware fair-market valuation for a ${shared.label}. Every figure traces to a computed value.`,
    openGraph: {
      title: `${shared.label} — ${mid}`,
      description: "Explainable, damage-aware car valuation. Every figure is checked by the Verifier.",
      type: "article",
    },
  };
}

export default async function SharedPage({ params }: { params: { slug: string } }) {
  const shared = await loadSharedValuation(params.slug);
  if (!shared) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <header className="mb-8 flex items-center justify-between gap-3">
        <Logo />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-2.5 py-1 text-[11px] font-medium text-accent">
          <ShieldCheck className="h-3 w-3" /> shared report
        </span>
      </header>

      <div className="mb-6">
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{shared.label}</h1>
        <p className="mt-1 text-sm text-muted">
          A read-only valuation shared from AutoValuate · {new Date(shared.created_at).toLocaleDateString()}
        </p>
      </div>

      <SharedReport result={shared.result} />

      <Link
        href="/"
        className="mt-10 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg transition hover:brightness-105"
      >
        Value your own car <ArrowRight className="h-4 w-4" />
      </Link>

      <footer className="mt-10 border-t pt-6 text-xs text-muted">
        Automated estimate — not a certified appraisal. Every figure in this report traces back to a computed value.
      </footer>
    </div>
  );
}
