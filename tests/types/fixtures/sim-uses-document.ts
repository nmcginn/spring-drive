// Typechecked as if it were in src/sim. Must fail: the DOM lib is not loaded there.
export const title = (): string => document.title;
