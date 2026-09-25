// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createHiDpiCanvas } from '../../src/runtime/canvas.ts';

describe('createHiDpiCanvas', () => {
  it('does not call onResize before returning, when the caller cannot yet use the result', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const onResize = vi.fn();
    const surface = createHiDpiCanvas(parent, () => 160, onResize);
    expect(onResize).not.toHaveBeenCalled();
    expect(surface.size().cssHeight).toBe(160);
    expect(surface.canvas.style.height).toBe('160px');
    surface.destroy();
  });

  it('removes its canvas on destroy', () => {
    const parent = document.createElement('div');
    const surface = createHiDpiCanvas(
      parent,
      () => 100,
      () => {},
    );
    expect(parent.querySelector('canvas')).not.toBeNull();
    surface.destroy();
    expect(parent.querySelector('canvas')).toBeNull();
  });
});
