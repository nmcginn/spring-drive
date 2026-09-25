// Widget IDs, as used in `data-widget` slots, mapped to lazy imports. Each
// widget becomes its own chunk, fetched (from the page's own origin) only
// when its slot nears the viewport.

export type Mount = (el: HTMLElement) => () => void;

export const WIDGETS: Readonly<Record<string, () => Promise<{ mount: Mount }>>> = {
  placeholder: () => import('./placeholder/index.ts'),
};
