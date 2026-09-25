// Typechecked as if it were in src/sim. Must fail: neither DOM nor Node timers exist there.
export function later(f: () => void): void {
  setTimeout(f, 10);
}
