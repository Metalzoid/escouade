import { describe, expect, it } from 'vitest';
import { alertColor, edgeSpeed, hiddenSides, mostPressing, revealScroll, thumb, thumbDrag, wheelScroll } from './tab-strip';

const wheel = (over: Partial<Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'ctrlKey'>> = {}) => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  ...over,
});

describe('wheelScroll', () => {
  it('turns the wheel’s vertical turn into a sideways scroll', () => {
    expect(wheelScroll(wheel({ deltaY: 100 }), 600)).toBe(100);
    expect(wheelScroll(wheel({ deltaY: -53 }), 600)).toBe(-53);
  });
  it('counts a wheel that turns by lines or by pages in pixels', () => {
    expect(wheelScroll(wheel({ deltaY: 3, deltaMode: 1 }), 600)).toBe(120);
    expect(wheelScroll(wheel({ deltaY: -1, deltaMode: 2 }), 600)).toBe(-600);
  });
  it('leaves a sideways swipe of a touchpad, and Shift + wheel, to the browser', () => {
    expect(wheelScroll(wheel({ deltaX: 30, deltaY: 4 }), 600)).toBeNull();
    expect(wheelScroll(wheel({ deltaX: -100 }), 600)).toBeNull();
  });
  it('leaves Ctrl + wheel (the zoom) and an empty turn alone', () => {
    expect(wheelScroll(wheel({ deltaY: 100, ctrlKey: true }), 600)).toBeNull();
    expect(wheelScroll(wheel(), 600)).toBeNull();
  });
});

describe('revealScroll', () => {
  const m = { scroll: 200, view: 500, content: 1500 };
  it('keeps the scroll when the tab is in view, its margins too', () => {
    expect(revealScroll(m, 300, 100, 24)).toBe(200);
    expect(revealScroll(m, 224, 452, 24)).toBe(200);
  });
  it('scrolls back to a tab cut at the left, with the margin before it', () => {
    expect(revealScroll(m, 150, 100, 24)).toBe(126);
    expect(revealScroll(m, 210, 100, 24)).toBe(186);
  });
  it('scrolls on to a tab cut at the right, with the margin after it', () => {
    expect(revealScroll(m, 1000, 120, 24)).toBe(644);
    expect(revealScroll(m, 650, 100, 24)).toBe(274);
  });
  it('stays within the strip at its ends', () => {
    expect(revealScroll(m, 0, 100, 24)).toBe(0);
    expect(revealScroll(m, 1400, 100, 24)).toBe(1000);
  });
  it('shows the start of a tab wider than the room', () => {
    expect(revealScroll(m, 900, 700, 24)).toBe(876);
  });
});

describe('edgeSpeed', () => {
  it('does not scroll away from the edges', () => {
    expect(edgeSpeed(300, 100, 700)).toBe(0);
    expect(edgeSpeed(148, 100, 700)).toBe(0);
    expect(edgeSpeed(652, 100, 700)).toBe(0);
  });
  it('scrolls toward the edge the pointer is near, faster the nearer it is', () => {
    const slow = edgeSpeed(140, 100, 700);
    const fast = edgeSpeed(104, 100, 700);
    expect(slow).toBeLessThan(0);
    expect(fast).toBeLessThan(slow);
    expect(edgeSpeed(660, 100, 700)).toBeGreaterThan(0);
    expect(edgeSpeed(696, 100, 700)).toBeGreaterThan(edgeSpeed(660, 100, 700));
  });
  it('holds its top speed at the edge and just past it', () => {
    expect(edgeSpeed(100, 100, 700)).toBe(-12);
    expect(edgeSpeed(80, 100, 700)).toBe(-12);
    expect(edgeSpeed(720, 100, 700)).toBe(12);
    expect(edgeSpeed(748, 100, 700)).toBe(12);
  });
  it('does not scroll for a pointer far past an edge, over the rest of the bar', () => {
    expect(edgeSpeed(40, 100, 700)).toBe(0);
    expect(edgeSpeed(760, 100, 700)).toBe(0);
  });
});

