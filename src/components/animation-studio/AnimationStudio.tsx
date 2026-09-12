"use client";

import { useEffect, useRef, useState, type RefObject, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { useReactFlow } from "@xyflow/react";
import {
  Camera as CameraIcon,
  MousePointer2,
  Diamond,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Undo2,
  Redo2,
  X,
  Plus,
  Copy,
  Trash2,
  Crosshair,
  Download,
  Upload,
  Clapperboard,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAnimationStudio } from "@/lib/animation-studio/store";
import {
  ACTIONS,
  EASINGS,
  TRACKS,
  FLAT_TILT,
  actionsBetween,
  moveKeys,
  newSequence,
  parseSequence,
  sampleTrack,
  snapTime,
  uid,
  type Action,
  type Camera,
  type Keyframe,
  type Sequence,
  type Tilt,
  type Track,
} from "@/lib/animation-studio/model";
import { executeDomAction, selectorFor } from "@/lib/animation-studio/actions";
import { useFactoryStore } from "@/store/factory-store";
import { useDesignStore } from "@/store/design-store";
import { BOARD_MIN_ZOOM, boardMaxZoom } from "../flow/board-camera";
import { stopBoardTimelapse } from "../flow/board-timelapse";
import "./studio.css";

const store = useAnimationStudio;
const names: Record<Track, string> = {
  camera: "Camera",
  tilt: "Tilt & rotation",
  cursor: "Cursor",
  action: "Actions",
  marker: "Markers",
};
const easeNames = {
  linear: "Linear",
  smooth: "Smooth",
  "ease-in": "Ease in",
  "ease-out": "Ease out",
  cut: "Instant cut",
};
const actionNames = {
  click: "Click",
  "double-click": "Double click",
  "right-click": "Right click",
  scroll: "Scroll list",
  type: "Type text",
  undo: "Board undo",
  redo: "Board redo",
};
const storageKey = (id: string) => `gtnh-factory-flow.dev.animation.v1.${id}`;

function Tool({
  label,
  children,
  onClick,
  disabled,
  active,
}: {
  label: string;
  children?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={active ? "as-tool active" : "as-tool"}
    >
      {children ?? label}
    </button>
  );
}
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="as-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={Number(value.toFixed(4))}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          if (!event.target.value) return;
          const n = Number(event.target.value);
          if (Number.isFinite(n))
            onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n)));
        }}
      />
    </label>
  );
}

export function AnimationStudio({ boardRef }: { boardRef: RefObject<HTMLDivElement | null> }) {
  const enabled = store((state) => state.enabled);
  const projectId = useFactoryStore((state) => state.project.id);
  const designId = useDesignStore(
    (state) =>
      state.activeDesignId ?? (state.publicView ? `public:${state.publicView.id}` : undefined),
  );
  const sessionId = designId ?? `project:${projectId}`;
  return enabled ? (
    <StudioSession key={sessionId} sessionId={sessionId} boardRef={boardRef} />
  ) : null;
}

