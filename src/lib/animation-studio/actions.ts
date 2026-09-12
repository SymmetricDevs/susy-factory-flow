import type { Action } from "./model";

/** Prefer a semantic anchor; use an exact DOM path when the app offers none. */
export function selectorFor(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body) {
    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    const anchor = current.getAttribute("data-help-anchor");
    if (anchor) {
      parts.unshift(`[data-help-anchor="${CSS.escape(anchor)}"]`);
      break;
    }
    const parent: Element | null = current.parentElement;
    const index = parent ? Array.from(parent.children).indexOf(current) + 1 : 1;
    parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
    current = parent;
  }
  return parts.join(" > ");
}

export function actionTarget(action: Action): Element {
  const { selector, x, y } = action.value;
  const target = selector
    ? document.querySelector(selector)
    : document.elementFromPoint(x * innerWidth, y * innerHeight);
  if (!target || target.closest("[data-animation-studio]"))
    throw new Error(`Target unavailable: ${action.label}. Pick the target again.`);
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) throw new Error(`Target is hidden: ${action.label}.`);
  return target;
}

/** App gestures, not OS automation. Browser-protected dialogs cannot be scripted. */
export function executeDomAction(action: Action): void {
  const target = actionTarget(action);
  const value = action.value;
  if (value.kind === "scroll") {
    let scroller: Element | null = target;
    while (scroller && scroller !== document.body) {
      const style = getComputedStyle(scroller);
      if (
        /(auto|scroll)/.test(style.overflow + style.overflowY + style.overflowX) &&
        (scroller.scrollHeight > scroller.clientHeight ||
          scroller.scrollWidth > scroller.clientWidth)
      )
        break;
      scroller = scroller.parentElement;
    }
    if (!scroller || scroller === document.body)
      throw new Error("Pick a scrollable list. Use camera keyframes to pan or zoom the board.");
    scroller.scrollBy({ left: value.deltaX, top: value.deltaY, behavior: "instant" });
    return;
  }
  if (value.kind === "type") {
    if (
      !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) ||
      target.disabled ||
      target.readOnly
    )
      throw new Error("The typing target must be an editable text field.");
    target.focus({ preventScroll: true });
    const prototype =
      target instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(target, value.text);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (target.closest("a[href]")) throw new Error("Navigation links cannot play inside a sequence.");
  const rect = target.getBoundingClientRect();
  const init = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: value.selector ? rect.left + rect.width / 2 : value.x * innerWidth,
    clientY: value.selector ? rect.top + rect.height / 2 : value.y * innerHeight,
    button: value.kind === "right-click" ? 2 : 0,
  };
  const click = (detail: number) => {
    target.dispatchEvent(
      new PointerEvent("pointerdown", {
        ...init,
        pointerId: 1,
        pointerType: "mouse",
        buttons: init.button === 2 ? 2 : 1,
      }),
    );
    target.dispatchEvent(new MouseEvent("mousedown", init));
    target.dispatchEvent(
      new PointerEvent("pointerup", { ...init, pointerId: 1, pointerType: "mouse" }),
    );
    target.dispatchEvent(new MouseEvent("mouseup", init));
    target.dispatchEvent(
      new MouseEvent(init.button === 2 ? "contextmenu" : "click", { ...init, detail }),
    );
  };
  click(1);
  if (value.kind === "double-click") {
    click(2);
    target.dispatchEvent(new MouseEvent("dblclick", { ...init, detail: 2 }));
  }
}
