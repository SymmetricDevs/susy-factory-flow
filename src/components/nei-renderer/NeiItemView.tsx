"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import type { ResourceAmount } from "@/lib/model/types";
import type { NeiPositionedSlot } from "@/lib/nei/layout";
import type { NeiItemCommand } from "@/lib/nei-renderer/core/commands";
import { ResourceIcon } from "@/components/nei/ResourceIcon";
import { useAlternativeCycleScope } from "@/components/nei/AlternativeCycleScope";
import {
  applyAlternativeCycleFace,
  getAlternativeCycleFaces,
  getAlternativeCycleTick,
  getServerAlternativeCycleTick,
  subscribeToAlternativeCycle,
  type AlternativeCycleFace,
} from "@/lib/nei/alternative-cycle";
import { renderStackResourceToResourceAmount, stackToLegacySlot } from "./NeiRecipeSurface";

interface StackViewProps {
  command: NeiItemCommand;
  scale: number;
  iconPixelSize?: number;
  renderHandle?: (slot: NeiPositionedSlot) => ReactNode;
  getSlotConnectionAttributes?: (slot: NeiPositionedSlot) => Record<string, string> | undefined;
  onSlotClick?: (slot: NeiPositionedSlot, mode: "recipes" | "uses") => void;
  suppressSlotHover?: (slot: NeiPositionedSlot) => boolean;
  suppressConsumedState?: (slot: NeiPositionedSlot) => boolean;
  getSlotZIndex?: (slot: NeiPositionedSlot) => number | undefined;
  slotTooltip?: boolean;
}

export function NeiItemView(props: StackViewProps) {
  return <StackIconButton {...props} />;
}

export function StackIconButton(props: StackViewProps) {
  const slot = stackToLegacySlot(props.command);
  const resource: ResourceAmount & { chance?: number; consumed?: boolean } = {
    ...renderStackResourceToResourceAmount(props.command.stack.resource),
    chance: props.command.stack.chance,
    consumed: props.command.stack.consumed,
  };

  const scope = useAlternativeCycleScope();
  // Only inputs cycle. An output is what the recipe actually produces, so
  // rotating it would be a lie rather than a choice.
  const faces = scope && slot?.side === "input" ? getAlternativeCycleFaces(resource) : [];

  if (scope && slot && faces.length > 1) {
    return (
      <CyclingStackIcon
        {...props}
        slot={slot}
        resource={resource}
        faces={faces}
        resourceIndex={slot.resourceIndex}
      />
    );
  }

  // A stand-in with exactly one member has nothing to rotate through, but it
  // still has no art of its own, so it borrows that member's.
  if (faces.length === 1) {
    return (
      <SlotButton
        {...props}
        slot={slot}
        resource={applyAlternativeCycleFace(resource, faces[0])}
      />
    );
  }

  return <SlotButton {...props} slot={slot} resource={resource} />;
}

/**
 * A slot whose oredict input rotates through the items it accepts, the way NEI
 * does in game.
 *
 * Hovering holds the current face so it can be read without moving; scrolling
 * with shift steps through the faces and locks the slot to the one chosen.
 * Only slots that actually have alternatives mount this component, so the clock
 * subscription costs nothing on the ordinary case.
 */
