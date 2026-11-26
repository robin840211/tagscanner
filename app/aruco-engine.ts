import type { OpenCvDictionaryName } from './opencv-reference';
import { ArucoWorkerClient } from './aruco-worker-client';

export const ARUCO_FAMILY_DEFINITIONS = {
  DICT_4X4_50: { label: '4×4 · 50', opencvDictionary: 'DICT_4X4_50' },
  DICT_4X4_100: { label: '4×4 · 100', opencvDictionary: 'DICT_4X4_100' },
  DICT_4X4_250: { label: '4×4 · 250', opencvDictionary: 'DICT_4X4_250' },
  DICT_4X4_1000: { label: '4×4 · 1000', opencvDictionary: 'DICT_4X4_1000' },
  DICT_5X5_50: { label: '5×5 · 50', opencvDictionary: 'DICT_5X5_50' },
  DICT_5X5_100: { label: '5×5 · 100', opencvDictionary: 'DICT_5X5_100' },
  DICT_5X5_250: { label: '5×5 · 250', opencvDictionary: 'DICT_5X5_250' },
  DICT_5X5_1000: { label: '5×5 · 1000', opencvDictionary: 'DICT_5X5_1000' },
  ARUCO: {
    label: 'Original 5×5',
    opencvDictionary: 'DICT_ARUCO_ORIGINAL',
  },
  ARUCO_MIP_36h12: {
    label: 'MIP 36h12（進階）',
    opencvDictionary: 'DICT_ARUCO_MIP_36h12',
  },
} as const satisfies Record<
  string,
  { label: string; opencvDictionary: OpenCvDictionaryName }
>;

export type ArucoFamily = keyof typeof ARUCO_FAMILY_DEFINITIONS;

export type ArucoMarker = {
  id: number;
  corners: Array<{ x: number; y: number }>;
  distance?: number;
};

export type ArucoDetector = {
  detect(
    width: number,
    height: number,
    pixels: Uint8Array | Uint8ClampedArray,
    family?: ArucoFamily,
  ): ArucoMarker[] | Promise<ArucoMarker[]>;
  free(): void;
};

export async function createArucoDetector(family: ArucoFamily): Promise<ArucoDetector> {
  const worker = new ArucoWorkerClient();
  return {
    detect: (width, height, pixels, selectedFamily = family) => worker.detect(width, height, pixels, ARUCO_FAMILY_DEFINITIONS[selectedFamily].opencvDictionary),
    free: () => worker.free(),
  };
}