describe('alertColor', () => {
  it('colors a blink by what the agent did: red when it failed, amber when it asks, green when it finished', () => {
    expect(alertColor('error')).toBe('var(--del)');
    expect(alertColor('waiting')).toBe('var(--wait)');
    expect(alertColor('done')).toBe('var(--ok)');
  });
});

describe('mostPressing', () => {
  it('puts an error before a question, and a question before an end', () => {
    expect(mostPressing(['var(--ok)', 'var(--del)', 'var(--wait)'])).toBe('var(--del)');
    expect(mostPressing([null, 'var(--ok)', 'var(--wait)'])).toBe('var(--wait)');
    expect(mostPressing(['var(--ok)', null])).toBe('var(--ok)');
    expect(mostPressing([null, null])).toBeNull();
  });
});

describe('hiddenSides', () => {
  // Five tabs of 100 px, 2 px apart.
  const tabs = (alerts: (string | null)[] = []) => [0, 1, 2, 3, 4].map((i) => ({ left: i * 102, width: 100, alert: alerts[i] ?? null }));
  it('hides nothing when every tab fits', () => {
    expect(hiddenSides(tabs(), { scroll: 0, view: 600, content: 508 })).toEqual({
      left: { hidden: false, alert: null },
      right: { hidden: false, alert: null },
    });
  });
  it('tells which sides have tabs out of view', () => {
    expect(hiddenSides(tabs(), { scroll: 0, view: 300, content: 508 })).toMatchObject({ left: { hidden: false }, right: { hidden: true } });
    expect(hiddenSides(tabs(), { scroll: 100, view: 300, content: 508 })).toMatchObject({
      left: { hidden: true },
      right: { hidden: true },
    });
    expect(hiddenSides(tabs(), { scroll: 208, view: 300, content: 508 })).toMatchObject({
      left: { hidden: true },
      right: { hidden: false },
    });
  });
  it('takes the most pressing alert of the tabs cut at each side', () => {
    const alerts = ['var(--ok)', 'var(--del)', 'var(--del)', 'var(--wait)', 'var(--ok)'];
    // In view: from 150 to 350, the third tab (204 to 304) whole, the second and the fourth cut.
    expect(hiddenSides(tabs(alerts), { scroll: 150, view: 200, content: 508 })).toEqual({
      left: { hidden: true, alert: 'var(--del)' },
      right: { hidden: true, alert: 'var(--wait)' },
    });
  });
  it('gives no alert for a blinking tab in view', () => {
    const alerts = [null, null, 'var(--del)', null, null];
    expect(hiddenSides(tabs(alerts), { scroll: 150, view: 200, content: 508 })).toEqual({
      left: { hidden: true, alert: null },
      right: { hidden: true, alert: null },
    });
  });
});

describe('thumb', () => {
  it('has none when every tab fits', () => {
    expect(thumb({ scroll: 0, view: 600, content: 600 })).toBeNull();
    expect(thumb({ scroll: 0, view: 600, content: 400 })).toBeNull();
  });
  it('is as wide as the part in view, and sits where it is', () => {
    expect(thumb({ scroll: 0, view: 500, content: 1000 })).toEqual({ left: 0, width: 250 });
    expect(thumb({ scroll: 250, view: 500, content: 1000 })).toEqual({ left: 125, width: 250 });
    expect(thumb({ scroll: 500, view: 500, content: 1000 })).toEqual({ left: 250, width: 250 });
  });
  it('stays wide enough to be taken', () => {
    expect(thumb({ scroll: 0, view: 200, content: 4000 })!.width).toBe(32);
  });
});

describe('thumbDrag', () => {
  const m = { scroll: 0, view: 500, content: 1000 };
  it('scrolls the strip as far as the thumb moves, in the strip’s measure', () => {
    // The thumb runs 250 px for 500 px of scroll.
    expect(thumbDrag(m, 100, 50)).toBe(200);
    expect(thumbDrag(m, 300, -100)).toBe(100);
  });
  it('stops at the ends', () => {
    expect(thumbDrag(m, 400, 200)).toBe(500);
    expect(thumbDrag(m, 100, -200)).toBe(0);
  });
});
