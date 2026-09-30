import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PART_IDS, type PartId } from '../src/runtime/palette.ts';

// What the prose calls each part, read from index.html's own markup, so the
// checks that widgets colour parts as the prose does (decision 40) follow the
// article as it is written rather than a list kept beside it.

export const INDEX_HTML = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8');

export interface ProseTerm {
  /** The words, lower case, as they appear inside the span. */
  term: string;
  part: PartId;
}

/** Every distinct `<span class="part" data-part="…">term</span>` in `html`, PROSE stubs included. */
export function proseTerms(html: string = INDEX_HTML): ProseTerm[] {
  const seen = new Map<string, ProseTerm>();
  for (const m of html.matchAll(/<span class="part" data-part="([^"]+)">([^<]+)<\/span>/g)) {
    const part = m[1] as PartId;
    if (!PART_IDS.includes(part)) throw new Error(`index.html names a part the palette lacks: ${part}`);
    const term = (m[2] ?? '').trim().toLowerCase();
    seen.set(`${term}|${part}`, { term, part });
  }
  return [...seen.values()];
}

/**
 * The part a label names by its first words, as the prose names it: "Glide
 * wheel speed" names the glide wheel, "IC: locked" the IC, "Coil shorted"
 * the coil. The longest term wins, so "quartz crystal" beats "crystal", and a
 * term must end at a word boundary, so "ICs" is not "IC" and "Handset" is not
 * "hands". Null when the label does not begin with a part's name.
 */
export function namedPart(label: string, terms: readonly ProseTerm[]): PartId | null {
  const text = label.trim().toLowerCase();
  let best: ProseTerm | null = null;
  for (const t of terms) {
    if (!text.startsWith(t.term)) continue;
    if (/[\p{L}\p{N}]/u.test(text.charAt(t.term.length))) continue;
    if (!best || t.term.length > best.term.length) best = t;
  }
  return best?.part ?? null;
}
