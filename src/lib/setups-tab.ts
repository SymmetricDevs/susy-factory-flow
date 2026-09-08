/**
 * Events around the Setups list. The list itself lives in the library now
 * (the square at the head of the tab strip), so the old "open the sidebar on
 * Setups" bridge is gone; opening the list is `openLibrary({ kind: "public" })`.
 */

/**
 * Fired when a share lands on the network, wherever it was posted from (the
 * shelf's own button or the top bar). A mounted Setups panel refetches so the
 * new post is already on the shelf when the dialog closes.
 */
export const SETUPS_CHANGED_EVENT = "gtnh:setups-changed";

export function notifySetupsChanged(): void {
  window.dispatchEvent(new Event(SETUPS_CHANGED_EVENT));
}

/**
 * Asks the header to open the share dialog for the board that is up. The
 * shelf's "Update post" uses it: the design is put on the canvas first, then
 * the same dialog the Share button opens takes it from there.
 */
export const OPEN_SHARE_DIALOG_EVENT = "gtnh:open-share-dialog";

export function requestShareDialog(): void {
  window.dispatchEvent(new Event(OPEN_SHARE_DIALOG_EVENT));
}

/** NETWORK is everyone's public posts; MINE is the account's own. */
export type SetupsScope = "network" | "mine";
