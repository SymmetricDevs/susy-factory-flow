"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { useFactoryStore } from "@/store/factory-store";

/** How long a failed add keeps its chip up before the board moves on. */
const ERROR_LINGER_MS = 6000;

/**
 * Progress chips for a recipe add: the recipe book closes on its plus button,
 * so these show the full recipe is still loading. They sit in the board's
 * bottom-centre notice column, wait a beat so a cached add never flashes one,
 * and report a failed fetch.
 */
export function RecipeAddChips() {
  const pending = useFactoryStore((state) => state.pendingRecipeAdds);
  const resolveRecipeAdd = useFactoryStore((state) => state.resolveRecipeAdd);

  // A failed chip lingers long enough to be read, then leaves on its own.
  useEffect(() => {
    const failed = pending.filter((entry) => entry.error);
    if (failed.length === 0) {
      return;
    }
    const timers = failed.map((entry) =>
      window.setTimeout(() => resolveRecipeAdd(entry.id), ERROR_LINGER_MS),
    );
    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [pending, resolveRecipeAdd]);

  if (pending.length === 0) {
    return null;
  }

  return (
    <>
      {pending.map((entry) => (
        <div
          key={entry.id}
          title={entry.error}
          className="flex items-center gap-2 rounded-md border border-neutral-700 bg-[#17191d]/95 px-3 py-1.5 text-xs shadow-lg [animation:recipe-add-chip-in_160ms_ease-out_150ms_both]"
        >
          {entry.error ? (
            <span className="text-rose-300">Could not add {entry.label}. Try again.</span>
          ) : (
            <>
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-cyan-300" />
              <span className="text-neutral-100">Adding {entry.label}...</span>
            </>
          )}
        </div>
      ))}
    </>
  );
}
