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
export const signUp = (email: string, password: string) =>
  supabase.auth.signUp({ email, password });
export const signIn = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password });
export const signOut = () => supabase.auth.signOut();

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
