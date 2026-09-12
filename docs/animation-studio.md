# Animation studio

Shift-click the header's version chip, then choose **Open animation studio**. The editor is only available through the dev menu. Closing it restores the original camera and tilt. It does not capture video.

## Make a sequence

1. Open the factory you want to show. **Save start state** keeps its board and camera in memory for rehearsal.
2. At 0 seconds, pan and zoom the board into position and press **Camera +**. Set the live tilt in **Shot workbench**, then press **Tilt +**.
3. Click or drag the ruler to another time. Frame the next view and add another camera key. The incoming key controls its transition: Smooth, Linear, Ease in, Ease out, or Instant cut. Identical consecutive keys hold a view.
4. Choose **Cursor +**, then click anywhere on the app to place a cursor point. Two points animate a cursor path. Coordinates are percentages of the window, so a sequence can adapt to a different window size.
5. Choose **Action +**, then click an app control. Picking does not activate the control. The inspector changes its action to click, double click, right click, scroll a list, replace field text, board undo, or board redo. The + beside the Actions track adds a key without picking a target, useful for board undo and redo.
6. Press **Play**. Visual tracks always preview; **Execute actions** explicitly enables real app gestures. Scrubbing never clicks, types, scrolls, or changes board history.

The board remains editable while the studio is open. Interacting with the app during playback pauses the sequence. Switching browser tabs pauses too, so a background tab does not suddenly run a backlog of actions.

## Timeline editing

- Drag a diamond to retime it. Shift-click selects or deselects more keys; dragging the selection preserves their spacing. A drag is one undo step, and Escape cancels a drag.
- Snap aligns to the selected 24, 30, or 60 fps grid and attracts keys to nearby keys and the playhead. Disabling it allows finer timing.
- Double-click a key to preview its time. **Inspect keyframe** lists every key, including keys too close together to click at the current timeline zoom.
- The inspector edits names, timing, easing, values, and whether a key is enabled. Each track can also be muted independently.
- Change Length to extend the sequence. It cannot trim past existing keys; move or remove those first. Sequences can be up to one hour.
- The timeline zoom slider and Fit timeline control its scale. Drag the top edge to resize the editor, or collapse it to the transport bar.
- Shot workbench has editable three-second presets for push in, pull out, pan, tilt, and hold. Saved shots retain both camera and tilt; preview or insert them at the playhead.

With focus in the editor, Space plays/pauses, Left/Right steps one frame, Shift+Left/Right steps one second, and Home/End jumps to the ends. Ctrl/Cmd+Z undoes timeline edits; Ctrl/Cmd+Shift+Z or Ctrl+Y redoes them. Ctrl/Cmd+C/V copies/pastes selected keys at the playhead; Ctrl/Cmd+D duplicates; Ctrl/Cmd+A selects all; Delete removes the selection. Text fields retain their normal typing shortcuts. Board undo/redo is a separate action on the Actions track.

## Rehearsal and clean preview

**Stop and restore view** returns to the session's initial camera. **Restore start** also restores the board and its original undo/redo history, closes recipe search, and resets remembered scroll positions. Use **Save start state** again if the starting board changes. This is a board checkpoint, not a snapshot of all app settings, popup state, or network activity. Actions use normal app behavior and can autosave board edits; Restore start explicitly puts the saved board back.

Visual playback can loop. Execution of app actions disables looping because repeated clicks can toggle controls or change the board again. An unavailable target pauses at the failing action with an explanation; fix its selector or open the required UI, then resume to retry. Successful actions at that same timestamp are not replayed. Rewinding starts another rehearsal.

**Clean preview** hides the studio and board toolbars. Escape brings the editor back. The native system cursor cannot be moved or hidden outside the page; the animation cursor is an overlay. Move your real mouse aside when capturing externally.

## Saving and targets

The timeline and shot library save automatically per design on this browser. Opening a different design loads its own sequence, including duplicated designs whose factory plans share an internal project ID. Import/export uses validated `.animation.json` files and includes the timeline and shots, not the factory plan. Save/share the factory separately. Import is an undoable timeline edit and never enables action execution.

Picked targets prefer element IDs and app help anchors, falling back to a DOM path. Paths can become stale after UI changes; pick the target again when necessary. An empty selector targets the saved screen point. Scroll actions scroll a list in pixels; board pan and zoom belong on the Camera track. Typing replaces the entire input value. These are app events, not operating-system automation: navigation links, native file dialogs, and browser-protected interactions are unsupported.

## Implementation and verification

- `src/lib/animation-studio/model.ts`: validated document format, interpolation, action crossing, and group timing.
- `src/lib/animation-studio/store.ts`: session state and separate timeline history (100 transactions).
- `src/lib/animation-studio/actions.ts`: target selection and app gesture execution.
- `src/components/animation-studio/AnimationStudio.tsx`: dev-only editor, playback, persistence, and checkpoint integration. Mounted within the board's React Flow provider; its UI portals outside the scaled shell.
- Camera values are world-space centre plus zoom. Playback uses the normal `setViewport` path, preserving the scroll camera. Tilt is a temporary transform directly on the board surface and does not overwrite the dev menu's saved tilt settings.
- `npm run typecheck`, `npm test`, and `npm run test:animation:browsers` exercise the model, history, and Chrome/Firefox interactions. `npm run test:animation:app` checks integration against a running local app (`ANIMATION_APP_URL`, default `http://localhost:3000`). Browser checks use fresh isolated contexts and write screenshots to `.animation-studio-results.local/`.
