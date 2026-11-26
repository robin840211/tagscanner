import { describe, expect, it } from 'vitest';
import { getTagDirection } from '../app/tag-orientation';

const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
describe('marker direction', () => {
  it.each([0, 90, 180, 270, 30])('follows a %i degree rotation of the marker', degrees => {
    const angle = degrees * Math.PI / 180;
    const rotate = (p: { x: number; y: number }) => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) });
    const corners = square.map(rotate);
    const result = getTagDirection(corners, 'DICT_4X4_50')!;
    const expected = rotate({ x: 50, y: 10 });
    expect(result.tip.x).toBeCloseTo(expected.x, 6); expect(result.tip.y).toBeCloseTo(expected.y, 6);
    expect(getTagDirection([corners[3], corners[2], corners[1], corners[0]], 'DICT_APRILTAG_36h11')).toEqual(result);
  });
  it('keeps the centerline projectively correct under perspective', () => {
    const project = (x: number, y: number) => ({ x: (200 * x + 30 * y + 10) / (.7 * x + .4 * y + 1), y: (20 * x + 170 * y + 25) / (.7 * x + .4 * y + 1) });
    const result = getTagDirection([project(0, 0), project(1, 0), project(1, 1), project(0, 1)], 'DICT_ARUCO_MIP_36h12')!;
    for (const [actual, expected] of [[result.center, project(.5, .5)], [result.tip, project(.5, .1)]]) {
      expect(actual.x).toBeCloseTo(expected.x, 6); expect(actual.y).toBeCloseTo(expected.y, 6);
    }
  });
  it('omits non-markers and unusable quadrilaterals', () => {
    expect(getTagDirection(square)).toBeNull();
    expect(getTagDirection(square, 'DICT_ARUCO_ORIGINAL', 1023)).toBeNull();
    for (const points of [square.slice(0, 3), [square[0], square[2], square[1], square[3]], Array(4).fill(square[0]), [{ x: NaN, y: 0 }, ...square.slice(1)]]) {
      expect(getTagDirection(points, 'DICT_4X4_50')).toBeNull();
    }
  });
});
