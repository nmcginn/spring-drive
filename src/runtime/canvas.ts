// HiDPI canvas setup. A widget gets a canvas whose backing store matches the
// device's pixels and a context already scaled so it draws in CSS pixels.

/**
 * Past 2× the extra pixels are invisible at reading distance but still cost
 * fill rate every frame, and the frame budget is 4 ms for every widget
 * together (CLAUDE.md, priority 2).
 */
export const MAX_DEVICE_PIXEL_RATIO = 2;

export interface CanvasSize {
  /** CSS pixels. */
  cssWidth: number;
  cssHeight: number;
  /** Backing-store pixels. */
  pixelWidth: number;
  pixelHeight: number;
  /** Backing-store pixels per CSS pixel actually used. */
  scale: number;
}

/**
 * The canvas size for a container `cssWidth` wide. `heightForWidth` lets a
 * widget be taller relative to its width on a phone than on a desktop.
 */
export function canvasSize(
  cssWidth: number,
  heightForWidth: (cssWidth: number) => number,
  devicePixelRatio: number,
  maxRatio: number = MAX_DEVICE_PIXEL_RATIO,
): CanvasSize {
  const width = Math.max(0, Math.floor(cssWidth));
  const height = Math.max(0, Math.floor(heightForWidth(width)));
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const scale = Math.min(ratio, maxRatio);
  return {
    cssWidth: width,
    cssHeight: height,
    pixelWidth: Math.round(width * scale),
    pixelHeight: Math.round(height * scale),
    scale,
  };
}

export interface HiDpiCanvas {
  canvas: HTMLCanvasElement;
  /** Null where canvas is unavailable (some test DOMs). Widgets skip drawing then. */
  context: CanvasRenderingContext2D | null;
  size(): CanvasSize;
  destroy(): void;
}

/**
 * Append a canvas to `parent` that fills the parent's content box. The canvas
 * is sized before this returns. `onResize` runs on every later resize (never
 * during this call, when the caller does not yet hold the result), so a
 * widget that is not ticking can redraw its static frame at the new size.
 */
export function createHiDpiCanvas(
  parent: HTMLElement,
  heightForWidth: (cssWidth: number) => number,
  onResize: (size: CanvasSize) => void,
): HiDpiCanvas {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  parent.append(canvas);
  const context = canvas.getContext('2d');
  // A size no real layout produces, so the first apply always sizes the canvas.
  let size: CanvasSize = { cssWidth: -1, cssHeight: -1, pixelWidth: -1, pixelHeight: -1, scale: 0 };

  // Width is measured on the canvas itself, not the parent: the parent's
  // clientWidth includes its padding, and a backing store sized from it is
  // squashed horizontally when the browser fits it into the content box.
  function apply(cssWidth: number, notify: boolean): void {
    const next = canvasSize(cssWidth, heightForWidth, window.devicePixelRatio);
    const changed =
      next.pixelWidth !== size.pixelWidth || next.pixelHeight !== size.pixelHeight || next.cssHeight !== size.cssHeight;
    size = next;
    if (!changed) return;
    canvas.style.height = `${size.cssHeight}px`;
    // Assigning width or height clears the canvas, even to the same value,
    // hence the check above.
    canvas.width = size.pixelWidth;
    canvas.height = size.pixelHeight;
    context?.setTransform(size.scale, 0, 0, size.scale, 0, 0);
    if (notify) onResize(size);
  }

  const observer =
    typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver((records) => {
          const width = records[0]?.contentRect.width;
          if (width !== undefined) apply(width, true);
        });
  observer?.observe(canvas);
  apply(canvas.getBoundingClientRect().width, false);

  return {
    canvas,
    context,
    size: () => size,
    destroy() {
      observer?.disconnect();
      canvas.remove();
    },
  };
}
