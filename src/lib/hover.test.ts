import { describe, expect, it } from 'vitest';
import { pointerMoves } from './hover';

const at = (clientX: number, clientY: number) => new MouseEvent('mousemove', { clientX, clientY });

describe('pointerMoves', () => {
  it('takes a move to another place, never one where the pointer already was (ESC-188)', () => {
    const moved = pointerMoves();
    expect(moved(at(10, 20))).toBe(true);
    // What Chromium sends when the list scrolls under a pointer that stays.
    expect(moved(at(10, 20))).toBe(false);
    expect(moved(at(10, 21))).toBe(true);
    expect(moved(at(11, 21))).toBe(true);
    expect(moved(at(11, 21))).toBe(false);
  });
});
