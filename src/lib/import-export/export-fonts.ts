"use client";

import { getFontEmbedCSS } from "html-to-image";

/**
 * The @font-face CSS an image export needs, with the font files inlined as
 * data URLs; without it the cloned board renders in a generic fallback font.
 *
 * html-to-image's font scan walks every stylesheet, so this is computed once
 * per session and shared by every capture; callers pass it as `fontEmbedCSS`
 * together with `skipFonts` (the embed CSS takes precedence). A failed scan
 * fails quietly: the export renders in the fallback font.
 */
let fontCssPromise: Promise<string | undefined> | undefined;

export function resolveExportFontCss(element: HTMLElement): Promise<string | undefined> {
  fontCssPromise ??= getFontEmbedCSS(element).catch(() => undefined);
  return fontCssPromise;
}
