/**
 * Landing the left column on one of its three tabs from anywhere else in the
 * app.
 *
 * Same bargain as `setups-tab.ts`, generalised: the panel may not be mounted
 * when the request is made (on a phone it is a closed drawer), so the wanted
 * tab waits in module state until either the mounted panel's listener or the
 * next mount collects it.
 *
 * `openSetupsTab` stays where it is. It carries a shelf SCOPE as well as a tab,
 * and the Setups panel listens for that separately.
 */
export const OPEN_SIDEBAR_TAB_EVENT = "gtnh:open-sidebar-tab";

/** Only Items is left in the column; Boards and Setups moved to the library. */
export type SidebarTab = "items";

let pendingTab: SidebarTab | undefined;
let pendingFocusSearch = false;

/**
 * `focusSearch` also puts the cursor in the Items tab's search box. The
 * Welcome page's "Find a recipe" asks for that: with the column already
 * open on Items, opening it again is invisible, and a blinking cursor in the
 * search field is the answer the click deserves.
 */
export function openSidebarTab(tab: SidebarTab, options: { focusSearch?: boolean } = {}): void {
  pendingTab = tab;
  pendingFocusSearch = Boolean(options.focusSearch) && tab === "items";
  window.dispatchEvent(new Event(OPEN_SIDEBAR_TAB_EVENT));
}

/** One-shot read of the tab the last request asked for, if any. */
export function takePendingSidebarTab(): SidebarTab | undefined {
  const tab = pendingTab;
  pendingTab = undefined;
  return tab;
}

/** One-shot read of whether that request wanted the search box focused. */
export function takePendingSearchFocus(): boolean {
  const focus = pendingFocusSearch;
  pendingFocusSearch = false;
  return focus;
}