function CyclingStackIcon({
  slot,
  resource,
  faces,
  resourceIndex,
  ...props
}: StackViewProps & {
  slot: NeiPositionedSlot;
  resource: ResourceAmount & { chance?: number; consumed?: boolean };
  faces: AlternativeCycleFace[];
  resourceIndex: number;
}) {
  const scope = useAlternativeCycleScope();
  const tick = useSyncExternalStore(
    subscribeToAlternativeCycle,
    getAlternativeCycleTick,
    getServerAlternativeCycleTick,
  );
  const [heldIndex, setHeldIndex] = useState<number>();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const lockedIndex = scope?.locked[resourceIndex];
  const faceIndex = (lockedIndex ?? heldIndex ?? tick) % faces.length;
  const face = faces[faceIndex];
  const displayResource = applyAlternativeCycleFace(resource, face);

  // Read by the wheel listener, which is attached once and must not close over
  // a stale index. Written in an effect rather than during render; effects have
  // flushed long before anyone can spin a wheel over the slot.
  const faceIndexRef = useRef(faceIndex);
  useEffect(() => {
    faceIndexRef.current = faceIndex;
  }, [faceIndex]);

  const { report } = scope ?? {};
  useEffect(() => {
    report?.(resourceIndex, face);
    return () => report?.(resourceIndex, undefined);
  }, [face, report, resourceIndex]);

  const lock = scope?.lock;
  useEffect(() => {
    const element = buttonRef.current;
    if (!element || !lock) {
      return;
    }

    // Attached natively rather than through `onWheel` because React registers
    // wheel handlers passively, where `preventDefault` is ignored, and without
    // it the slot would step AND the list would scroll out from under it.
    //
    // Plain scroll, not shift+scroll. Pointing at a slot that is visibly
    // rotating and turning the wheel has one obvious meaning, and only slots
    // with something to rotate through mount this at all, so the rest of the
    // list scrolls normally.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
      const step = delta > 0 ? 1 : -1;
      lock(resourceIndex, (faceIndexRef.current + step + faces.length) % faces.length);
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [faces.length, lock, resourceIndex]);

  return (
    <SlotButton
      {...props}
      slot={slot}
      resource={displayResource}
      buttonRef={buttonRef}
      alternativeState={lockedIndex === undefined ? "cycling" : "locked"}
      onMouseEnter={() => setHeldIndex(faceIndex)}
      onMouseLeave={() => setHeldIndex(undefined)}
    />
  );
}

function SlotButton({
  command,
  scale,
  iconPixelSize,
  renderHandle,
  getSlotConnectionAttributes,
  onSlotClick,
  suppressSlotHover,
  suppressConsumedState,
  getSlotZIndex,
  slotTooltip = true,
  slot,
  resource,
  buttonRef,
  alternativeState,
  onMouseEnter,
  onMouseLeave,
}: StackViewProps & {
  slot: NeiPositionedSlot | undefined;
  resource: ResourceAmount & { chance?: number; consumed?: boolean };
  buttonRef?: RefObject<HTMLButtonElement | null>;
  alternativeState?: "cycling" | "locked";
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const shouldSuppressSlotHover = slot ? suppressSlotHover?.(slot) : false;
  const shouldSuppressConsumedState = slot ? suppressConsumedState?.(slot) : false;

  return (
    <button
      ref={buttonRef}
      type="button"
      tabIndex={slot ? 0 : -1}
      {...(slot ? getSlotConnectionAttributes?.(slot) : undefined)}
      // The wheel steps this slot instead of scrolling or zooming anything;
      // the board camera honours the mark (board-camera-controls.ts).
      {...(alternativeState ? { "data-wheel-steps": "" } : undefined)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(event) => {
        if (!slot || !onSlotClick) return;
        event.stopPropagation();
        onSlotClick(slot, "recipes");
      }}
      onContextMenu={(event) => {
        if (!slot || !onSlotClick) return;
        event.preventDefault();
        event.stopPropagation();
        onSlotClick(slot, "uses");
      }}
      className={[
        "nodrag absolute border-0 bg-transparent p-0 text-left",
        slot && onSlotClick && !shouldSuppressSlotHover
          ? "cursor-pointer hover:ring-2 hover:ring-cyan-300"
          : "",
      ].join(" ")}
      style={{
        left: command.x * scale,
        top: command.y * scale,
        width: command.width * scale,
        height: command.height * scale,
        pointerEvents: "auto",
        zIndex: slot ? getSlotZIndex?.(slot) : undefined,
      }}
    >
      {slot ? renderHandle?.(slot) : null}
      <ResourceIcon
        resource={resource}
        size="md"
        showAmount
        showName={false}
        className="!h-full !w-full"
        iconPixelSize={iconPixelSize ?? command.width * scale}
        tooltip={slotTooltip}
        showConsumedState={!shouldSuppressConsumedState}
        alternativeState={alternativeState}
        bare
      />
    </button>
  );
}
