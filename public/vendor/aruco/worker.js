/* global importScripts */
let runtime;
let detector;
let dictionary;
let parameters;
let refinement;
let family;
const families = new Set([
  'DICT_4X4_50', 'DICT_4X4_100', 'DICT_4X4_250', 'DICT_4X4_1000',
  'DICT_ARUCO_ORIGINAL', 'DICT_ARUCO_MIP_36h12',
  'DICT_5X5_50', 'DICT_5X5_100', 'DICT_5X5_250', 'DICT_5X5_1000',
]);

function selectDictionary(name) {
  if (!families.has(name)) throw new Error('Unsupported ArUco dictionary');
  if (family === name) return;
  detector?.delete(); detector = undefined;
  dictionary?.delete(); dictionary = undefined;
  family = undefined;
  dictionary = runtime.getPredefinedDictionary(runtime[name]);
  detector = new runtime.aruco_ArucoDetector(dictionary, parameters, refinement);
  family = name;
}

self.onmessage = async ({ data: request }) => {
  try {
    if (request.type === 'init') {
      importScripts('opencv.js');
      runtime = await self.cv;
      parameters = new runtime.aruco_DetectorParameters();
      parameters.cornerRefinementMethod = runtime.CORNER_REFINE_SUBPIX;
      // Classify each cell by its majority, matching OpenCV 4.x.
      parameters.validBitIdThreshold = 0.5;
      refinement = new runtime.aruco_RefineParameters(10, 3, true);
      self.postMessage({ id: request.id, ok: true });
      return;
    }
    if (request.type !== 'detect' || !runtime) throw new Error('ArUco engine is not ready');
    const { width, height, pixels } = request;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
        width * height > 2560 * 2560 || pixels.byteLength !== width * height) {
      throw new Error('Invalid ArUco frame');
    }
    selectDictionary(request.family);
    const owned = [];
    try {
      const frame = new runtime.Mat(height, width, runtime.CV_8UC1); owned.push(frame);
      frame.data.set(new Uint8Array(pixels));
      const corners = new runtime.MatVector(); owned.push(corners);
      const ids = new runtime.Mat(); owned.push(ids);
      const rejected = new runtime.MatVector(); owned.push(rejected);
      detector.detectMarkers(frame, corners, ids, rejected);
      const markers = [];
      for (let i = 0; i < ids.data32S.length; i++) {
        const quad = corners.get(i);
        try {
          const points = quad.data32F;
          markers.push({ id: ids.data32S[i],
            corners: Array.from({ length: 4 }, (_, j) => ({ x: points[j * 2], y: points[j * 2 + 1] })) });
        } finally { quad.delete(); }
      }
      self.postMessage({ id: request.id, ok: true, result: markers });
    } finally { owned.reverse().forEach(value => value.delete()); }
  } catch (error) {
    self.postMessage({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
