"use client";
import { motion } from "framer-motion";
import { Car, Sparkles } from "lucide-react";
import { DEMO_CARS, type DemoCar } from "@/lib/demo-garage";
import { cn } from "@/lib/utils";

/**
 * One-click sample cars. Runs the whole pipeline instantly (works offline) so a demo
 * never depends on the live backend or on a judge's own photos.
 */
export function DemoGarage({ onPick, disabled }: { onPick: (car: DemoCar) => void; disabled?: boolean }) {
  return (
    <div className="rounded-2xl border bg-surface-2/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/12 text-accent">
          <Car className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs font-semibold">Try a sample car</p>
          <p className="text-[10px] text-muted">Runs the full pipeline instantly — no photos needed</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {DEMO_CARS.map((car, i) => (
          <motion.button
            key={car.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(car)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "group relative overflow-hidden rounded-xl border bg-surface p-3 text-left transition",
              "hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xl">{car.emoji}</span>
              <span className={cn(
                "h-1.5 w-1.5 rounded-full",
                car.accent === "good" ? "bg-good" : car.accent === "warn" ? "bg-warn" : "bg-info",
              )} />
            </div>
            <p className="text-xs font-semibold leading-tight">{car.name}</p>
            <p className="mt-0.5 text-[10px] leading-tight text-muted">{car.tagline}</p>
            <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-accent opacity-0 transition group-hover:opacity-100">
              <Sparkles className="h-2.5 w-2.5" /> value it
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
