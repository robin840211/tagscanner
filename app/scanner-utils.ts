export function isSafeWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export type Point = { x: number; y: number };

export function pointInPolygon(point: Point, polygon: Point[]) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Shortest side of a quadrilateral, used to skip labels on markers too small to read. */
export function polygonMinSide(polygon: Point[]) {
  let min = Infinity;
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    min = Math.min(min, Math.hypot(next.x - point.x, next.y - point.y));
  });
  return Number.isFinite(min) ? min : 0;
}

export type HistoryRow = { scannedAt: number; source: string; format: string; text: string };

function csvCell(value: string) {
  // A leading formula character would run as a formula when the file is opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

export function historyToCsv(rows: HistoryRow[]) {
  const lines = [['time', 'source', 'format', 'content'].join(',')];
  for (const row of rows) lines.push([new Date(row.scannedAt).toISOString(), row.source, row.format, row.text].map(csvCell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
