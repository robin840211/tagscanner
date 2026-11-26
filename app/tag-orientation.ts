import type { OpenCvDictionaryName } from './opencv-reference';

type Point = { x: number; y: number };

export function getTagDirection(points: Point[], dictionary?: OpenCvDictionaryName, markerId?: number) {
  if (!dictionary || points.length !== 4 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  // Original ID 1023 is unchanged by a 180-degree rotation.
  if (dictionary === 'DICT_ARUCO_ORIGINAL' && markerId === 1023) return null;
  // AprilTag's native order is BL, BR, TR, TL relative to apriltag-imgs.
  const corners = dictionary === 'DICT_APRILTAG_36h11' ? [points[3], points[2], points[1], points[0]] : points;
  const origin = corners[0];
  const size = Math.max(...corners.map(p => Math.hypot(p.x - origin.x, p.y - origin.y)));
  if (size < 1e-6) return null;
  const p = corners.map(c => ({ x: (c.x - origin.x) / size, y: (c.y - origin.y) / size }));
  const turns = p.map((a, i) => {
    const b = p[(i + 1) % 4], c = p[(i + 2) % 4];
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  });
  if (!turns.every(turn => turn > 1e-8)) return null;
  // Project a unit square into the decoded quadrilateral, preserving perspective.
  const dx1 = p[1].x - p[2].x, dx2 = p[3].x - p[2].x;
  const dy1 = p[1].y - p[2].y, dy2 = p[3].y - p[2].y;
  const dx3 = p[0].x - p[1].x + p[2].x - p[3].x;
  const dy3 = p[0].y - p[1].y + p[2].y - p[3].y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(determinant) < 1e-8) return null;
  const g = (dx3 * dy2 - dx2 * dy3) / determinant;
  const h = (dx1 * dy3 - dx3 * dy1) / determinant;
  const project = (x: number, y: number): Point => {
    const w = g * x + h * y + 1;
    return {
      x: origin.x + size * ((p[1].x * (1 + g) - p[0].x) * x + (p[3].x * (1 + h) - p[0].x) * y + p[0].x) / w,
      y: origin.y + size * ((p[1].y * (1 + g) - p[0].y) * x + (p[3].y * (1 + h) - p[0].y) * y + p[0].y) / w,
    };
  };
  const center = project(.5, .5), tip = project(.5, .1);
  return [center, tip].every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) ? { center, tip } : null;
}

export function drawTagDirection(context: CanvasRenderingContext2D, points: Point[], dictionary: OpenCvDictionaryName, ratio: number, markerId: number) {
  const direction = getTagDirection(points, dictionary, markerId);
  if (!direction) return;
  const { center, tip } = direction;
  const length = Math.hypot(tip.x - center.x, tip.y - center.y);
  if (length < 8 * ratio) return;
  const ux = (tip.x - center.x) / length, uy = (tip.y - center.y) / length;
  const head = Math.min(9 * ratio, length * .3);
  context.save();
  context.lineCap = 'round'; context.lineJoin = 'round';
  context.beginPath(); context.moveTo(center.x, center.y); context.lineTo(tip.x, tip.y);
  context.moveTo(tip.x - ux * head - uy * head * .6, tip.y - uy * head + ux * head * .6);
  context.lineTo(tip.x, tip.y);
  context.lineTo(tip.x - ux * head + uy * head * .6, tip.y - uy * head - ux * head * .6);
  context.strokeStyle = '#101315'; context.lineWidth = 5 * ratio; context.stroke();
  context.strokeStyle = '#38d9ff'; context.lineWidth = 2.5 * ratio; context.stroke();
  context.restore();
}
