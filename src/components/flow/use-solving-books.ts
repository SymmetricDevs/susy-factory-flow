"use client";

import { useEffect, useState } from "react";
import { useFactoryStore } from "@/store/factory-store";

/**
 * True while the canvas is showing stale placeholder books - a big or slow
 * board whose real numbers are still computing in the worker - and has been
 * for longer than the grace period, so a background solve that lands quickly
 * never flashes an indicator. One hook so the board pill and the tab strip's
 * spinner can never disagree about whether the plan is still thinking.
 */
export function useSolvingBooks(graceMs = 500): boolean {
  // Held books (automatic recalculation off) are stale on purpose and are
  // not "thinking": the solve key says so instead.
  const stale = useFactoryStore(
    (state) => Boolean(state.lastResult.stale) && !state.lastResult.held,
  );
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!stale) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(true), graceMs);
    return () => window.clearTimeout(timer);
  }, [stale, graceMs]);
  return shown;
}
