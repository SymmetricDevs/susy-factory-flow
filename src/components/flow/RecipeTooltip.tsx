import type { ReactNode } from "react";
import type { RecipeTooltipView, TooltipAction } from "./recipe-tooltip-data";

/** Read-only gesture legend; actions remain on the hovered control. */
export function TooltipActions({ actions }: { actions: readonly TooltipAction[] }) {
  if (!actions.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-2 text-xs leading-4 text-fg-subtle" data-tooltip-actions="">
      {actions.map(action => (
        <span key={`${action.gesture}-${action.label}`} className="flex items-center gap-1.5">
          <span role="img" aria-label={action.gesture === "left" ? "Left click" : action.gesture === "right" ? "Right click" : action.gesture === "wheel" ? "Mouse wheel" : "Left drag"}>
            <svg aria-hidden="true" width="16" height="18" viewBox="0 0 18 24" fill="none" className="shrink-0 text-fg-muted">
              <rect x="3" y="1" width="12" height="17" rx="5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M9 1v8M3 9h12" stroke="currentColor" strokeWidth="1.2" />
              {action.gesture !== "wheel" && <path d={action.gesture === "right" ? "M10 3c2 0 3 1 3 4h-3Z" : "M8 3C6 3 5 4 5 7h3Z"} fill="currentColor" />}
              {action.gesture === "wheel" && <path d="M9 3v4" stroke="currentColor" strokeWidth="2.5" />}
              {action.gesture === "drag" && <path d="M3 21h12m-3-2 3 2-3 2" stroke="currentColor" strokeWidth="1.2" />}
            </svg>
          </span>
          <span>{action.label}</span>
          {action.key && <kbd className="border border-line-strong bg-surface-sunken px-1 text-[11px] leading-4">{action.key}</kbd>}
        </span>
      ))}
    </div>
  );
}

export function RecipeTooltip({ view, children }: { view: RecipeTooltipView; children?: ReactNode }) {
  const modeColor = view.mode === "pool" ? "text-[#6f9cff]" : view.mode === "solve" ? "text-[#c78bff]" : "text-[#f5b642]";
  return (
    <div className="w-[340px] max-w-[calc(100vw-44px)] text-sm leading-5 text-fg-subtle">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 break-words text-base font-semibold leading-6 text-fg">{view.title}</div>
        {view.mode && <span className={`shrink-0 text-xs capitalize ${modeColor}`}>{view.mode}</span>}
      </div>
      {(view.subtitle || view.status) && <div className="mt-0.5 flex flex-wrap justify-between gap-2 text-xs text-fg-muted">
        <span>{view.subtitle}</span>
        {view.status && <span className={view.status.tone === "warning" ? "text-amber-300" : view.status.tone === "good" ? "text-green-300" : "text-fg-muted"}>{view.status.label}</span>}
      </div>}
      {view.rows.length > 0 && <dl className="mt-3 space-y-1">
        {view.rows.map(row => <div key={row.label} className="flex items-baseline justify-between gap-4">
          <dt className="min-w-0 text-fg-muted">{row.label}</dt>
          <dd className="text-right font-medium tabular-nums text-fg">{row.value}</dd>
        </div>)}
      </dl>}
      {view.reason && <p className="mt-2">{view.reason}</p>}
      {view.requirement && <p className="mt-2 text-fg">{view.requirement}</p>}
      {children}
      {view.actions && <TooltipActions actions={view.actions} />}
    </div>
  );
}
