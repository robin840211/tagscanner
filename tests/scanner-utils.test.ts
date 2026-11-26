import { describe, expect, it } from 'vitest';
import { historyToCsv, isSafeWebUrl, pointInPolygon, polygonMinSide } from '../app/scanner-utils';
import { ARUCO_FAMILY_DEFINITIONS } from '../app/aruco-engine';
import { createOpenCvDetectionSnippet } from '../app/opencv-reference';

describe('safe web URL validation', () => {
  it.each([
    ['https://example.com/path', true],
    ['http://localhost:3000', true],
    ['javascript:alert(1)', false],
    ['data:text/html,unsafe', false],
    ['not a url', false],
  ])('classifies %s', (value, expected) => {
    expect(isSafeWebUrl(value)).toBe(expected);
  });
});

describe('overlay hit testing', () => {
  const square = [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }, { x: 10, y: 50 }];
  it('finds points inside a quadrilateral', () => {
    expect(pointInPolygon({ x: 30, y: 30 }, square)).toBe(true);
    expect(pointInPolygon({ x: 60, y: 30 }, square)).toBe(false);
    expect(pointInPolygon({ x: 30, y: 30 }, square.slice(0, 2))).toBe(false);
  });
  it('measures the shortest side', () => {
    expect(polygonMinSide([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }])).toBe(20);
    expect(polygonMinSide([])).toBe(0);
  });
});

describe('history CSV export', () => {
  it('quotes separators and neutralizes spreadsheet formulas', () => {
    const csv = historyToCsv([
      { scannedAt: Date.UTC(2026, 0, 2), source: 'camera', format: 'QR Code', text: 'a,"b"\nc' },
      { scannedAt: Date.UTC(2026, 0, 2), source: 'image', format: 'Code 128', text: '=SUM(A1)' },
    ]);
    expect(csv.startsWith('﻿time,source,format,content\r\n')).toBe(true);
    expect(csv).toContain('"a,""b""\nc"');
    expect(csv).toContain(",'=SUM(A1)\r\n");
  });
});

describe('OpenCV compatibility reference', () => {
  it('maps the browser ArUco families to explicit OpenCV dictionaries', () => {
    expect(ARUCO_FAMILY_DEFINITIONS).toMatchObject({
      ARUCO: { opencvDictionary: 'DICT_ARUCO_ORIGINAL' },
      ARUCO_MIP_36h12: { opencvDictionary: 'DICT_ARUCO_MIP_36h12' },
    });
  });

  it('creates a current ArucoDetector Python example', () => {
    const snippet = createOpenCvDetectionSnippet('DICT_APRILTAG_36h11');
    expect(snippet).toContain('cv2.aruco.DICT_APRILTAG_36h11');
    expect(snippet).toContain('cv2.aruco.ArucoDetector(dictionary)');
    expect(snippet).toContain('detector.detectMarkers(image)');
  });
});
