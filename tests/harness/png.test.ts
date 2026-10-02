import { describe, expect, it } from 'vitest';
import { icoEntries, pngSize } from './png.ts';

// tests/tools/og.test.ts checks the committed images' sizes with this, so it
// is checked here on headers written by hand.

function header(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe('pngSize', () => {
  it('reads the width and height from the header, big-endian as PNG stores them', () => {
    expect(pngSize(header(1200, 630))).toEqual({ width: 1200, height: 630 });
    expect(pngSize(header(70_000, 1))).toEqual({ width: 70_000, height: 1 });
  });

  it('reads a PNG that sits inside a larger buffer', () => {
    const outer = new Uint8Array(40);
    outer.set(header(180, 180), 7);
    expect(pngSize(outer.subarray(7))).toEqual({ width: 180, height: 180 });
  });

  it('refuses anything that is not a PNG, rather than reading a size from it', () => {
    expect(() => pngSize(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toThrow(
      'Not a PNG',
    );
    expect(() => pngSize(header(1, 1).subarray(0, 20))).toThrow('Not a PNG');
    const wrongChunk = header(1, 1);
    wrongChunk[12] = 0x58;
    expect(() => pngSize(wrongChunk)).toThrow('Not a PNG');
  });
});

describe('icoEntries', () => {
  it('refuses anything that is not an icon, or whose entries point past its end', () => {
    expect(() => icoEntries(header(16, 16))).toThrow('Not an ICO');
    const truncated = new Uint8Array(22);
    truncated.set([0, 0, 1, 0, 1, 0]);
    new DataView(truncated.buffer).setUint32(14, 100, true);
    expect(() => icoEntries(truncated)).toThrow('past the end');
  });
});
