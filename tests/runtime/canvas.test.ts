import { describe, expect, it } from 'vitest';
import { MAX_DEVICE_PIXEL_RATIO, canvasSize } from '../../src/runtime/canvas.ts';

const half = (w: number) => w / 2;

describe('canvasSize', () => {
  it('matches the backing store to device pixels', () => {
    expect(canvasSize(300, half, 2)).toEqual({
      cssWidth: 300,
      cssHeight: 150,
      pixelWidth: 600,
      pixelHeight: 300,
      scale: 2,
    });
  });

  it(`caps the pixel ratio at ${MAX_DEVICE_PIXEL_RATIO}×, to protect the frame budget`, () => {
    expect(canvasSize(300, half, 3).scale).toBe(MAX_DEVICE_PIXEL_RATIO);
    expect(canvasSize(300, half, 3).pixelWidth).toBe(600);
  });

  it('treats a missing or nonsense pixel ratio as 1', () => {
    expect(canvasSize(100, half, 0).scale).toBe(1);
    expect(canvasSize(100, half, Number.NaN).scale).toBe(1);
  });

  it('floors fractional CSS widths and never goes negative', () => {
    expect(canvasSize(100.7, half, 1).cssWidth).toBe(100);
    expect(canvasSize(-5, half, 1)).toMatchObject({
      cssWidth: 0,
      pixelWidth: 0,
    });
  });

  it('handles a detached container of zero width', () => {
    expect(canvasSize(0, () => 160, 2)).toMatchObject({
      cssWidth: 0,
      cssHeight: 160,
      pixelWidth: 0,
    });
  });
});
