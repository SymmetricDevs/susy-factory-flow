"use client";

/**
 * Stitching a board capture and its summary bar into one finished image.
 *
 * The board arrives photographed at its own size; the bar is photographed at
 * a fixed design width (720 to 1600 CSS px, see ExportFooter) and SCALED to
 * the board's width here, so it keeps a constant fraction of the image and
 * stays readable however wide the factory is.
 */

export interface CompositeLayout {
  /** Board capture, CSS px. */
  boardWidth: number;
  boardHeight: number;
  /** The bar's design size, CSS px; zero when there is no bar. */
  footerWidth: number;
  footerHeight: number;
  /** Factor that brings the bar to the board's width. */
  footerScale: number;
  /** Board plus scaled bar, CSS px. */
  totalHeight: number;
}

/** A frame around the finished image. Width is in board-CSS px. */
export interface ExportBorder {
  color: string;
  width: number;
}

/**
 * Frame thickness that reads the same at any factory size: roughly the
 * scaled weight of the summary bar's rules, clamped at both ends.
 */
export function resolveExportBorderWidth(boardWidth: number): number {
  if (!Number.isFinite(boardWidth) || boardWidth <= 0) {
    return 4;
  }
  return Math.min(32, Math.max(4, Math.round(boardWidth / 240)));
}

export function computeCompositeLayout(
  boardWidth: number,
  boardHeight: number,
  footerWidth: number,
  footerHeight: number,
): CompositeLayout {
  const hasFooter = footerWidth > 0 && footerHeight > 0;
  const footerScale = hasFooter ? boardWidth / footerWidth : 0;
  return {
    boardWidth,
    boardHeight,
    footerWidth: hasFooter ? footerWidth : 0,
    footerHeight: hasFooter ? footerHeight : 0,
    footerScale,
    totalHeight: boardHeight + (hasFooter ? footerHeight * footerScale : 0),
  };
}

/**
 * Draws board over bar on one canvas at the board's pixel density and
 * returns it as a PNG. `background` fills the seam and any rounding slack;
 * absent, the composite stays transparent where the layers are.
 */
export async function compositeExportPng(options: {
  boardBlob: Blob;
  footerBlob?: Blob;
  layout: CompositeLayout;
  pixelRatio: number;
  background?: string;
  border?: ExportBorder;
}): Promise<Blob> {
  const { boardBlob, footerBlob, layout, pixelRatio, background, border } = options;
  if (!footerBlob && !border) {
    return boardBlob;
  }

  const [board, footer] = await Promise.all([
    createImageBitmap(boardBlob),
    footerBlob ? createImageBitmap(footerBlob) : Promise.resolve(undefined),
  ]);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(layout.boardWidth * pixelRatio);
    canvas.height = Math.round(layout.totalHeight * pixelRatio);
    const context = canvas.getContext("2d");
    if (!context) {
      return boardBlob;
    }

    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(board, 0, 0);
    if (footer) {
      const footerTop = Math.round(layout.boardHeight * pixelRatio);
      context.drawImage(footer, 0, footerTop, canvas.width, canvas.height - footerTop);
    }
    if (border) {
      drawBorder(context, canvas.width, canvas.height, border, pixelRatio);
    }

    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => resolve(blob ?? boardBlob), "image/png");
    });
  } finally {
    board.close();
    footer?.close();
  }
}

/** An inset stroke: half the width would otherwise fall outside the canvas. */
export function drawBorder(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  border: ExportBorder,
  scale: number,
) {
  const strokeWidth = Math.max(1, border.width * scale);
  context.strokeStyle = border.color;
  context.lineWidth = strokeWidth;
  context.strokeRect(strokeWidth / 2, strokeWidth / 2, width - strokeWidth, height - strokeWidth);
}

/**
 * The SVG counterpart: both captures are full <svg> documents (html-to-image
 * renders DOM through a foreignObject), and SVG happily nests them. The board
 * rides at its natural size; the bar is wrapped in an <svg> whose viewBox is
 * the bar's design size and whose width is the board's, which is the same
 * scale-to-fit the PNG path does on canvas.
 */
export function composeExportSvg(options: {
  boardSvg: string;
  footerSvg?: string;
  layout: CompositeLayout;
  background?: string;
  border?: ExportBorder;
}): string {
  const { boardSvg, footerSvg, layout, background, border } = options;
  const board = stripXmlProlog(boardSvg);
  if (!footerSvg && !border) {
    return board;
  }

  const width = layout.boardWidth;
  const height = layout.totalHeight;
  const footerScaledHeight = layout.footerHeight * layout.footerScale;
  const backgroundRect = background
    ? `<rect width="100%" height="100%" fill="${background}"/>`
    : "";
  const footerSvgElement = footerSvg
    ? `<svg x="0" y="${layout.boardHeight}" width="${width}" height="${footerScaledHeight}" ` +
      `viewBox="0 0 ${layout.footerWidth} ${layout.footerHeight}">` +
      stripXmlProlog(footerSvg) +
      `</svg>`
    : "";
  const borderRect = border
    ? `<rect x="${border.width / 2}" y="${border.width / 2}" ` +
      `width="${width - border.width}" height="${height - border.width}" ` +
      `fill="none" stroke="${border.color}" stroke-width="${border.width}"/>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    backgroundRect +
    board +
    footerSvgElement +
    borderRect +
    `</svg>`
  );
}

function stripXmlProlog(svgText: string): string {
  return svgText.replace(/^\s*<\?xml[^>]*\?>\s*/i, "");
}
