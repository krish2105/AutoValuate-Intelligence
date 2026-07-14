"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, Plus, Copy, Check, Trash2, ArrowLeft, Terminal, AlertTriangle } from "lucide-react";
import { createApiKey, listApiKeys, revokeApiKey, type ApiKeyRow } from "@/lib/supabase";
import { useAuth, AuthModal } from "@/components/auth";
import { Logo, SectionCard, Pill } from "@/components/ui";

const TIERS = [
  { tier: "free", quota: "100 calls / day", who: "Trying it out" },
  { tier: "pro", quota: "1,000 calls / day", who: "Individual sellers, small sites" },
  { tier: "dealer", quota: "5,000 calls / day", who: "Dealerships valuing inventory" },
];

const CURL = `curl -X POST https://autovaluate-api.onrender.com/valuate \\
  -H "Authorization: Bearer av_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"make":"Toyota","model":"Land Cruiser","year":2019,"kilometers":90000}'`;

export default function DevelopersPage() {
  const { session, ready } = useAuth();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  async function refresh() {
    if (!session) return;
    try { setKeys(await listApiKeys()); setErr(null); }
    catch { setErr("API keys aren't set up yet — run supabase_api_keys_schema.sql to enable them."); }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session]);

  async function mint() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      setFresh(await createApiKey(name));
      setName("");
      await refresh();
    } catch {
      setErr("Couldn't create a key — run supabase_api_keys_schema.sql to enable API keys.");
    }
    setBusy(false);
  }

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
          Value cars programmatically. Authenticate with a bearer key; every call is metered against your tier.
        </p>
      </div>

      {/* keys */}
      <SectionCard title="API keys" subtitle="Shown once at creation — we only ever store a hash"
        icon={<KeyRound className="h-4.5 w-4.5" />}>
        {!ready ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : !session ? (
          <div>
            <p className="mb-3 text-sm text-muted">Sign in to mint an API key.</p>
            <button onClick={() => setAuthOpen(true)}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:brightness-105">
              Sign in
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Key name (e.g. production)"
                aria-label="API key name"
                className="flex-1 rounded-xl border bg-surface-2/60 px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/25 placeholder:text-muted/60"
              />
              <button onClick={mint} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg transition hover:brightness-105 disabled:opacity-60">
                <Plus className="h-4 w-4" /> Create key
              </button>
            </div>

            <AnimatePresence>
              {fresh && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="mt-4 rounded-xl border border-accent/30 bg-accent/8 p-3.5">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-accent">
                    <AlertTriangle className="h-3.5 w-3.5" /> Copy this now — it will never be shown again
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all rounded-lg bg-surface px-2.5 py-2 text-xs">{fresh}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(fresh); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      aria-label="Copy API key"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition hover:border-accent/40">
                      {copied ? <Check className="h-4 w-4 text-good" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {err && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-warn">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {err}
              </p>
            )}

            {keys.length > 0 && (
              <ul className="mt-5 space-y-2">
                {keys.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-3 rounded-xl border bg-surface-2/40 px-3.5 py-2.5">
                    <span className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{k.name}</span>
                      <Pill tone={k.revoked ? "bad" : "good"}>{k.revoked ? "revoked" : k.tier}</Pill>
                      <span className="tnum text-xs text-muted">{k.calls_24h ?? 0} calls</span>
                    </span>
                    {!k.revoked && (
                      <button onClick={() => revokeApiKey(k.id).then(refresh)}
                        aria-label={`Revoke ${k.name}`}
                        className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-bad/10 hover:text-bad">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </SectionCard>

      {/* quotas */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {TIERS.map((t) => (
          <div key={t.tier} className="card p-4">
            <p className="text-sm font-semibold capitalize">{t.tier}</p>
            <p className="tnum mt-1 text-lg font-semibold text-accent">{t.quota}</p>
            <p className="mt-1 text-xs text-muted">{t.who}</p>
          </div>
        ))}
      </div>

      {/* usage */}
      <div className="mt-5">
        <SectionCard title="Using the API" subtitle="Same pipeline as the web app" icon={<Terminal className="h-4.5 w-4.5" />}>
          <pre className="overflow-x-auto rounded-xl border bg-surface-2/60 p-3.5 text-xs leading-relaxed">
            <code>{CURL}</code>
          </pre>
          <p className="mt-3 text-xs text-muted">
            Endpoints: <code className="text-accent">POST /valuate</code> (full explainable result),{" "}
            <code className="text-accent">POST /estimate</code> (price only, fast),{" "}
            <code className="text-accent">POST /chat</code> (grounded Q&amp;A).
            Responses carry <code>X-RateLimit-Remaining</code>; exceeding your quota returns <code>429</code>.
          </p>
        </SectionCard>
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
