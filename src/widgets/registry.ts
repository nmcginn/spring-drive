// Widget IDs, as used in `data-widget` slots, mapped to lazy imports. Each
// widget becomes its own chunk, fetched (from the page's own origin) only
// when its slot nears the viewport.

export type Mount = (el: HTMLElement) => () => void;

export const WIDGETS: Readonly<Record<string, () => Promise<{ mount: Mount }>>> = {
  'hero-glide': () => import('./hero-glide/index.ts'),
  runaway: () => import('./runaway/index.ts'),
  generator: () => import('./generator/index.ts'),
  'lenz-brake': () => import('./lenz-brake/index.ts'),
  quartz: () => import('./quartz/index.ts'),
  loop: () => import('./loop/index.ts'),
  'tri-synchro': () => import('./tri-synchro/index.ts'),
};
