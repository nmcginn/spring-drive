import { describe, expect, it } from 'vitest';
import { motionButtonState, sliderValue } from '../../src/runtime/controls.ts';
import type { WidgetStatus } from '../../src/runtime/scheduler.ts';

const base: WidgetStatus = {
  globallyPaused: false,
  visible: true,
  reducedMotion: false,
  playRequested: false,
  ticking: true,
};

describe('motionButtonState', () => {
  it('hides the button when reduced motion is off', () => {
    expect(motionButtonState(base)).toBeNull();
  });

  it('offers Play under reduced motion until the reader presses it', () => {
    expect(motionButtonState({ ...base, reducedMotion: true, ticking: false })).toEqual({ label: 'Play' });
  });

  it('offers Pause once the reader has pressed Play', () => {
    expect(motionButtonState({ ...base, reducedMotion: true, playRequested: true })).toEqual({ label: 'Pause' });
  });

  it('still offers Pause while globally paused, since the request stands', () => {
    const status = {
      ...base,
      reducedMotion: true,
      playRequested: true,
      globallyPaused: true,
      ticking: false,
    };
    expect(motionButtonState(status)).toEqual({ label: 'Pause' });
  });
});

describe('sliderValue', () => {
  it('reads the input as a number on its step, rounded so decimal steps read back cleanly', () => {
    expect(sliderValue('8.1', 0, 16, 0.1, 8)).toBe(8.1);
    expect(sliderValue('0.30000000000000004', 0, 16, 0.1, 8)).toBe(0.3);
    expect(sliderValue('8.14', 0, 16, 0.1, 8)).toBe(8.1);
    expect(sliderValue('8.16', 0, 16, 0.1, 8)).toBe(8.2);
  });

  it('clamps to the ends', () => {
    expect(sliderValue('-3', 0, 16, 0.1, 8)).toBe(0);
    expect(sliderValue('99', 0, 16, 0.1, 8)).toBe(16);
  });

  it('keeps the last value when the text is not a number', () => {
    expect(sliderValue('', 0, 16, 0.1, 7.5)).toBe(7.5);
    expect(sliderValue('fast', 0, 16, 0.1, 7.5)).toBe(7.5);
    expect(sliderValue('Infinity', 0, 16, 0.1, 7.5)).toBe(7.5);
  });

  it('works for whole-number steps', () => {
    expect(sliderValue('4.6', 0, 10, 1, 0)).toBe(5);
  });
});
