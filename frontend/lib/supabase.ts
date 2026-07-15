import { createClient, type Session } from "@supabase/supabase-js";
import type { ValuationResult } from "./types";

// The anon key is public by design (RLS is the security boundary, not key secrecy).
// Override via env if you rotate it; defaults keep the live site working out of the box.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://idshbheawsjsdmvsvvfq.supabase.co";
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc2hiaGVhd3Nqc2RtdnN2dmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMjk3MzEsImV4cCI6MjA5OTYwNTczMX0.5Z8kLcH_EroANX5E_5E5X7l8GXez31E4OtVSxkbwFKM";

export const supabase = createClient(URL, ANON, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export type { Session };

// ---- auth ----
// Return the confirmation link to THIS origin (prod on Vercel, localhost in dev) rather
// than whatever Supabase's "Site URL" happens to be — so clicking the emailed link lands
// back in the app, where supabase-js auto-detects the token and completes sign-in.
// (Add this origin to Supabase → Authentication → URL Configuration → Redirect URLs.)
const emailRedirectTo =
  typeof window !== "undefined" ? `${window.location.origin}/` : undefined;

export const signUp = (email: string, password: string) =>
  supabase.auth.signUp({ email, password, options: { emailRedirectTo } });
export const signIn = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password });
export const signOut = () => supabase.auth.signOut();
/** Re-send the confirmation email (Supabase's built-in sender is heavily rate-limited). */
export const resendConfirmation = (email: string) =>
  supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo } });

// ---- server-side valuation history (RLS: each row scoped to auth.uid()) ----
export interface CloudValuation {
  id: string;
  created_at: string;
  label: string;
  mid_aed: number;
  result: ValuationResult;
}

export async function saveValuationCloud(result: ValuationResult): Promise<void> {
  const v = result.vehicle;
  // drop base64 photos before persisting
  const slim: ValuationResult = { ...result, vehicle: { ...v, photos: [] } };
  const { error } = await supabase.from("valuations").insert({
    label: `${v.year} ${v.make} ${v.model}`,
    mid_aed: Math.round(result.valuation.price_mid_aed),
    result: slim,
  });
  if (error) throw error;
}

export async function loadValuationsCloud(): Promise<CloudValuation[]> {
  const { data, error } = await supabase
    .from("valuations")
    .select("id, created_at, label, mid_aed, result")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as CloudValuation[];
}

export async function clearValuationsCloud(): Promise<void> {
  // RLS ensures this only deletes the current user's rows
  await supabase.from("valuations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}

// ---- Phase D: public share links (works for guests — see supabase_shared_schema.sql) ----

export interface SharedValuation {
  slug: string;
  created_at: string;
  label: string;
  mid_aed: number;
  result: ValuationResult;
}

/** URL-safe, unguessable-enough slug. The slug is the capability, so give it real entropy. */
function makeSlug(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
}

/** Publish a read-only copy of a valuation and return its public slug. */
export async function shareValuation(result: ValuationResult): Promise<string> {
  const v = result.vehicle;
  // never publish the user's photos — strip them before the report leaves the device
  const slim: ValuationResult = { ...result, vehicle: { ...v, photos: [] } };
  const slug = makeSlug();
  const { error } = await supabase.from("shared_valuations").insert({
    slug,
    label: `${v.year} ${v.make} ${v.model}`.slice(0, 120),
    mid_aed: Math.round(result.valuation.price_mid_aed),
    result: slim,
  });
  if (error) throw error;
  return slug;
}

// ---- Phase I: API keys + usage (see supabase_api_keys_schema.sql) ----

export interface ApiKeyRow {
  id: string;
  name: string;
  tier: string;
  revoked: boolean;
  created_at: string;
  calls_24h?: number;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Mint an API key. The plaintext is generated here, shown to the user ONCE, and never
 * stored — only its SHA-256 hash goes to the database. A leaked database therefore
 * yields no usable credentials.
 */
export async function createApiKey(name: string): Promise<string> {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const plaintext = `av_live_${secret}`;

  const { error } = await supabase.from("api_keys").insert({
    name: name.trim() || "default",
    key_hash: await sha256Hex(plaintext),
  });
  if (error) throw error;
  return plaintext; // the only time this value exists outside the caller's machine
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, tier, revoked, created_at, api_usage(count)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, name: r.name, tier: r.tier, revoked: r.revoked, created_at: r.created_at,
    calls_24h: r.api_usage?.[0]?.count ?? 0,
  }));
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await supabase.from("api_keys").update({ revoked: true }).eq("id", id);
  if (error) throw error;
}

/** Fetch a shared report by slug (anonymous read). Returns null when it doesn't exist. */
export async function loadSharedValuation(slug: string): Promise<SharedValuation | null> {
  const { data, error } = await supabase
    .from("shared_valuations")
    .select("slug, created_at, label, mid_aed, result")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return data as SharedValuation;
}
