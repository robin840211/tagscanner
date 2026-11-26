export type OpenCvDictionaryName =
  | `DICT_${'4X4' | '5X5'}_${50 | 100 | 250 | 1000}`
  | 'DICT_ARUCO_ORIGINAL'
  | 'DICT_ARUCO_MIP_36h12'
  | 'DICT_APRILTAG_36h11';

export function createOpenCvDetectionSnippet(
  dictionaryName: OpenCvDictionaryName,
) {
  return `import cv2

image = cv2.imread("marker.png")
dictionary = cv2.aruco.getPredefinedDictionary(
    cv2.aruco.${dictionaryName}
)
detector = cv2.aruco.ArucoDetector(dictionary)
corners, ids, rejected = detector.detectMarkers(image)

print(ids)`;
}
