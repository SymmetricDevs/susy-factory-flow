"use client";

import type { ReactNode } from "react";

/**
 * The rounded grey panel the browser column's search and filter controls sit
 * in, above the list they filter. One component so every view of the column
 * boxes its controls the same way.
 */
export function ControlsCard({ children }: { children: ReactNode }) {
  return (
    <div className="mx-2 mt-2 shrink-0 rounded-[6px] border border-neutral-700 bg-[#2a2d33] p-2">
      {children}
    </div>
  );
}
