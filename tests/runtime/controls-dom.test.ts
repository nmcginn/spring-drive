// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createToggle } from '../../src/runtime/controls.ts';

describe('createToggle', () => {
  it('is a real button whose state is announced through aria-pressed', () => {
    const toggle = createToggle({ label: 'Slow motion', onChange: () => {} });
    expect(toggle.element.tagName).toBe('BUTTON');
    expect(toggle.element.type).toBe('button');
    expect(toggle.element.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.element.textContent).toBe('Slow motion');
  });

  it('flips on each press, reports the new state, and keeps its label', () => {
    const onChange = vi.fn();
    const toggle = createToggle({ label: 'Slow motion', onChange });
    toggle.element.click();
    expect(toggle.isOn()).toBe(true);
    expect(toggle.element.getAttribute('aria-pressed')).toBe('true');
    expect(onChange).toHaveBeenLastCalledWith(true);
    toggle.element.click();
    expect(toggle.isOn()).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(toggle.element.textContent).toBe('Slow motion');
  });

  it('can be set by the widget without reporting a change the reader did not make', () => {
    const onChange = vi.fn();
    const toggle = createToggle({ label: 'Fast-forward', initial: true, onChange });
    expect(toggle.isOn()).toBe(true);
    toggle.set(false);
    expect(toggle.element.getAttribute('aria-pressed')).toBe('false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('takes an accessible name when the visible label is not enough', () => {
    const toggle = createToggle({
      label: 'Fast-forward, 1 h/s',
      ariaLabel: 'Fast-forward, one hour each second',
      onChange: () => {},
    });
    expect(toggle.element.getAttribute('aria-label')).toBe('Fast-forward, one hour each second');
  });
});