function StudioSession({
  boardRef,
  sessionId,
}: {
  boardRef: RefObject<HTMLDivElement | null>;
  sessionId: string;
}) {
  const flow = useReactFlow();
  const state = store();
  const { sequence, selected, time, playing } = state;
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [clean, setClean] = useState(false);
  const [height, setHeight] = useState(350);
  const [pixels, setPixels] = useState(50);
  const [snap, setSnap] = useState(true);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [runActions, setRunActions] = useState(false);
  const [pick, setPick] = useState<"cursor" | "action" | null>(null);
  const [message, setMessage] = useState(
    "Frame the board, then add a camera key. Move the playhead and repeat.",
  );
  const [help, setHelp] = useState(false);
  const [liveTilt, setLiveTilt] = useState<Tilt>(FLAT_TILT);
  const [dragSequence, setDragSequence] = useState<Sequence | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const initialViewport = useRef(flow.getViewport());
  const baseline = useRef(useFactoryStore.getState());
  const initialScroll = useRef(new Map<Element, { x: number; y: number }>());
  const previousTime = useRef(-1);
  const executedActions = useRef(new Set<string>());
  const clipboard = useRef<Keyframe[]>([]);
  const currentTilt = useRef<Tilt>(FLAT_TILT);
  const pickCleanup = useRef<() => void>(() => {});
  const interactionCleanup = useRef<() => void>(() => {});
  const key = sequence.keys.find((key) => key.id === selected[0]);
  const shown = dragSequence ?? sequence;

  const readCamera = (): Camera => {
    const wrapper = boardRef.current?.querySelector<HTMLElement>(".react-flow");
    const viewport = flow.getViewport();
    return {
      cx: ((wrapper?.clientWidth ?? 800) / 2 - viewport.x) / viewport.zoom,
      cy: ((wrapper?.clientHeight ?? 600) / 2 - viewport.y) / viewport.zoom,
      zoom: viewport.zoom,
    };
  };
  const applyCamera = (camera: Camera) => {
    const wrapper = boardRef.current?.querySelector<HTMLElement>(".react-flow");
    if (!wrapper) return;
    const zoom = Math.max(BOARD_MIN_ZOOM, Math.min(boardMaxZoom(), camera.zoom));
    void flow.setViewport(
      {
        x: wrapper.clientWidth / 2 - camera.cx * zoom,
        y: wrapper.clientHeight / 2 - camera.cy * zoom,
        zoom,
      },
      { duration: 0 },
    );
  };
  const applyTilt = (tilt: Tilt) => {
    currentTilt.current = tilt;
    const wrapper = boardRef.current?.querySelector<HTMLElement>(".react-flow");
    if (wrapper)
      wrapper.style.transform = `perspective(${tilt.perspective}px) rotateX(${tilt.pitch}deg) rotateY(${tilt.yaw}deg) rotateZ(${tilt.roll}deg) scale(${tilt.scale})`;
  };
  const applyVisuals = (nextTime: number, doc = store.getState().sequence) => {
    const camera = sampleTrack(doc, "camera", nextTime);
    const tilt = sampleTrack(doc, "tilt", nextTime);
    const cursor = sampleTrack(doc, "cursor", nextTime);
    if (camera) applyCamera(camera);
    applyTilt(tilt ?? FLAT_TILT);
    if (cursorRef.current) {
      cursorRef.current.style.display = cursor?.visible ? "block" : "none";
      if (cursor)
        cursorRef.current.style.transform = `translate(${cursor.x * innerWidth}px, ${cursor.y * innerHeight}px)`;
    }
  };
  const seek = (next: number) => {
    const t = snapTime(next, sequence.fps, sequence.duration);
    store.setState({ time: t, playing: false });
    previousTime.current = t === 0 ? -1 : t;
    executedActions.current = new Set(
      t === 0
        ? []
        : sequence.keys.filter((k) => k.track === "action" && k.time <= t).map((k) => k.id),
    );
    applyVisuals(t);
    setLiveTilt(currentTilt.current);
  };
  const stop = () => {
    store.setState({ playing: false, time: 0 });
    previousTime.current = -1;
    executedActions.current.clear();
    void flow.setViewport(initialViewport.current, { duration: 0 });
    applyTilt(FLAT_TILT);
    setLiveTilt(FLAT_TILT);
    if (cursorRef.current) cursorRef.current.style.display = "none";
  };
  const edit = (doc: Sequence) => state.edit(doc);
  const patchKey = (patch: Partial<Keyframe>) => {
    const doc = {
      ...sequence,
      keys: sequence.keys.map((k) => (k.id === key?.id ? ({ ...k, ...patch } as Keyframe) : k)),
    };
    edit(doc);
    applyVisuals(time, doc);
  };
  const addKey = (track: Track, value?: Keyframe["value"], label?: string) => {
    const defaults = {
      camera: readCamera(),
      tilt: currentTilt.current,
      cursor: { x: 0.5, y: 0.4, visible: true },
      action: { kind: "click", selector: "", x: 0.5, y: 0.4, text: "", deltaX: 0, deltaY: 300 },
      marker: { note: "" },
    };
    const next = {
      id: uid(),
      track,
      time,
      label:
        label ?? `${names[track]} ${sequence.keys.filter((k) => k.track === track).length + 1}`,
      easing: "smooth",
      enabled: true,
      value: value ?? defaults[track],
    } as Keyframe;
    edit({ ...sequence, keys: [...sequence.keys, next] });
    store.setState({ selected: [next.id] });
  };
  const duplicate = () => {
    const keys = sequence.keys
      .filter((k) => selected.includes(k.id))
      .map((k) => ({
        ...k,
        id: uid(),
        time: Math.min(sequence.duration, k.time + 1 / sequence.fps),
      }));
    if (!keys.length) return;
    edit({ ...sequence, keys: [...sequence.keys, ...keys] });
    store.setState({ selected: keys.map((k) => k.id) });
  };
  const remove = () => {
    if (selected.length) {
      edit({ ...sequence, keys: sequence.keys.filter((k) => !selected.includes(k.id)) });
      store.setState({ selected: [] });
    }
  };
  const history = (redo = false) => {
    if (redo) state.redo();
    else state.undo();
    const current = store.getState();
    applyVisuals(current.time, current.sequence);
    setLiveTilt(currentTilt.current);
  };
  const preset = (kind: "push" | "pull" | "pan" | "tilt" | "hold") => {
    const camera = readCamera(),
      tilt = currentTilt.current;
    const end = Math.min(3600, time + 3);
    const track = kind === "tilt" ? "tilt" : "camera";
    const destination =
      kind === "tilt"
        ? { ...tilt, pitch: 15, yaw: -12, roll: -3 }
        : {
            ...camera,
            zoom:
              kind === "push"
                ? Math.min(boardMaxZoom(), camera.zoom * 1.6)
                : kind === "pull"
                  ? Math.max(BOARD_MIN_ZOOM, camera.zoom / 1.6)
                  : camera.zoom,
            cx: kind === "pan" ? camera.cx + 300 / camera.zoom : camera.cx,
          };
    const label = {
      push: "Push in",
      pull: "Pull out",
      pan: "Pan right",
      tilt: "Tilt reveal",
      hold: "Hold",
    }[kind];
    const keys = [
      {
        id: uid(),
        time,
        track,
        value: kind === "tilt" ? tilt : camera,
        label: `${label} start`,
        enabled: true,
        easing: "smooth",
      },
      { id: uid(), time: end, track, value: destination, label, enabled: true, easing: "smooth" },
    ] as Keyframe[];
    edit({
      ...sequence,
      duration: Math.max(sequence.duration, end),
      keys: [...sequence.keys, ...keys],
    });
    store.setState({ selected: [keys[1].id] });
  };
  const togglePlay = () => {
    if (!playing) stopBoardTimelapse({ reframe: false });
    if (!playing && time >= sequence.duration) {
      seek(0);
      previousTime.current = -1;
    }
    store.setState({ playing: !playing });
  };

  /* Opening a session hydrates an external, per-design document before exposing the editor. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    stopBoardTimelapse({ reframe: false });
    const board = boardRef.current;
    const wrapper = board?.querySelector<HTMLElement>(".react-flow");
    const oldTransform = wrapper?.style.transform ?? "";
    board?.setAttribute("data-animation-stage", "");
    applyTilt(FLAT_TILT);
    try {
      const saved = localStorage.getItem(storageKey(sessionId));
      state.load(saved ? parseSequence(saved) : newSequence());
      if (saved)
        setMessage(
          "Sequence restored. Scrub to preview; enable Execute actions to play app gestures.",
        );
    } catch {
      state.load(newSequence());
      setMessage("Saved sequence could not be read. Import a backup or start a new sequence.");
    }
    setReady(true);
    return () => {
      store.setState({ playing: false });
      pickCleanup.current();
      interactionCleanup.current();
      board?.removeAttribute("data-animation-stage");
      board?.removeAttribute("data-animation-clean");
      if (wrapper) wrapper.style.transform = oldTransform;
      const designs = useDesignStore.getState();
      const activeSession =
        designs.activeDesignId ??
        (designs.publicView
          ? `public:${designs.publicView.id}`
          : `project:${useFactoryStore.getState().project.id}`);
      // During a tab handover the incoming design owns the camera already.
      if (activeSession === sessionId)
        void flow.setViewport(initialViewport.current, { duration: 0 });
    };
    // One session owns its original view and local document until the design changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey(sessionId), JSON.stringify(sequence));
      } catch {
        setMessage(
          "Device storage is full or unavailable. Export the sequence to keep your edits.",
        );
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      try {
        localStorage.setItem(storageKey(sessionId), JSON.stringify(sequence));
      } catch {
        /* The live session remains usable. */
      }
    };
  }, [sequence, ready, sessionId]);

  useEffect(() => {
    boardRef.current?.toggleAttribute("data-animation-clean", clean);
  }, [clean, boardRef]);

  const playbackRef = useRef({ applyVisuals, runActions, loop, speed });
  useEffect(() => {
    playbackRef.current = { applyVisuals, runActions, loop, speed };
  });
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last: number | undefined;
    const step = (now: number) => {
      const current = store.getState();
      if (!current.playing) return;
      const settings = playbackRef.current;
      const next = Math.min(
        current.sequence.duration,
        current.time + ((last === undefined ? 0 : now - last) / 1000) * settings.speed,
      );
      last = now;
      settings.applyVisuals(next);
      if (settings.runActions) {
        for (const action of actionsBetween(current.sequence, previousTime.current, next)) {
          if (executedActions.current.has(action.id)) continue;
          try {
            if (action.value.kind === "undo") useFactoryStore.getState().undo();
            else if (action.value.kind === "redo") useFactoryStore.getState().redo();
            else flushSync(() => executeDomAction(action));
            executedActions.current.add(action.id);
            if (cursorRef.current)
              cursorRef.current.animate(
                [
                  { filter: "drop-shadow(0 0 0 #22d3ee)" },
                  { filter: "drop-shadow(0 0 12px #22d3ee)" },
                  { filter: "drop-shadow(0 0 0 #22d3ee)" },
                ],
                { duration: 350 },
              );
          } catch (error) {
            previousTime.current = action.time - 0.000001;
            store.setState({ playing: false, time: action.time });
            setMessage(
              `Paused at ${action.time.toFixed(2)}s: ${error instanceof Error ? error.message : String(error)}`,
            );
            return;
          }
        }
      }
      previousTime.current = next;
      if (next >= current.sequence.duration) {
        if (settings.loop && !settings.runActions) {
          previousTime.current = -1;
          store.setState({ time: 0 });
        } else {
          store.setState({ time: next, playing: false });
          return;
        }
      } else store.setState({ time: next });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const hidden = () => {
      if (document.hidden) store.setState({ playing: false });
    };
    document.addEventListener("visibilitychange", hidden);
    const interrupt = (event: Event) => {
      if (event.isTrusted && !(event.target as Element)?.closest?.("[data-animation-studio]"))
        store.setState({ playing: false });
    };
    window.addEventListener("pointerdown", interrupt, true);
    window.addEventListener("wheel", interrupt, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pointerdown", interrupt, true);
      window.removeEventListener("wheel", interrupt, true);
    };
  }, [playing]);

  useEffect(() => {
    if (!pick) return;
    const choose = (event: PointerEvent) => {
      const element = event.target as Element;
      if (element.closest("[data-animation-studio]")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const x = event.clientX / innerWidth,
        y = event.clientY / innerHeight;
      if (pick === "cursor") addKey("cursor", { x, y, visible: true });
      else {
        const target = element.closest("button, input, textarea, [role='button']") ?? element;
        const selector = selectorFor(target);
        const label =
          target.getAttribute("aria-label") ?? target.textContent?.trim().slice(0, 60) ?? "Click";
        if (key?.track === "action") patchKey({ value: { ...key.value, selector, x, y } });
        else
          addKey(
            "action",
            { kind: "click", selector, x, y, text: "", deltaX: 0, deltaY: 300 },
            label || "Click",
          );
      }
      // Swallow the release/click too so picking does not activate the chosen control.
      pickCleanup.current();
      const controller = new AbortController();
      const swallow = (e: Event) => {
        if ((e.target as Element)?.closest?.("[data-animation-studio]")) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.type === "click") controller.abort();
      };
      window.addEventListener("click", swallow, { capture: true, signal: controller.signal });
      window.addEventListener("pointerup", swallow, { capture: true, signal: controller.signal });
      window.addEventListener("mouseup", swallow, { capture: true, signal: controller.signal });
      const timer = setTimeout(() => controller.abort(), 1000);
      pickCleanup.current = () => {
        clearTimeout(timer);
        controller.abort();
      };
      setPick(null);
      setMessage("Point captured. Edit its timing and properties in the inspector.");
    };
    window.addEventListener("pointerdown", choose, true);
    return () => window.removeEventListener("pointerdown", choose, true);
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        interactionCleanup.current();
        setDragSequence(null);
        if (pick) setPick(null);
        else if (clean) setClean(false);
        else if (playing) store.setState({ playing: false });
        else setCollapsed((c) => !c);
        return;
      }
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      const inside = target.closest("[data-animation-studio]");
      const modifier = event.ctrlKey || event.metaKey;
      if (event.code === "Space" && (inside || clean)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        togglePlay();
        return;
      }
      if (!inside) return;
      const command = event.key.toLowerCase();
      let handled = true;
      if (modifier && command === "z") history(event.shiftKey);
      else if (modifier && command === "y") history(true);
      else if (modifier && command === "d") duplicate();
      else if (modifier && command === "a")
        store.setState({ selected: sequence.keys.map((k) => k.id) });
      else if (modifier && command === "c")
        clipboard.current = sequence.keys.filter((k) => selected.includes(k.id));
      else if (modifier && command === "v" && clipboard.current.length) {
        const start = Math.min(...clipboard.current.map((k) => k.time));
        const keys = clipboard.current.map((k) => ({
          ...k,
          id: uid(),
          time: Math.min(sequence.duration, time + k.time - start),
        }));
        edit({ ...sequence, keys: [...sequence.keys, ...keys] });
        store.setState({ selected: keys.map((k) => k.id) });
      } else if (command === "delete" || command === "backspace") remove();
      else if (command === "arrowleft" || command === "arrowright")
        seek(time + (command === "arrowright" ? 1 : -1) * (event.shiftKey ? 1 : 1 / sequence.fps));
      else if (command === "home") seek(0);
      else if (command === "end") seek(sequence.duration);
      else handled = false;
      if (handled) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const restoreBoard = () => {
    stop();
    const saved = baseline.current;
    if (useFactoryStore.getState().project.id !== saved.project.id) return;
    useFactoryStore.getState().setProject(saved.project);
    useFactoryStore.setState({
      undoHistory: saved.undoHistory,
      redoHistory: saved.redoHistory,
      selectedNodeId: saved.selectedNodeId,
      selectedBoardIds: saved.selectedBoardIds,
    });
    useFactoryStore.getState().clearResourceBrowser();
    for (const [element, pos] of initialScroll.current)
      if (element.isConnected) element.scrollTo(pos.x, pos.y);
    setMessage("Board restored to the start state. Timeline edits are kept.");
  };
  const captureStart = () => {
    baseline.current = useFactoryStore.getState();
    initialViewport.current = flow.getViewport();
    initialScroll.current = new Map(
      Array.from(document.querySelectorAll("*"))
        .filter((e) => e.scrollTop || e.scrollLeft)
        .map((e) => [e, { x: e.scrollLeft, y: e.scrollTop }]),
    );
    setMessage(
      "Start board and view saved for this session. Restore start puts the board back after a rehearsal.",
    );
  };
  const exportFile = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(sequence, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sequence.name.replace(/[^a-z0-9_-]/gi, "-")}.animation.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const timeFromPointer = (clientX: number, element: HTMLElement) =>
    snapTime(
      (clientX - element.getBoundingClientRect().left) / pixels,
      snap ? sequence.fps : 1000,
      sequence.duration,
    );
  const moveSelection = (event: React.PointerEvent<HTMLButtonElement>, item: Keyframe) => {
    event.stopPropagation();
    if (event.button !== 0 || playing) return;
    interactionCleanup.current();
    if (event.shiftKey) {
      store.setState({
        selected: selected.includes(item.id)
          ? selected.filter((id) => id !== item.id)
          : [...selected, item.id],
      });
      return;
    }
    const ids = selected.includes(item.id) ? selected : [item.id];
    store.setState({ selected: ids });
    const startX = event.clientX,
      startScroll = timelineRef.current?.scrollLeft ?? 0;
    let next = sequence;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - startX + (timelineRef.current?.scrollLeft ?? 0) - startScroll;
      let delta = dx / pixels;
      if (snap) {
        delta = snapTime(item.time + delta, sequence.fps, sequence.duration) - item.time;
        const candidates = [
          time,
          ...sequence.keys.filter((k) => !ids.includes(k.id)).map((k) => k.time),
        ];
        const nearby = candidates.find((t) => Math.abs(t - item.time - delta) * pixels < 7);
        if (nearby !== undefined) delta = nearby - item.time;
      }
      next = moveKeys(sequence, ids, delta);
      setDragSequence(next);
    };
    const end = (e: PointerEvent) => {
      interactionCleanup.current();
      setDragSequence(null);
      if (e.type !== "pointercancel" && next !== sequence) edit(next);
    };
    interactionCleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  const resize = (event: React.PointerEvent) => {
    interactionCleanup.current();
    const start = event.clientY,
      original = height;
    const move = (e: PointerEvent) =>
      setHeight(Math.max(220, Math.min(innerHeight * 0.7, original + start - e.clientY)));
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    interactionCleanup.current = end;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  if (!ready) return null;
  return createPortal(
    <>
      <div ref={cursorRef} className="as-cursor-overlay" aria-hidden="true">
        <MousePointer2 size={30} fill="white" stroke="#111827" strokeWidth={1.4} />
      </div>
      {pick ? (
        <div data-animation-studio className="as-pick-banner">
          {pick === "cursor"
            ? "Click anywhere to place the cursor"
            : "Click an app control to target it"}{" "}
          · Esc cancels <button onClick={() => setPick(null)}>Cancel</button>
        </div>
      ) : null}
      {clean ? (
        <button data-animation-studio className="as-return" onClick={() => setClean(false)}>
          Animation studio · Esc
        </button>
      ) : (
        <section
          data-animation-studio
          className={`animation-studio ${collapsed ? "is-collapsed" : ""}`}
          aria-label="Animation studio"
          tabIndex={-1}
          style={{ height: collapsed ? 54 : height }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onPointerDownCapture={(e) => {
            if (!(e.target as Element).closest("input, textarea, select, button"))
              e.currentTarget.focus({ preventScroll: true });
          }}
        >
          {!collapsed && (
            <div className="as-resize" onPointerDown={resize} title="Drag to resize the timeline" />
          )}
          <header className="as-header">
            <Clapperboard size={19} className="as-brand" />
            <input
              className="as-name"
              aria-label="Sequence name"
              value={sequence.name}
              onChange={(e) => edit({ ...sequence, name: e.target.value || "Untitled sequence" })}
            />
            <span className="as-badge">DEV</span>
            <span className="as-divider" />
            <Tool label="Go to start (Home)" onClick={() => seek(0)}>
              <SkipBack />
            </Tool>
            <Tool
              label={playing ? "Pause (Space)" : "Play (Space)"}
              onClick={togglePlay}
              active={playing}
            >
              {playing ? <Pause /> : <Play />}
            </Tool>
            <Tool label="Stop and restore view" onClick={stop}>
              <Square />
            </Tool>
            <Tool label="Go to end (End)" onClick={() => seek(sequence.duration)}>
              <SkipForward />
            </Tool>
            <span className="as-time">
              {Math.floor(time / 60)
                .toString()
                .padStart(2, "0")}
              :
              {Math.floor(time % 60)
                .toString()
                .padStart(2, "0")}
              :
              {Math.floor((time % 1) * sequence.fps)
                .toString()
                .padStart(2, "0")}
            </span>
            <select
              aria-label="Playback speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              {[0.25, 0.5, 1, 1.5, 2, 4].map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
            <label className="as-check">
              <input
                type="checkbox"
                checked={loop}
                disabled={runActions}
                onChange={(e) => setLoop(e.target.checked)}
              />
              Loop
            </label>
            <div className="as-spacer" />
            <Tool
              label="Undo timeline edit (Ctrl+Z)"
              disabled={!state.past.length}
              onClick={() => history()}
            >
              <Undo2 />
            </Tool>
            <Tool
              label="Redo timeline edit (Ctrl+Shift+Z)"
              disabled={!state.future.length}
              onClick={() => history(true)}
            >
              <Redo2 />
            </Tool>
            <Tool label="Clean preview (Esc to return)" onClick={() => setClean(true)}>
              <Eye />
            </Tool>
            <Tool
              label={collapsed ? "Expand timeline" : "Collapse timeline"}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <ChevronUp /> : <ChevronDown />}
            </Tool>
            <Tool label="Close animation studio" onClick={() => state.setEnabled(false)}>
              <X />
            </Tool>
          </header>
          {!collapsed && (
            <>
              <div className="as-toolbar">
                <Tool label="Add camera key" onClick={() => addKey("camera")}>
                  <CameraIcon />
                  <span>Camera</span>
                  <Plus />
                </Tool>
                <Tool label="Add tilt key" onClick={() => addKey("tilt")}>
                  <Diamond />
                  <span>Tilt</span>
                  <Plus />
                </Tool>
                <Tool
                  label="Place cursor key"
                  onClick={() => {
                    store.setState({ playing: false });
                    setPick("cursor");
                  }}
                >
                  <MousePointer2 />
                  <span>Cursor</span>
                  <Plus />
                </Tool>
                <Tool
                  label="Pick action target"
                  onClick={() => {
                    store.setState({ playing: false });
                    setPick("action");
                  }}
                >
                  <Crosshair />
                  <span>Action</span>
                  <Plus />
                </Tool>
                <Tool label="Add marker" onClick={() => addKey("marker")} />
                <span className="as-divider" />
                <Tool
                  label="Duplicate selected (Ctrl+D)"
                  disabled={!selected.length}
                  onClick={duplicate}
                >
                  <Copy />
                </Tool>
                <Tool label="Delete selected (Delete)" disabled={!selected.length} onClick={remove}>
                  <Trash2 />
                </Tool>
                <label className="as-check">
                  <input
                    type="checkbox"
                    checked={snap}
                    onChange={(e) => setSnap(e.target.checked)}
                  />
                  Snap
                </label>
                <label
                  className="as-check"
                  title="Actions affect the live app and run only when playing forward. Loop is visual-only."
                >
                  <input
                    type="checkbox"
                    checked={runActions}
                    disabled={playing}
                    onChange={(e) => {
                      setRunActions(e.target.checked);
                      if (e.target.checked) {
                        setLoop(false);
                        setMessage(
                          "Actions will operate the live app. Save a start state before rehearsal; Restore start resets the board.",
                        );
                      }
                    }}
                  />
                  Execute actions
                </label>
                <div className="as-spacer" />
                <Tool label="Import sequence" onClick={() => fileRef.current?.click()}>
                  <Upload />
                </Tool>
                <Tool label="Export sequence" onClick={exportFile}>
                  <Download />
                </Tool>
                <Tool label="Studio help" onClick={() => setHelp(!help)}>
                  ?
                </Tool>
                <input
                  ref={fileRef}
                  hidden
                  type="file"
                  accept=".json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      if (file.size > 5_000_000) throw new Error("Maximum file size is 5 MB.");
                      const doc = parseSequence(await file.text());
                      edit(doc);
                      store.setState({ selected: [], time: 0 });
                      previousTime.current = -1;
                      executedActions.current.clear();
                      setMessage("Sequence imported. Check targets before enabling actions.");
                    } catch (error) {
                      setMessage(
                        `Import failed: ${error instanceof Error ? error.message : String(error)}`,
                      );
                    }
                  }}
                />
              </div>
              <div className="as-workspace">
                <div className="as-timeline-area">
                  <div className="as-tracks">
                    <div className="as-ruler-label">TRACKS</div>
                    {TRACKS.map((track) => (
                      <div className={`as-track-label as-${track}`} key={track}>
                        <Tool
                          label={`${sequence.muted.includes(track) ? "Unmute" : "Mute"} ${names[track]} track`}
                          active={sequence.muted.includes(track)}
                          onClick={() =>
                            edit({
                              ...sequence,
                              muted: sequence.muted.includes(track)
                                ? sequence.muted.filter((t) => t !== track)
                                : [...sequence.muted, track],
                            })
                          }
                        >
                          {sequence.muted.includes(track) ? <EyeOff /> : <Eye />}
                        </Tool>
                        <span>{names[track]}</span>
                        <Tool label={`Add ${names[track]} key`} onClick={() => addKey(track)}>
                          <Plus />
                        </Tool>
                      </div>
                    ))}
                  </div>
                  <div
                    className="as-timeline-scroll"
                    ref={timelineRef}
                    onWheel={(e) => {
                      if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        setPixels((p) =>
                          Math.max(8, Math.min(300, p * (e.deltaY > 0 ? 0.85 : 1.15))),
                        );
                      }
                    }}
                  >
                    <div className="as-timeline" style={{ width: sequence.duration * pixels + 24 }}>
                      <div
                        className="as-ruler"
                        onPointerDown={(e) => {
                          e.currentTarget.setPointerCapture(e.pointerId);
                          seek(timeFromPointer(e.clientX, e.currentTarget));
                        }}
                        onPointerMove={(e) => {
                          if (e.currentTarget.hasPointerCapture(e.pointerId))
                            seek(timeFromPointer(e.clientX, e.currentTarget));
                        }}
                        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
                      >
                        {Array.from(
                          {
                            length:
                              Math.floor(sequence.duration / Math.max(1, Math.ceil(60 / pixels))) +
                              1,
                          },
                          (_, i) => {
                            const t = i * Math.max(1, Math.ceil(60 / pixels));
                            return (
                              <span key={i} style={{ left: t * pixels }}>
                                {t}s
                              </span>
                            );
                          },
                        )}
                      </div>
                      {TRACKS.map((track) => (
                        <div
                          key={track}
                          className={`as-lane as-${track} ${sequence.muted.includes(track) ? "muted" : ""}`}
                          style={{ backgroundSize: `${pixels}px 100%` }}
                          onPointerDown={(e) => {
                            if (e.target === e.currentTarget) {
                              seek(timeFromPointer(e.clientX, e.currentTarget));
                              store.setState({ selected: [] });
                            }
                          }}
                        >
                          {track !== "action" &&
                            track !== "marker" &&
                            shown.keys
                              .filter((k) => k.track === track && k.enabled)
                              .sort((a, b) => a.time - b.time)
                              .map((item, index, keys) => {
                                const next = keys[index + 1];
                                return next && next.time > item.time ? (
                                  <div
                                    key={`segment-${item.id}`}
                                    className={`as-segment ${next.easing === "cut" ? "cut" : ""}`}
                                    style={{
                                      left: item.time * pixels,
                                      width: (next.time - item.time) * pixels,
                                    }}
                                  >
                                    <span>
                                      {(next.time - item.time) * pixels > 150
                                        ? easeNames[next.easing]
                                        : ""}
                                    </span>
                                  </div>
                                ) : null;
                              })}
                          {shown.keys
                            .filter((k) => k.track === track)
                            .map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className={`as-key ${selected.includes(item.id) ? "selected" : ""} ${!item.enabled ? "disabled" : ""}`}
                                style={{ left: item.time * pixels }}
                                title={`${item.label} · ${item.time.toFixed(2)}s · ${easeNames[item.easing]}`}
                                aria-label={`${item.label} at ${item.time.toFixed(2)} seconds`}
                                onPointerDown={(e) => moveSelection(e, item)}
                                onClick={(e) => {
                                  if (e.detail === 0) store.setState({ selected: [item.id] });
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  seek(item.time);
                                }}
                              >
                                <Diamond size={13} fill="currentColor" />
                                <span>{item.label}</span>
                              </button>
                            ))}
                        </div>
                      ))}
                      <div className="as-playhead" style={{ left: time * pixels }}>
                        <span />
                      </div>
                    </div>
                  </div>
                </div>
                <aside className="as-inspector" aria-label="Keyframe inspector">
                  <select
                    className="as-key-picker"
                    aria-label="Inspect keyframe"
                    value={key?.id ?? ""}
                    onChange={(e) => {
                      const item = sequence.keys.find((k) => k.id === e.target.value);
                      store.setState({ selected: item ? [item.id] : [] });
                      if (item) seek(item.time);
                    }}
                  >
                    <option value="">Shot workbench</option>
                    {[...sequence.keys]
                      .sort((a, b) => a.time - b.time)
                      .map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.time.toFixed(2)}s · {names[k.track]} · {k.label}
                        </option>
                      ))}
                  </select>
                  {key ? (
                    <>
                      <div className="as-inspector-title">
                        {names[key.track]}{" "}
                        <span>
                          {selected.length > 1
                            ? `${selected.length} selected · drag together`
                            : "KEYFRAME"}
                        </span>
                      </div>
                      <label className="as-field">
                        <span>Name</span>
                        <input
                          aria-label="Keyframe name"
                          value={key.label}
                          onChange={(e) => patchKey({ label: e.target.value })}
                        />
                      </label>
                      <NumberField
                        label="Time (s)"
                        value={key.time}
                        min={0}
                        max={sequence.duration}
                        step={1 / sequence.fps}
                        onChange={(n) =>
                          patchKey({
                            time: snap ? snapTime(n, sequence.fps, sequence.duration) : n,
                          })
                        }
                      />
                      <label className="as-check">
                        <input
                          type="checkbox"
                          checked={key.enabled}
                          onChange={(e) => patchKey({ enabled: e.target.checked })}
                        />
                        Enabled
                      </label>
                      {key.track !== "action" && key.track !== "marker" && (
                        <label className="as-field">
                          <span>Arrive with</span>
                          <select
                            aria-label="Keyframe easing"
                            value={key.easing}
                            onChange={(e) =>
                              patchKey({ easing: e.target.value as Keyframe["easing"] })
                            }
                          >
                            {EASINGS.map((e) => (
                              <option key={e} value={e}>
                                {easeNames[e]}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {key.track === "camera" && (
                        <>
                          <NumberField
                            label="Centre X"
                            value={key.value.cx}
                            onChange={(cx) => patchKey({ value: { ...key.value, cx } })}
                          />
                          <NumberField
                            label="Centre Y"
                            value={key.value.cy}
                            onChange={(cy) => patchKey({ value: { ...key.value, cy } })}
                          />
                          <NumberField
                            label="Zoom"
                            value={key.value.zoom}
                            min={BOARD_MIN_ZOOM}
                            max={boardMaxZoom()}
                            step={0.05}
                            onChange={(zoom) => patchKey({ value: { ...key.value, zoom } })}
                          />
                          <Tool
                            label="Replace with current view"
                            onClick={() => patchKey({ value: readCamera() })}
                          />
                          <Tool label="Go to this shot" onClick={() => seek(key.time)} />
                        </>
                      )}
                      {key.track === "tilt" && (
                        <TiltFields
                          value={key.value}
                          onChange={(value) => {
                            patchKey({ value });
                            setLiveTilt(value);
                            applyTilt(value);
                          }}
                        />
                      )}
                      {key.track === "cursor" && (
                        <>
                          <NumberField
                            label="Screen X (%)"
                            value={key.value.x * 100}
                            min={0}
                            max={100}
                            step={0.1}
                            onChange={(x) => patchKey({ value: { ...key.value, x: x / 100 } })}
                          />
                          <NumberField
                            label="Screen Y (%)"
                            value={key.value.y * 100}
                            min={0}
                            max={100}
                            step={0.1}
                            onChange={(y) => patchKey({ value: { ...key.value, y: y / 100 } })}
                          />
                          <label className="as-check">
                            <input
                              type="checkbox"
                              checked={key.value.visible}
                              onChange={(e) =>
                                patchKey({ value: { ...key.value, visible: e.target.checked } })
                              }
                            />
                            Show cursor
                          </label>
                          <Tool
                            label="Place another cursor key"
                            onClick={() => setPick("cursor")}
                          />
                        </>
                      )}
                      {key.track === "action" && (
                        <>
                          <label className="as-field">
                            <span>Action</span>
                            <select
                              aria-label="Action kind"
                              value={key.value.kind}
                              onChange={(e) =>
                                patchKey({
                                  value: {
                                    ...key.value,
                                    kind: e.target.value as Action["value"]["kind"],
                                  },
                                })
                              }
                            >
                              {ACTIONS.map((a) => (
                                <option key={a} value={a}>
                                  {actionNames[a]}
                                </option>
                              ))}
                            </select>
                          </label>
                          {!["undo", "redo"].includes(key.value.kind) && (
                            <>
                              <label className="as-field as-stacked">
                                <span>Target selector (empty = screen point)</span>
                                <input
                                  aria-label="Action target selector"
                                  value={key.value.selector}
                                  onChange={(e) =>
                                    patchKey({ value: { ...key.value, selector: e.target.value } })
                                  }
                                />
                              </label>
                              <Tool label="Pick target again" onClick={() => setPick("action")} />
                              <NumberField
                                label="Target X (%)"
                                value={key.value.x * 100}
                                min={0}
                                max={100}
                                onChange={(x) => patchKey({ value: { ...key.value, x: x / 100 } })}
                              />
                              <NumberField
                                label="Target Y (%)"
                                value={key.value.y * 100}
                                min={0}
                                max={100}
                                onChange={(y) => patchKey({ value: { ...key.value, y: y / 100 } })}
                              />
                            </>
                          )}
                          {key.value.kind === "scroll" && (
                            <>
                              {(["deltaX", "deltaY"] as const).map((field) => (
                                <NumberField
                                  key={field}
                                  label={field === "deltaX" ? "Scroll X (px)" : "Scroll Y (px)"}
                                  value={key.value[field]}
                                  step={50}
                                  min={-100000}
                                  max={100000}
                                  onChange={(n) =>
                                    patchKey({ value: { ...key.value, [field]: n } })
                                  }
                                />
                              ))}
                            </>
                          )}
                          {key.value.kind === "type" && (
                            <label className="as-field as-stacked">
                              <span>Replace field text</span>
                              <textarea
                                aria-label="Action text"
                                value={key.value.text}
                                onChange={(e) =>
                                  patchKey({ value: { ...key.value, text: e.target.value } })
                                }
                              />
                            </label>
                          )}
                          <p className="as-note">
                            Runs once when playback crosses this key. Scrubbing never executes
                            actions. Selectors follow controls; screen points use window
                            percentages.
                          </p>
                        </>
                      )}
                      {key.track === "marker" && (
                        <textarea
                          aria-label="Marker note"
                          placeholder="Shot notes, a hold, or a reminder…"
                          value={key.value.note}
                          onChange={(e) => patchKey({ value: { note: e.target.value } })}
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <div className="as-inspector-title">
                        Shot workbench <span>LIVE VIEW</span>
                      </div>
                      <p className="as-note">
                        Pan and zoom the board normally. Set a time, frame your shot, then press
                        Camera +. Add two keys for a move; choose Instant cut on the arriving key
                        for a jump.
                      </p>
                      <div className="as-presets">
                        {(["push", "pull", "pan", "tilt", "hold"] as const).map((kind) => (
                          <Tool
                            key={kind}
                            label={
                              {
                                push: "Push in · 3s",
                                pull: "Pull out · 3s",
                                pan: "Pan right · 3s",
                                tilt: "Tilt reveal · 3s",
                                hold: "Hold · 3s",
                              }[kind]
                            }
                            onClick={() => preset(kind)}
                          />
                        ))}
                      </div>
                      <TiltFields
                        value={liveTilt}
                        onChange={(tilt) => {
                          setLiveTilt(tilt);
                          applyTilt(tilt);
                        }}
                      />
                      <Tool
                        label="Save current shot"
                        onClick={() =>
                          edit({
                            ...sequence,
                            shots: [
                              ...sequence.shots,
                              {
                                id: uid(),
                                name: `Shot ${sequence.shots.length + 1}`,
                                camera: readCamera(),
                                tilt: currentTilt.current,
                              },
                            ],
                          })
                        }
                      />
                      {sequence.shots.map((shot) => (
                        <div className="as-shot" key={shot.id}>
                          <input
                            aria-label={`Rename ${shot.name}`}
                            value={shot.name}
                            onChange={(e) =>
                              edit({
                                ...sequence,
                                shots: sequence.shots.map((s) =>
                                  s.id === shot.id ? { ...s, name: e.target.value } : s,
                                ),
                              })
                            }
                          />
                          <Tool
                            label={`Preview ${shot.name}`}
                            onClick={() => {
                              applyCamera(shot.camera);
                              applyTilt(shot.tilt);
                              setLiveTilt(shot.tilt);
                            }}
                          >
                            <Eye />
                          </Tool>
                          <Tool
                            label={`Insert ${shot.name} at playhead`}
                            onClick={() => {
                              const base = {
                                time,
                                label: shot.name,
                                easing: "smooth" as const,
                                enabled: true,
                              };
                              edit({
                                ...sequence,
                                keys: [
                                  ...sequence.keys,
                                  { ...base, id: uid(), track: "camera", value: shot.camera },
                                  { ...base, id: uid(), track: "tilt", value: shot.tilt },
                                ],
                              });
                            }}
                          >
                            <Plus />
                          </Tool>
                          <Tool
                            label={`Delete ${shot.name}`}
                            onClick={() =>
                              edit({
                                ...sequence,
                                shots: sequence.shots.filter((s) => s.id !== shot.id),
                              })
                            }
                          >
                            <X />
                          </Tool>
                        </div>
                      ))}
                    </>
                  )}
                </aside>
              </div>
              <footer className="as-footer">
                <NumberField
                  label="Playhead"
                  value={time}
                  min={0}
                  max={sequence.duration}
                  step={1 / sequence.fps}
                  onChange={seek}
                />
                <NumberField
                  label="Length"
                  value={sequence.duration}
                  min={Math.max(1, ...sequence.keys.map((k) => k.time))}
                  max={3600}
                  onChange={(duration) => edit({ ...sequence, duration })}
                />
                <select
                  aria-label="Timeline frame rate"
                  value={sequence.fps}
                  onChange={(e) =>
                    edit({ ...sequence, fps: Number(e.target.value) as Sequence["fps"] })
                  }
                >
                  {[24, 30, 60].map((n) => (
                    <option key={n} value={n}>
                      {n} fps
                    </option>
                  ))}
                </select>
                <label className="as-zoom">
                  Timeline{" "}
                  <input
                    aria-label="Timeline zoom"
                    type="range"
                    min={8}
                    max={300}
                    value={pixels}
                    onChange={(e) => setPixels(Number(e.target.value))}
                  />
                </label>
                <Tool
                  label="Fit timeline"
                  onClick={() =>
                    setPixels(
                      Math.max(8, (timelineRef.current?.clientWidth ?? 600) / sequence.duration),
                    )
                  }
                />
                <div className="as-spacer" />
                <Tool label="Save start state" onClick={captureStart} disabled={playing} />
                <Tool label="Restore start" onClick={restoreBoard} />
              </footer>
              <div className="as-status" role="status">
                {message}
              </div>
              {help && (
                <div className="as-help">
                  <button onClick={() => setHelp(false)} aria-label="Close studio help">
                    <X size={16} />
                  </button>
                  <strong>Build a sequence</strong>
                  <p>1. Save start state. Frame the board and add Camera + and Tilt + at 0s.</p>
                  <p>
                    2. Click the ruler to choose a later time, move the board, then add the next
                    shot. Drag diamonds to retime them. Shift-click selects several; one drag moves
                    them together.
                  </p>
                  <p>
                    3. Place cursor points and pick action targets. Edit actions to click, scroll,
                    type, undo, or redo. Camera easing is set on the arriving key. Two identical
                    keys create a hold.
                  </p>
                  <p>
                    4. Play to rehearse. Enable Execute actions for real app gestures. Restore start
                    resets the board; it does not reset app settings or reopen every popup.
                    Browser-protected file dialogs and navigation are unsupported.
                  </p>
                  <p>
                    Space: play/pause · arrows: one frame · Shift+arrows: one second · Home/End:
                    ends · Ctrl+Z/Shift+Z: timeline undo/redo · Ctrl+C/V/D: copy/paste/duplicate ·
                    Delete: remove. Shortcuts belong to the focused studio; typing keeps normal text
                    shortcuts.
                  </p>
                  <p>
                    Sequences save per design on this device. Export/import backs up the timeline
                    and saved shots, not the factory plan. Clean preview hides this editor and board
                    controls; Escape returns.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </>,
    document.body,
  );
}

function TiltFields({ value, onChange }: { value: Tilt; onChange: (tilt: Tilt) => void }) {
  return (
    <div className="as-tilt-fields">
      {(
        [
          ["pitch", "Pitch (°)", -45, 45, 0.5],
          ["yaw", "Yaw (°)", -45, 45, 0.5],
          ["roll", "Roll (°)", -180, 180, 1],
          ["scale", "Screen scale", 0.25, 3, 0.05],
          ["perspective", "Perspective", 400, 4000, 100],
        ] as const
      ).map(([field, label, min, max, step]) => (
        <NumberField
          key={field}
          label={label}
          value={value[field]}
          min={min}
          max={max}
          step={step}
          onChange={(n) => onChange({ ...value, [field]: n })}
        />
      ))}
      <Tool label="Reset tilt" onClick={() => onChange(FLAT_TILT)} />
    </div>
  );
}
