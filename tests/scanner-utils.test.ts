import { describe, expect, it } from 'vitest';
import { isSafeWebUrl, paginateScanText } from '../app/scanner-utils';
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

describe('result pagination', () => {
  it('preserves line breaks within each viewport-sized page', () => {
    expect(paginateScanText('BEGIN:VCARD\r\nFN:Robin\r\nEND:VCARD', true)).toEqual(['BEGIN:VCARD\nFN:Robin\nEND:VCARD']);
    const lines = Array.from({ length: 20 }, (_, index) => 'Line ' + index);
    const pages = paginateScanText(lines.join('\n'), true);
    expect(pages.every(page => page.split('\n').length <= 3)).toBe(true);
    expect(pages.join('\n')).toBe(lines.join('\n'));
  });
  it('bounds long wide-character text and preserves its content', () => {
    const value = '辨識內容'.repeat(200);
    const pages = paginateScanText(value, true);
    expect(pages.every(page => Array.from(page).length <= 54)).toBe(true);
    expect(pages.join('')).toBe(value);
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
