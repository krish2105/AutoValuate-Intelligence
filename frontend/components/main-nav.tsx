"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ShieldCheck, GitCompare, Building2, Code2, Home } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Site navigation.
 *
 * WHY THIS EXISTS
 * ---------------
 * Six routes were built and shipped — /model, /compare, /dealer, /developers — and the homepage
 * linked to exactly ONE of them (a text link to /model in the footer). Everything else was
 * reachable only by typing the URL, so the features looked absent to anyone using the site, and
 * the deck appeared to claim things the product did not have. The features were never missing;
 * the navigation was.
 *
 * Deliberately NOT here: /pricing. Paid tiers are withdrawn while the AGPL-3.0 licensing
 * question is unresolved (docs/LICENSING.md) — advertising plans we cannot lawfully sell as
 * closed source is the kind of claim this project exists not to make.
 */
const LINKS = [
  { href: "/", label: "Valuate", icon: Home, blurb: "Value a car" },
  { href: "/compare", label: "Compare", icon: GitCompare, blurb: "Two cars, side by side" },
  { href: "/dealer", label: "Dealer", icon: Building2, blurb: "Bulk CSV fleet valuation" },
  { href: "/model", label: "Model card", icon: ShieldCheck, blurb: "Every metric, failures included" },
  { href: "/developers", label: "API", icon: Code2, blurb: "Value cars programmatically" },
];

export function MainNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Desktop: inline links. Kept compact so the header still fits the status pill,
          history, command palette and theme toggle without wrapping. */}
      <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
        {LINKS.filter((l) => l.href !== "/").map((l) => (
          <Link
            key={l.href}
            href={l.href}
            title={l.blurb}
            className={cn(
              "rounded-full px-3 py-2 text-xs font-medium transition",
              isActive(l.href) ? "bg-accent/12 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      {/* Mobile/tablet: a sheet, so the same routes are reachable on a phone. */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="grid h-10 w-10 place-items-center rounded-full border bg-surface/70 backdrop-blur transition hover:bg-surface-2 lg:hidden"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            />
            <motion.nav
              aria-label="Main"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className="fixed left-3 right-3 top-3 z-50 rounded-2xl border bg-surface p-2 shadow-lift lg:hidden"
            >
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-xs font-semibold text-muted">Menu</span>
                <button onClick={() => setOpen(false)} aria-label="Close menu"
                  className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-2">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {LINKS.map((l) => {
                const Icon = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl px-3 py-2.5 transition",
                      isActive(l.href) ? "bg-accent/12" : "hover:bg-surface-2",
                    )}
                  >
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", isActive(l.href) ? "text-accent" : "text-muted")} />
                    <span className="min-w-0">
                      <span className={cn("block text-sm font-medium", isActive(l.href) && "text-accent")}>{l.label}</span>
                      <span className="block text-[11px] text-muted">{l.blurb}</span>
                    </span>
                  </Link>
                );
              })}
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
