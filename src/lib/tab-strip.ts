// The strip of the projects' tabs, when they are more than its room holds: how it scrolls, and what it says of the
// tabs out of view.

import { clamp } from './resize';
import type { AgentStatus } from './types';

/** Where the strip is scrolled to, how wide its room is and how wide its tabs are, in pixels. */
export interface Metrics {
  scroll: number;
  view: number;
  content: number;
}

/** A tab, from the start of the strip, and the color it blinks in (null when it does not). */
export interface TabBox {
  left: number;
  width: number;
  alert: string | null;
}

export interface Side {
  hidden: boolean;
  /** The most pressing alert among the tabs out of view at this side. */
  alert: string | null;
}

/** Pixels a line of the wheel scrolls, for a wheel that counts in lines. */
const LINE = 40;

/** The color a tab blinks in for an agent to look at: red when it failed, amber when it asks, green when it finished. */
export function alertColor(status: AgentStatus): string {
  return status === 'error' ? 'var(--del)' : status === 'waiting' ? 'var(--wait)' : 'var(--ok)';
}

/** The blinks of the tabs, most pressing first: an error, then a question, then an end. */
export const ALERTS = (['error', 'waiting', 'done'] as const).map(alertColor);

/**
 * How far a turn of the wheel scrolls the strip sideways: its vertical turn, the strip being one row. Null leaves
 * the event to the browser: a sideways swipe of a touchpad or Shift + wheel, which scroll the strip by themselves, and
 * Ctrl + wheel.
 */
export function wheelScroll(e: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'ctrlKey'>, view: number): number | null {
  if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return null;
  return e.deltaY * (e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? view : 1);
}

/**
 * The scroll that brings the tab from `left` to `left + width` into view, with `margin` around it (where the fades
 * are): the same scroll when it is in view already, its start when it is wider than the room.
 */
export function revealScroll(m: Metrics, left: number, width: number, margin: number): number {
  let to = m.scroll;
  if (left - margin < to) to = left - margin;
  else if (left + width + margin > to + m.view) to = Math.min(left + width + margin - m.view, left - margin);
  return clamp(to, 0, Math.max(0, m.content - m.view));
}

/**
 * Pixels per frame (at 60 Hz) a tab dragged at `x` scrolls the strip from `left` to `right` by: toward the edge it is
 * near, faster the nearer, up to `max` at the edge and as far past it; 0 away from the edges, and farther past them,
 * over the rest of the bar.
 */
export function edgeSpeed(x: number, left: number, right: number, zone = 48, max = 12): number {
  const speed = (depth: number) => Math.max(1, Math.round(max * Math.min(1, depth / zone)));
  if (x < left - zone || x > right + zone) return 0;
  if (x < left + zone) return -speed(left + zone - x);
  if (x > right - zone) return speed(x - (right - zone));
  return 0;
}

/** The most pressing of these blinks (`ALERTS`), or null. */
export function mostPressing(alerts: (string | null)[]): string | null {
  return ALERTS.find((a) => alerts.includes(a)) ?? null;
}

/** Whether tabs are out of view at each side of the strip, whole or cut, and the most pressing blink among them. */
export function hiddenSides(tabs: TabBox[], m: Metrics): { left: Side; right: Side } {
  const end = m.scroll + m.view;
  return {
    left: { hidden: m.scroll > 0.5, alert: mostPressing(tabs.filter((t) => t.left < m.scroll - 0.5).map((t) => t.alert)) },
    right: {
      hidden: end < m.content - 0.5,
      alert: mostPressing(tabs.filter((t) => t.left + t.width > end + 0.5).map((t) => t.alert)),
    },
  };
}

/** The thumb of the strip's scroll bar: as wide as the part in view (`min` at least), where it is; null when every tab fits. */
export function thumb(m: Metrics, min = 32): { left: number; width: number } | null {
  if (m.content <= m.view + 0.5) return null;
  const width = Math.max(min, (m.view * m.view) / m.content);
  return { left: (m.scroll / (m.content - m.view)) * (m.view - width), width };
}

/** The scroll for the thumb moved by `dx` pixels from where it was when the strip was scrolled to `from`. */
export function thumbDrag(m: Metrics, from: number, dx: number, min = 32): number {
  const width = thumb(m, min)?.width ?? m.view;
  const run = m.view - width;
  return clamp(run > 0 ? from + (dx * (m.content - m.view)) / run : from, 0, Math.max(0, m.content - m.view));
}
