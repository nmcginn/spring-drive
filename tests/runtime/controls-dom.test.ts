// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createSlider, createToggle } from '../../src/runtime/controls.ts';

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
      ariaLabel: 'Fast-forward, 1 h/s: one hour each second',
      onChange: () => {},
    });
    expect(toggle.element.getAttribute('aria-label')).toBe('Fast-forward, 1 h/s: one hour each second');
  });
});

describe('createSlider', () => {
  function make(onInput = vi.fn()) {
    const slider = createSlider({
      label: 'Glide wheel speed',
      ariaLabel: 'Glide wheel speed, turning the generator',
      min: 0,
      max: 16,
      step: 0.1,
      initial: 8,
      valueText: (v) => `${v.toFixed(1)} rev/s`,
      onInput,
    });
    return { slider, onInput };
  }

  function drag(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('is a native range input inside its visible label, so the label names it', () => {
    const { slider } = make();
    expect(slider.input.type).toBe('range');
    expect(slider.element.tagName).toBe('LABEL');
    expect(slider.element.contains(slider.input)).toBe(true);
    expect(slider.element.textContent).toBe('Glide wheel speed');
    expect([slider.input.min, slider.input.max, slider.input.step, slider.input.value]).toEqual([
      '0',
      '16',
      '0.1',
      '8',
    ]);
  });

  it('has an ARIA label that begins with its visible label and says what it acts on', () => {
    const { slider } = make();
    expect(slider.input.getAttribute('aria-label')).toBe('Glide wheel speed, turning the generator');
  });

  it('announces its value with the unit', () => {
    const { slider } = make();
    expect(slider.input.getAttribute('aria-valuetext')).toBe('8.0 rev/s');
    drag(slider.input, '12.3');
    expect(slider.input.getAttribute('aria-valuetext')).toBe('12.3 rev/s');
  });

  it('reports every movement, with the value on its step', () => {
    const { slider, onInput } = make();
    drag(slider.input, '3.3');
    drag(slider.input, '3.4');
    expect(onInput.mock.calls).toEqual([[3.3], [3.4]]);
    expect(slider.value()).toBe(3.4);
  });
});
