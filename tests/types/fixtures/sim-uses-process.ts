// Typechecked as if it were in src/sim. Must fail: Node's types are not loaded there either.
export const env = (): string | undefined => process.env.HOME;
