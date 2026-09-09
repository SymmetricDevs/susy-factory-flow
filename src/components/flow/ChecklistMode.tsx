"use client";

import "./checklist.css";

import {
  useCallback,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type SyntheticEvent,
} from "react";
import { ClipboardCheck, RotateCcw } from "lucide-react";
import { useFactoryStore } from "@/store/factory-store";
import { playBoardSound } from "@/lib/board-sounds";

const cursor = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M3 2v21l5-6 5 10 4-2-5-10h8z" fill="#172922" stroke="#dcfce7" stroke-width="1.5"/><path d="m18 9 4 4 7-8" fill="none" stroke="#86efac" stroke-width="3" stroke-linecap="square"/></svg>')}") 3 2, crosshair`;
const keyClass =
  "pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center border-2 border-[var(--mc-15)]";

export function ChecklistKeys() {
  const active = useFactoryStore((s) => s.checklistMode);
  const project = useFactoryStore((s) => s.project);
  const cards = new Set(project.checklist?.cards);
  const edges = new Set(project.checklist?.edges);
  const done =
    [...project.nodes, ...(project.storages ?? [])].filter((n) => cards.has(n.id)).length +
    project.edges.filter((e) => edges.has(e.id)).length;
  const total = project.nodes.length + (project.storages?.length ?? 0) + project.edges.length;
  return (
    <div className="relative flex">
      <button
        type="button"
        aria-label="Checklist mode"
        aria-pressed={active}
        title="Checklist mode — click machines, drawers and wires to mark them complete. Click again to restore. Esc to leave."
        className={`${keyClass} ${active ? "bg-emerald-200 text-emerald-950 shadow-[inset_2px_2px_0_#ecfdf5,inset_-2px_-2px_0_#047857]" : "bg-[var(--mc-49)] text-white shadow-[inset_2px_2px_0_var(--mc-85),inset_-2px_-2px_0_var(--mc-25)] hover:brightness-110"}`}
        onClick={() => {
          playBoardSound(active ? "checklistOff" : "checklistOn");
          useFactoryStore.getState().setChecklistMode(!active);
        }}
      >
        <ClipboardCheck className="h-4 w-4" />
      </button>
      {active && (
        <div className="pointer-events-auto absolute left-0 top-full mt-2 flex items-center gap-1 whitespace-nowrap border-2 border-[var(--mc-15)] bg-[var(--mc-49)] p-1 shadow-lg">
          <span
            role="status"
            className="flex h-8 items-center px-1.5 font-mono text-[11px] text-emerald-200"
            title="Completed machines, drawers and wires"
          >
            {done}/{total} done
          </span>
          <button
            type="button"
            aria-label="Reset checklist"
            title="Reset checklist (can be undone)"
            disabled={!done}
            className={`${keyClass} bg-[var(--mc-49)] text-white disabled:opacity-30 hover:enabled:brightness-110`}
            onClick={() => useFactoryStore.getState().clearChecklist()}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

type ShownEdge = { id: string; data?: { bundle?: { edgeIds: string[] } } };

/** Capture before port controls and React Flow can turn a check into an edit. */
export function useChecklistBoard(shownEdges: ShownEdge[]) {
  const active = useFactoryStore((s) => s.checklistMode);
  useEffect(() => {
    if (!active) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      playBoardSound("checklistOff");
      useFactoryStore.getState().setChecklistMode(false);
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [active]);
  return useCallback(
    (event: SyntheticEvent) => {
      if (!active || !(event.target instanceof Element)) return false;
      // Navigation belongs to the camera, even over a completed card. Its
      // native mouse listener must receive the middle-button press.
      if (event.type === "wheel" || ("button" in event && event.button === 1)) return false;
      const element = event.target.closest(".react-flow__node, .react-flow__edge");
      if (!element) return false;
      const keyboard = event.type === "keydown" ? (event as ReactKeyboardEvent) : undefined;
      if (
        keyboard &&
        (keyboard.ctrlKey ||
          keyboard.metaKey ||
          keyboard.key === "Tab" ||
          keyboard.key === "Escape")
      )
        return false;
      event.stopPropagation();
      if (event.type !== "touchstart" && event.type !== "wheel") event.preventDefault();
      if (
        event.type === "click" ||
        (keyboard && !keyboard.repeat && (keyboard.key === "Enter" || keyboard.key === " "))
      ) {
        const id = element.getAttribute("data-id");
        if (id) {
          const edge = element.classList.contains("react-flow__edge");
          useFactoryStore
            .getState()
            .toggleChecklist(
              edge ? "edges" : "cards",
              edge ? (shownEdges.find((e) => e.id === id)?.data?.bundle?.edgeIds ?? [id]) : [id],
            );
        }
      }
      return true;
    },
    [active, shownEdges],
  );
}

export const checklistCursorStyle = { "--checklist-cursor": cursor };
