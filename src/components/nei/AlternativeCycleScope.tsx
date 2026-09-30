"use client";

import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { AlternativeCycleFace } from "@/lib/nei/alternative-cycle";

export interface AlternativeCycleScopeValue {
  /** Face index a slot was locked to; absent means it is still rotating. */
  locked: Readonly<Record<number, number>>;
  /** Locks a slot to a face. Called when the slot is scrolled. */
  lock: (resourceIndex: number, faceIndex: number) => void;
  /**
   * Records what a slot is showing right now, WITHOUT re-rendering: the add
   * button reads each slot's face once, on click. State would re-render every
   * card on every tick, so the leaves write into a ref.
   */
  report: (resourceIndex: number, face: AlternativeCycleFace | undefined) => void;
}

const AlternativeCycleContext = createContext<AlternativeCycleScopeValue | undefined>(undefined);

/**
 * Marks a subtree where oredict slots rotate through their alternatives.
 * Slots outside a scope never cycle or subscribe to the clock.
 */
export function AlternativeCycleScope({
  children,
  facesRef,
}: {
  children: ReactNode;
  /** Receives the face each slot is currently showing, keyed by input index. */
  facesRef: React.MutableRefObject<Map<number, AlternativeCycleFace>>;
}) {
  const [locked, setLocked] = useState<Record<number, number>>({});

  const value = useMemo<AlternativeCycleScopeValue>(
    () => ({
      locked,
      lock: (resourceIndex, faceIndex) =>
        setLocked((current) => ({ ...current, [resourceIndex]: faceIndex })),
      report: (resourceIndex, face) => {
        if (face) {
          facesRef.current.set(resourceIndex, face);
        } else {
          facesRef.current.delete(resourceIndex);
        }
      },
    }),
    [facesRef, locked],
  );

  return (
    <AlternativeCycleContext.Provider value={value}>{children}</AlternativeCycleContext.Provider>
  );
}

export function useAlternativeCycleScope(): AlternativeCycleScopeValue | undefined {
  return useContext(AlternativeCycleContext);
}

/** Convenience for owners of a scope: the ref to hand to `AlternativeCycleScope`. */
export function useAlternativeCycleFacesRef() {
  return useRef<Map<number, AlternativeCycleFace>>(new Map());
}
