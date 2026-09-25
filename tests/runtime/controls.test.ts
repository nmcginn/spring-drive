import { describe, expect, it } from 'vitest';
import { motionButtonState } from '../../src/runtime/controls.ts';
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
