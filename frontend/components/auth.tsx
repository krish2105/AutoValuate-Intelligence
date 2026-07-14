"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogIn, LogOut, User, X, Loader2, Mail, Sparkles } from "lucide-react";
import { supabase, signIn, signUp, signOut, type Session } from "@/lib/supabase";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return { session, ready };
}

const input =
  "w-full rounded-xl border bg-surface-2/60 px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/25 placeholder:text-muted/60";

export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const fn = mode === "in" ? signIn : signUp;
    const { error, data } = await fn(email.trim(), pw);
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "up" && !data.session) return setMsg("Check your email to confirm your account, then sign in.");
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" />
          {/* flex-centred: framer's inline transform would clobber a Tailwind translate */}
          <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            role="dialog" aria-modal="true" aria-label="Account"
            className="relative w-full max-w-[380px] rounded-2xl border bg-surface p-6 shadow-lift"
          >
            <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2"><X className="h-4 w-4" /></button>
            <div className="mb-1 grid h-11 w-11 place-items-center rounded-xl bg-accent/12 text-accent"><Mail className="h-5 w-5" /></div>
            <h2 className="mt-2 text-lg font-semibold">{mode === "in" ? "Welcome back" : "Create your account"}</h2>
            <p className="mb-4 text-xs text-muted">{mode === "in" ? "Sign in to sync your valuation history." : "Save your valuations across devices."}</p>
            <form onSubmit={submit} className="space-y-3">
              <input className={input} type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <input className={input} type="password" required minLength={6} placeholder="Password (min 6 chars)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} />
              {msg && <p className="text-xs text-warn">{msg}</p>}
              <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg transition hover:brightness-105 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                {mode === "in" ? "Sign in" : "Sign up"}
              </button>
            </form>
            <button onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }} className="mt-3 w-full text-center text-xs text-muted hover:text-accent">
              {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
            </button>
            <div className="my-3 flex items-center gap-3 text-[11px] text-dim">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
            <button onClick={onClose} className="flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition hover:border-accent/40 hover:text-accent">
              <Sparkles className="h-4 w-4" /> Continue without an account
            </button>
            <p className="mt-2 text-center text-[11px] text-muted">You can value cars right away — an account just syncs your history across devices.</p>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

export function UserButton({ session, onSignIn }: { session: Session | null; onSignIn: () => void }) {
  const [menu, setMenu] = useState(false);
  if (!session) {
    return (
      <button onClick={onSignIn} className="inline-flex items-center gap-1.5 rounded-full border bg-surface/70 px-3 py-2 text-xs font-medium backdrop-blur transition hover:bg-surface-2">
        <LogIn className="h-4 w-4" /> <span className="hidden sm:inline">Sign in</span>
      </button>
    );
  }
  const email = session.user.email ?? "account";
  const initial = email[0]?.toUpperCase() ?? "U";
  return (
    <div className="relative">
      <button onClick={() => setMenu((m) => !m)} aria-label="Account menu" className="grid h-10 w-10 place-items-center rounded-full bg-accent/15 text-sm font-semibold text-accent transition hover:bg-accent/25">{initial}</button>
      <AnimatePresence>
        {menu && (
          <motion.div initial={{ opacity: 0, y: 6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.96 }}
            className="absolute right-0 top-12 z-40 w-52 rounded-xl border bg-surface p-1.5 shadow-lift">
            <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted"><User className="h-3.5 w-3.5" /><span className="truncate">{email}</span></div>
            <button onClick={() => { signOut(); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-fg transition hover:bg-surface-2 hover:text-bad">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
