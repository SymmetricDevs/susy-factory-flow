"use client";
import { create } from "zustand";
import { newSequence, type Sequence } from "./model";

interface StudioState {
  enabled: boolean;
  sequence: Sequence;
  past: Sequence[];
  future: Sequence[];
  selected: string[];
  time: number;
  playing: boolean;
  setEnabled: (enabled: boolean) => void;
  load: (sequence: Sequence) => void;
  edit: (sequence: Sequence) => void;
  undo: () => void;
  redo: () => void;
}
export const useAnimationStudio = create<StudioState>((set) => ({
  enabled: false,
  sequence: newSequence(),
  past: [],
  future: [],
  selected: [],
  time: 0,
  playing: false,
  setEnabled: (enabled) => set({ enabled, playing: false }),
  load: (sequence) =>
    set({ sequence, past: [], future: [], selected: [], time: 0, playing: false }),
  edit: (sequence) =>
    set((state) =>
      sequence === state.sequence
        ? state
        : {
            sequence,
            past: [...state.past, state.sequence].slice(-100),
            future: [],
            playing: false,
            time: Math.min(state.time, sequence.duration),
          },
    ),
  undo: () =>
    set((state) =>
      !state.past.length
        ? state
        : {
            sequence: state.past.at(-1)!,
            past: state.past.slice(0, -1),
            future: [state.sequence, ...state.future],
            selected: [],
            playing: false,
            time: Math.min(state.time, state.past.at(-1)!.duration),
          },
    ),
  redo: () =>
    set((state) =>
      !state.future.length
        ? state
        : {
            sequence: state.future[0],
            past: [...state.past, state.sequence],
            future: state.future.slice(1),
            selected: [],
            playing: false,
            time: Math.min(state.time, state.future[0].duration),
          },
    ),
}));
