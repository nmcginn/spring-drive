// A PNG's pixel size, read from its header, and the images in an ICO file,
// so tests can check the images in public/ without a browser or an image
// library.

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height in pixels, from the IHDR chunk every PNG starts with. Throws on anything that is not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const isPng = bytes.length >= 24 && SIGNATURE.every((b, i) => bytes[i] === b);
  const ihdr = String.fromCharCode(...bytes.subarray(12, 16));
  if (!isPng || ihdr !== 'IHDR') throw new Error('Not a PNG');
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** The images an ICO file lists: each one's size, and the bytes its entry points at. Throws on anything that is not an icon. */
export function icoEntries(bytes: Uint8Array): { sizePx: number; png: Uint8Array }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 6 || view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) throw new Error('Not an ICO');
  return Array.from({ length: view.getUint16(4, true) }, (_, i) => {
    const entry = 6 + 16 * i;
    const length = view.getUint32(entry + 8, true);
    const offset = view.getUint32(entry + 12, true);
    if (offset + length > bytes.length) throw new Error('ICO entry runs past the end of the file');
    // One byte each for width and height, with 0 meaning 256.
    return { sizePx: view.getUint8(entry) || 256, png: bytes.subarray(offset, offset + length) };
  });
}
