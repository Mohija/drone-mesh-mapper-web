import { describe, it, expect } from 'vitest';
import { pointInPolygon } from './useFlightZones';

describe('pointInPolygon', () => {
  const square: [number, number][] = [[0, 0], [0, 10], [10, 10], [10, 0]];

  it('returns true for point inside square', () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
  });

  it('returns false for point outside square', () => {
    expect(pointInPolygon(15, 5, square)).toBe(false);
  });

  it('returns true for point inside triangle', () => {
    const triangle: [number, number][] = [[0, 0], [10, 5], [0, 10]];
    expect(pointInPolygon(3, 5, triangle)).toBe(true);
  });

  it('returns false for point outside triangle', () => {
    const triangle: [number, number][] = [[0, 0], [10, 5], [0, 10]];
    expect(pointInPolygon(9, 1, triangle)).toBe(false);
  });

  it('returns false for polygon with less than 3 points', () => {
    expect(pointInPolygon(5, 5, [[0, 0], [10, 10]])).toBe(false);
    expect(pointInPolygon(5, 5, [])).toBe(false);
  });

  it('works with real-world coordinates (Bielefeld)', () => {
    const bielefeld: [number, number][] = [
      [52.025, 8.525],
      [52.025, 8.545],
      [52.035, 8.545],
      [52.035, 8.525],
    ];
    expect(pointInPolygon(52.030, 8.535, bielefeld)).toBe(true);
    expect(pointInPolygon(52.040, 8.535, bielefeld)).toBe(false);
  });
});
