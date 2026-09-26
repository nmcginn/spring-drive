import { describe, expect, it } from 'vitest';
import { UNIT_SPACE, formatDuration, formatPercent, formatRatio, withUnit } from '../../src/widgets/shared/format.ts';

describe('withUnit', () => {
  it('joins value and unit with a narrow no-break space, so a readout never wraps between them', () => {
    expect(withUnit(30.614, 1, 'rev/s')).toBe('30.6\u202frev/s');
    expect(UNIT_SPACE).toBe('\u202f');
  });

  it('keeps a fixed number of decimals, so the text does not jitter as it changes', () => {
    expect(withUnit(8, 3, 'rev/s')).toBe('8.000\u202frev/s');
    expect(withUnit(12, 1, 's')).toBe('12.0\u202fs');
  });

  it('never shows a negative zero, which a value that rounds to zero from below would print as "-0.0"', () => {
    expect(withUnit(-0, 1, 'V')).toBe('0.0\u202fV');
    expect(withUnit(-0.00004, 1, 'V')).toBe('0.0\u202fV');
  });

  it('uses a real minus sign for negative values', () => {
    expect(withUnit(-1.25, 2, 'rad')).toBe('−1.25\u202frad');
  });
});

describe('formatDuration', () => {
  it('shows tenths of a second under a minute', () => {
    expect(formatDuration(0)).toBe('0.0\u202fs');
    expect(formatDuration(42.57)).toBe('42.5\u202fs');
  });

  it('floors, as a clock does, so it never shows a tenth that has not yet passed', () => {
    expect(formatDuration(59.99)).toBe('59.9\u202fs');
  });

  it('shows minutes and zero-padded seconds under an hour', () => {
    expect(formatDuration(60)).toBe('1\u202fmin 00\u202fs');
    expect(formatDuration(187.9)).toBe('3\u202fmin 07\u202fs');
    expect(formatDuration(3599.9)).toBe('59\u202fmin 59\u202fs');
  });

  it('shows hours and zero-padded minutes from an hour up, past a day', () => {
    expect(formatDuration(3600)).toBe('1\u202fh 00\u202fmin');
    expect(formatDuration(104_186)).toBe('28\u202fh 56\u202fmin');
    expect(formatDuration(1_000_000)).toBe('277\u202fh 46\u202fmin');
  });

  it('treats negative time as zero rather than printing a negative clock', () => {
    expect(formatDuration(-3)).toBe('0.0\u202fs');
  });
});

describe('formatRatio and formatPercent', () => {
  it('shows a ratio with the multiplication sign as its unit', () => {
    expect(formatRatio(3.8264)).toBe('3.83×');
    expect(formatRatio(1, 0)).toBe('1×');
  });

  it('shows a fraction as a percentage with its unit', () => {
    expect(formatPercent(1)).toBe('100.0\u202f%');
    expect(formatPercent(0.00374)).toBe('0.4\u202f%');
    expect(formatPercent(0)).toBe('0.0\u202f%');
  });
});
