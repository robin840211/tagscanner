'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { BarcodeDetector } from './barcode-engine';
import { AprilTagDetector } from './apriltag-engine';
import { ARUCO_FAMILY_DEFINITIONS, createArucoDetector } from './aruco-engine';
import type { ArucoDetector, ArucoFamily } from './aruco-engine';
import { createOpenCvDetectionSnippet } from './opencv-reference';
import type { OpenCvDictionaryName } from './opencv-reference';
import { parsePayload } from './payload-parser';
import type { PayloadAction } from './payload-parser';
import { cameraNames, historyToCsv, pointInPolygon, polygonMinSide } from './scanner-utils';
import { ScanTracker } from './scan-tracker';
import LogoMark from './logo-mark';

type Group = 'code' | 'marker';
type Scope = 'auto' | 'qr' | 'barcode';
type Family = ArucoFamily | 'APRILTAG_36h11';
type CameraState = 'off' | 'starting' | 'scanning' | 'image' | 'error';
type Config = { group: Group; scope: Scope; family: Family; extended: boolean };
type Detection = { text: string; format: string; points: { x: number; y: number }[]; opencvDictionary?: OpenCvDictionaryName };
type Entry = Detection & { id: string; scannedAt: number; source: 'camera' | 'image' };
type Overlay = { width: number; height: number; shapes: Detection[] };
type Pick = { key: string; index: number };
type Toast = { text: string; action?: { label: string; run: () => void } };

const scopes: { id: Scope; label: string }[] = [
  { id: 'auto', label: '全部格式' }, { id: 'qr', label: '僅 QR' }, { id: 'barcode', label: '僅一維條碼' },
];
const familyGroups: { label: string; families: Family[] }[] = [
  { label: 'ArUco 4×4', families: ['DICT_4X4_50', 'DICT_4X4_100', 'DICT_4X4_250', 'DICT_4X4_1000'] },
  { label: 'ArUco 5×5', families: ['DICT_5X5_50', 'DICT_5X5_100', 'DICT_5X5_250', 'DICT_5X5_1000'] },
  { label: 'ArUco 其他', families: ['ARUCO', 'ARUCO_MIP_36h12'] },
  { label: 'AprilTag', families: ['APRILTAG_36h11'] },
];
const familyOption = (family: Family) => family === 'APRILTAG_36h11' ? 'AprilTag 36h11' : 'ArUco ' + ARUCO_FAMILY_DEFINITIONS[family].label;
const dictionaryOf = (family: Family): OpenCvDictionaryName => family === 'APRILTAG_36h11' ? 'DICT_APRILTAG_36h11' : ARUCO_FAMILY_DEFINITIONS[family].opencvDictionary;
const keyOf = (item: { format: string; text: string }) => item.format + '\u0000' + item.text;
const timeOf = (at: number) => new Date(at).toLocaleTimeString('zh-TW', { hour12: false });
// Structured payloads show a summary so secrets such as Wi-Fi passwords never appear in the list.
const historySummary = (entry: Entry) => {
  if (entry.opencvDictionary) return 'ID ' + entry.text;
  const parsed = parsePayload(entry.text, entry.format);
  if (parsed.type === 'text' || parsed.type === 'url') return entry.text;
  const shown = parsed.fields.find(item => !item.secret);
  return parsed.title + (shown ? ' · ' + shown.value : '');
};
const isPicked = (pick: Pick | null, shapes: Detection[], index: number) => {
  if (!pick || keyOf(shapes[index]) !== pick.key) return false;
  return pick.index < 0 || pick.index === index || shapes.filter(shape => keyOf(shape) === pick.key).length === 1;
};
const isOpenable = (value: string) => /^(https?:|tel:|mailto:|sms:)/i.test(value);
// Live labels stay sparse so a phone viewfinder does not fill with text; a paused frame or still image shows them all.
const labelBudget = (compact: boolean, still: boolean) => still ? Infinity : compact ? 3 : 12;
const cameraErrors: Record<string, string> = {
  NotAllowedError: '相機權限被拒絕，請在瀏覽器網站設定中允許使用相機。',
  NotFoundError: '找不到相機，可改用圖片辨識。',
  NotReadableError: '相機正被其他程式使用或無法開啟，請關閉其他程式後重試。',
  OverconstrainedError: '此鏡頭無法使用，已改回預設鏡頭，請重新開啟相機。',
};

function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}
const icons = {
  camera: <Icon><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Icon>,
  stop: <Icon><rect x="7" y="7" width="10" height="10" rx="1.5" /></Icon>,
  image: <Icon><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m5 17 5-5 4 4 2-2 3 3" /></Icon>,
  pause: <Icon><path d="M9 6v12M15 6v12" /></Icon>,
  play: <Icon><path d="M8 6l10 6-10 6z" /></Icon>,
  torch: <Icon><path d="M8 3h8l-1 6H9zM9 9h6v4l-1.5 8h-3L9 13z" /></Icon>,
};

function ToolButton({ label, icon, pressed, onClick }: { label: string; icon: ReactNode; pressed?: boolean; onClick: () => void }) {
  return <button type="button" className="tool-button" aria-pressed={pressed} title={label} onClick={onClick}>{icon}<span className="tool-label">{label}</span></button>;
}

export default function ScannerApp() {
  const [config, setConfig] = useState<Config>({ group: 'code', scope: 'auto', family: 'DICT_4X4_50', extended: false });
  const configRef = useRef(config);
  const [cameraState, setCameraState] = useState<CameraState>('off');
  const [notice, setNotice] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [preview, setPreview] = useState('');
  const [history, setHistory] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);
  // index pins one copy when the same ID appears more than once; -1 matches every copy.
  const [selectedMarker, setSelectedMarker] = useState<Pick | null>(null);
  const [reveal, setReveal] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torch, setTorch] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [metrics, setMetrics] = useState({ video: 0, decode: 0 });
  const [showMetrics, setShowMetrics] = useState(false);
  const [vibrate, setVibrate] = useState(true);
  const [compact, setCompact] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const advancedRef = useRef<HTMLDetailsElement>(null);
  const promptButton = useRef<HTMLButtonElement>(null);
  const focusPrompt = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const streamEpoch = useRef(0);
  const generation = useRef(0);
  const alive = useRef(true);
  const busy = useRef(false);
  const frozenRef = useRef(false);
  const vibrateRef = useRef(vibrate);
  const previewRef = useRef('');
  const imageRef = useRef<HTMLImageElement | null>(null);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadImageRef = useRef<(file: File) => void>(() => {});
  const tracker = useRef(new ScanTracker());
  const barcode = useRef<BarcodeDetector | null>(null);
  const april = useRef<AprilTagDetector | null>(null);
  const aruco = useRef(new Map<string, Promise<ArucoDetector>>());

  const showToast = useCallback((next: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), next.action ? 6000 : 1800);
  }, []);
  const clearOverlay = useCallback(() => {
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = null;
    setOverlay(null);
  }, []);
  const clearPreview = useCallback(() => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = ''; imageRef.current = null; setPreview('');
  }, []);
  const stopCamera = useCallback(() => {
    streamEpoch.current++; generation.current++;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    clearOverlay(); tracker.current.reset();
    frozenRef.current = false; setFrozen(false);
    setTorch(false); setTorchAvailable(false); setCameraState('off');
    setMetrics({ video: 0, decode: 0 });
  }, [clearOverlay]);

  const decode = useCallback(async (frame: ImageData, options: Config, exhaustive: boolean): Promise<Detection[]> => {
    const { width, height, data } = frame;
    if (options.group === 'marker' && options.family !== 'APRILTAG_36h11') {
      const family = options.family;
      const cacheKey = family.startsWith('DICT_') ? 'opencv' : family;
      let pending = aruco.current.get(cacheKey);
      if (!pending) {
        aruco.current.forEach(previous => { void previous.then(detector => detector.free()).catch(() => {}); });
        aruco.current.clear();
        pending = createArucoDetector(family); aruco.current.set(cacheKey, pending);
      }
      try {
        const detector = await pending;
        return (await detector.detect(width, height, data, family)).map(marker => ({
          text: String(marker.id), format: 'ArUco ' + ARUCO_FAMILY_DEFINITIONS[family].label,
          points: marker.corners, opencvDictionary: ARUCO_FAMILY_DEFINITIONS[family].opencvDictionary,
        }));
      } catch (error) {
        aruco.current.delete(cacheKey);
        void pending.then(detector => detector.free()).catch(() => {});
        throw error;
      }
    }
    if (options.group === 'marker') {
      const detector = april.current ?? (april.current = new AprilTagDetector());
      try {
        return (await detector.detect(width, height, data)).map(marker => ({
          text: String(marker.id), format: 'AprilTag 36h11', points: marker.corners, opencvDictionary: 'DICT_APRILTAG_36h11',
        }));
      } catch (error) {
        if (april.current === detector) april.current = null;
        detector.free(); throw error;
      }
    }
    const detector = barcode.current ?? (barcode.current = new BarcodeDetector());
    try {
      return await detector.detect(width, height, data, { mode: options.scope, extended: options.extended, exhaustive });
    } catch (error) {
      if (barcode.current === detector) barcode.current = null;
      detector.free(); throw error;
    }
  }, []);

  const accept = useCallback((detections: Detection[], width: number, height: number, source: 'camera' | 'image', still: boolean) => {
    const now = Date.now();
    const { visible, fresh } = tracker.current.observe(detections, now, still);
    if (visible.length) {
      setOverlay({ width, height, shapes: visible });
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
      overlayTimer.current = still ? null : setTimeout(() => setOverlay(null), 350);
      const found = '找到 ' + visible.length + ' 個' + (still && visible.length > 1 ? '，點選框線查看' : '');
      setNotice(still && source === 'camera' ? '已暫停 · ' + found : found);
    } else if (still) {
      clearOverlay();
      setNotice(source === 'image' ? '未找到可辨識的內容，可換個模式或使用更清晰的圖片。' : '已暫停 · 此畫面未找到內容');
    } else setNotice('掃描中');
    if (fresh.length) {
      const entries = fresh.map((item, index) => ({ ...item, id: now + '-' + index, scannedAt: now, source }));
      setHistory(current => [...entries, ...current].slice(0, 100));
      if (configRef.current.group === 'code') { setSelected(entries[0]); setReveal(false); }
      if (source === 'camera' && !still && vibrateRef.current) navigator.vibrate?.(30);
    }
  }, [clearOverlay]);

  const scanStill = useCallback(async (media: HTMLImageElement | HTMLVideoElement, width: number, height: number, source: 'camera' | 'image', token: number) => {
    while (busy.current && alive.current && token === generation.current) {
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    if (!alive.current || token !== generation.current || !width || !height) return;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 2560 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(media, 0, 0, canvas.width, canvas.height);
    busy.current = true;
    try {
      const results = await decode(context.getImageData(0, 0, canvas.width, canvas.height), { ...configRef.current }, true);
      if (alive.current && token === generation.current) accept(results, canvas.width, canvas.height, source, true);
    } catch {
      if (alive.current && token === generation.current) setNotice(source === 'image' ? '辨識暫時失敗，請重新選擇圖片。' : '辨識暫時失敗，請繼續掃描後再暫停。');
    } finally {
      busy.current = false;
    }
  }, [accept, decode]);

  const changeConfig = (patch: Partial<Config>) => {
    configRef.current = { ...configRef.current, ...patch }; setConfig(configRef.current);
    const token = ++generation.current;
    clearOverlay(); setSelectedMarker(null);
    const video = videoRef.current;
    if (imageRef.current) { setNotice('圖片辨識中…'); void scanStill(imageRef.current, imageRef.current.naturalWidth, imageRef.current.naturalHeight, 'image', token); }
    else if (frozenRef.current && video) { setNotice('已暫停，正在分析此畫面…'); void scanStill(video, video.videoWidth, video.videoHeight, 'camera', token); }
  };

  const startCamera = useCallback(async (requestedDevice = '') => {
    stopCamera(); clearPreview();
    const token = streamEpoch.current;
    setCameraState('starting'); setNotice('正在開啟相機…');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('HTTPS');
      const next = await navigator.mediaDevices.getUserMedia({
        audio: false, video: {
          ...(requestedDevice ? { deviceId: { exact: requestedDevice } } : { facingMode: { ideal: 'environment' } }),
          width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 },
        },
      });
      if (!alive.current || token !== streamEpoch.current) { next.getTracks().forEach(track => track.stop()); return; }
      stream.current = next;
      const video = videoRef.current;
      if (!video) { next.getTracks().forEach(track => track.stop()); return; }
      video.srcObject = next; await video.play();
      if (!alive.current || token !== streamEpoch.current) return;
      const track = next.getVideoTracks()[0];
      track.onended = () => { if (stream.current === next) { stopCamera(); setNotice('相機已中斷，請重新開啟。'); } };
      const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
      setTorchAvailable(Boolean(capabilities?.torch)); setDeviceId(track.getSettings().deviceId ?? requestedDevice);
      setCameraState('scanning'); setNotice('掃描中');
      try {
        const available = await navigator.mediaDevices.enumerateDevices();
        if (alive.current && token === streamEpoch.current) setDevices(available.filter(device => device.kind === 'videoinput'));
      } catch { /* Device labels are optional. */ }
    } catch (error) {
      if (!alive.current || token !== streamEpoch.current) return;
      stopCamera(); setCameraState('error');
      // A lens that cannot open must not stay selected, or every retry would request it again.
      if (requestedDevice) setDeviceId('');
      setNotice(error instanceof DOMException ? cameraErrors[error.name] ?? '相機開啟失敗，請重試。' : '相機需要 HTTPS 或 localhost 連線；目前仍可使用圖片辨識。');
    }
  }, [clearPreview, stopCamera]);

  useEffect(() => {
    if (cameraState !== 'scanning' || frozen) return;
    const video = videoRef.current; if (!video) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return;
    let cancelled = false, callback = 0, lastTime = -1, lastAttempt = 0, retryAfter = 0;
    let attempts = 0, frames = 0, decoded = 0, measuredAt = performance.now();
    const nativeFrames = typeof video.requestVideoFrameCallback === 'function';
    const schedule = () => { callback = nativeFrames ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick); };
    const tick = (now: number) => {
      if (cancelled) return;
      schedule();
      if (video.currentTime === lastTime || video.readyState < 2) return;
      lastTime = video.currentTime; frames++;
      if (now - measuredAt >= 1000) {
        const seconds = (now - measuredAt) / 1000;
        setMetrics({ video: Math.round(frames / seconds), decode: Math.round(decoded / seconds) });
        measuredAt = now; frames = 0; decoded = 0;
      }
      if (busy.current || now < retryAfter || now - lastAttempt < 40) return;
      lastAttempt = now;
      const options = { ...configRef.current }, token = generation.current;
      const exhaustive = ++attempts % 8 === 0;
      const legacyTag = options.group === 'marker' && !options.family.startsWith('DICT_');
      const edge = legacyTag ? 960 : exhaustive ? 1920 : 1280;
      const scale = Math.min(1, edge / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      busy.current = true;
      void decode(frame, options, exhaustive).then(results => {
        if (!cancelled && token === generation.current) { decoded++; accept(results, frame.width, frame.height, 'camera', false); }
      }).catch(() => {
        if (!cancelled && token === generation.current) {
          clearOverlay(); retryAfter = performance.now() + 1000; setNotice('辨識器重新載入中…');
        }
      }).finally(() => { busy.current = false; });
    };
    schedule();
    return () => { cancelled = true; if (nativeFrames) video.cancelVideoFrameCallback(callback); else cancelAnimationFrame(callback); };
  }, [accept, cameraState, clearOverlay, decode, frozen]);

  useEffect(() => {
    // The stop button unmounts when the camera stops; hand keyboard focus to the prompt instead of <body>.
    if (focusPrompt.current && cameraState === 'off' && !preview) { focusPrompt.current = false; promptButton.current?.focus(); }
  }, [cameraState, preview]);

  const toggleFreeze = () => {
    const video = videoRef.current; if (!video || cameraState !== 'scanning') return;
    const token = ++generation.current;
    if (frozenRef.current) {
      frozenRef.current = false; setFrozen(false); clearOverlay(); setSelectedMarker(null);
      void video.play().catch(() => {}); setNotice('掃描中');
      return;
    }
    frozenRef.current = true; setFrozen(true); video.pause();
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = null;
    setNotice('已暫停，正在分析此畫面…');
    void scanStill(video, video.videoWidth, video.videoHeight, 'camera', token);
  };

  const loadImage = async (file: File) => {
    if (!file.type.startsWith('image/')) { showToast({ text: '只支援圖片檔案' }); return; }
    stopCamera(); clearPreview();
    const url = URL.createObjectURL(file); previewRef.current = url;
    setPreview(url); setCameraState('image'); setNotice('圖片辨識中…');
    const image = new Image(); image.src = url;
    try {
      await image.decode();
      if (!alive.current || previewRef.current !== url) return;
      imageRef.current = image;
      await scanStill(image, image.naturalWidth, image.naturalHeight, 'image', generation.current);
    } catch {
      if (alive.current && previewRef.current === url) setNotice('圖片無法讀取，請選擇其他圖片。');
    }
  };
  useEffect(() => { loadImageRef.current = file => void loadImage(file); });

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0]; if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      if (track === stream.current?.getVideoTracks()[0]) setTorch(!torch);
    } catch { setTorchAvailable(false); showToast({ text: '此鏡頭無法控制手電筒' }); }
  };

  const selectedKey = selected ? keyOf(selected) : null;
  const highlight = useMemo<Pick | null>(() => config.group === 'marker' ? selectedMarker : selectedKey ? { key: selectedKey, index: -1 } : null, [config.group, selectedKey, selectedMarker]);
  useEffect(() => {
    const canvas = overlayRef.current; if (!canvas) return;
    const draw = () => {
      const context = canvas.getContext('2d'); if (!context) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio)); canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      context.clearRect(0, 0, canvas.width, canvas.height); if (!overlay) return;
      const scale = Math.min(canvas.width / overlay.width, canvas.height / overlay.height);
      const ox = (canvas.width - overlay.width * scale) / 2, oy = (canvas.height - overlay.height * scale) / 2;
      const tags = overlay.shapes.filter(shape => shape.opencvDictionary);
      const still = frozen || Boolean(preview);
      const budget = labelBudget(compact, still), minSide = (still ? 18 : 28) * ratio;
      let labels = 0;
      overlay.shapes.forEach((shape, shapeIndex) => {
        const focused = isPicked(highlight, overlay.shapes, shapeIndex);
        context.strokeStyle = focused ? '#5fd4ff' : '#c8ff32'; context.lineWidth = (focused ? 4 : 2) * ratio;
        context.beginPath();
        shape.points.forEach((point, index) => {
          if (index === 0) context.moveTo(ox + point.x * scale, oy + point.y * scale);
          else context.lineTo(ox + point.x * scale, oy + point.y * scale);
        });
        if (shape.points.length > 2) context.closePath();
        context.stroke();
        const readable = polygonMinSide(shape.points) * scale >= minSide;
        if (!shape.opencvDictionary || !shape.points.length || !(focused || (readable && (tags.length <= budget || labels < budget)))) return;
        labels++;
        const label = `ID ${shape.text}`;
        context.font = `600 ${14 * ratio}px system-ui`;
        context.textBaseline = 'middle';
        const padding = 5 * ratio, height = 24 * ratio;
        const width = context.measureText(label).width + padding * 2;
        const left = ox + Math.min(...shape.points.map(point => point.x)) * scale;
        const top = oy + Math.min(...shape.points.map(point => point.y)) * scale;
        const x = Math.max(0, Math.min(canvas.width - width, left));
        const y = Math.max(0, Math.min(canvas.height - height, top >= height + padding ? top - height - padding : top + padding));
        context.fillStyle = focused ? '#0b2a36' : '#182219'; context.fillRect(x, y, width, height);
        context.fillStyle = focused ? '#5fd4ff' : '#c8ff32'; context.fillText(label, x + padding, y + height / 2);
      });
    };
    draw(); const observer = new ResizeObserver(draw); observer.observe(canvas);
    return () => observer.disconnect();
  }, [compact, frozen, highlight, overlay, preview]);

  useEffect(() => {
    alive.current = true;
    const streamToken = streamEpoch;
    const decodeToken = generation;
    const detectors = aruco.current;
    const onHidden = () => {
      if (document.hidden && !previewRef.current) {
        stopCamera(); setNotice('頁面離開前景，相機已停止。');
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const menu = advancedRef.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find(item => item.type.startsWith('image/'));
      if (file) { event.preventDefault(); loadImageRef.current(file); }
    };
    const compactQuery = window.matchMedia('(max-width: 700px), (max-height: 650px)');
    const sheetQuery = window.matchMedia('(max-width: 700px) and (min-height: 501px)');
    const resize = () => { setCompact(compactQuery.matches); setSheet(sheetQuery.matches); };
    resize(); compactQuery.addEventListener('change', resize); sheetQuery.addEventListener('change', resize);
    document.addEventListener('visibilitychange', onHidden); window.addEventListener('paste', onPaste); document.addEventListener('pointerdown', onPointerDown);
    return () => {
      alive.current = false; streamToken.current++; decodeToken.current++;
      document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('paste', onPaste); document.removeEventListener('pointerdown', onPointerDown);
      compactQuery.removeEventListener('change', resize); sheetQuery.removeEventListener('change', resize);
      stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      barcode.current?.free(); barcode.current = null; april.current?.free(); april.current = null;
      detectors.forEach(pending => { void pending.then(detector => detector.free()).catch(() => {}); }); detectors.clear();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, [stopCamera]);

  const copyText = async (value: string, done: string) => {
    try { await navigator.clipboard.writeText(value); showToast({ text: done }); } catch { showToast({ text: '複製失敗，請重試' }); }
  };
  const download = (content: string, type: string, extension: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = 'tagscanner-' + new Date().toISOString().slice(0, 10) + '.' + extension; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const clearHistory = () => {
    const snapshot = { history, selected };
    setHistory([]); setSelected(null); tracker.current.reset();
    showToast({ text: '已清除紀錄', action: { label: '復原', run: () => { setHistory(current => [...current, ...snapshot.history].slice(0, 100)); setSelected(current => current ?? snapshot.selected); setToast(null); } } });
  };
  const selectEntry = (entry: Entry) => {
    if (config.group === 'marker') setSelectedMarker(current => current?.key === keyOf(entry) ? null : { key: keyOf(entry), index: -1 });
    else { setSelected(entry); setReveal(false); }
  };
  const pickShape = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!overlay) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(rect.width / overlay.width, rect.height / overlay.height);
    const point = {
      x: (event.clientX - rect.left - (rect.width - overlay.width * scale) / 2) / scale,
      y: (event.clientY - rect.top - (rect.height - overlay.height * scale) / 2) / scale,
    };
    const index = overlay.shapes.findIndex(item => pointInPolygon(point, item.points)); if (index < 0) return;
    const shape = overlay.shapes[index];
    if (config.group === 'marker') { setSelectedMarker({ key: keyOf(shape), index }); return; }
    setSelected(history.find(entry => keyOf(entry) === keyOf(shape)) ?? { ...shape, id: 'pick-' + Date.now(), scannedAt: Date.now(), source: preview ? 'image' : 'camera' });
    setReveal(false); if (sheet) setSheetOpen(true);
  };
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault(); setDragging(true);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void loadImage(file);
  };

  const live = cameraState === 'scanning';
  const markers = config.group === 'marker' ? (overlay?.shapes ?? []).map((shape, index) => ({ ...shape, index })).sort((a, b) => Number(a.text) - Number(b.text)) : [];
  const payload = selected ? parsePayload(selected.text, selected.format) : null;
  const names = cameraNames(devices.map(device => device.label));
  const peek = sheet && !sheetOpen;
  const renderAction = (action: PayloadAction, primary: boolean) => action.kind === 'open'
    ? isOpenable(action.value) && <a key={action.label} className={'button' + (primary ? ' is-primary' : '')} href={action.value} {...(/^https?:/i.test(action.value) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{action.label}</a>
    : <button key={action.label} type="button" className={primary ? 'is-primary' : undefined} onClick={() => void copyText(action.value, '已複製')}>{action.label}</button>;

  return (
    <div className={'scanner-workspace' + (sheet && sheetOpen ? ' sheet-open' : '')} onDragOver={onDragOver} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop}>
      <section className="camera-panel" aria-label="掃描器">
        <div className="mode-bar">
          <div className="segmented" role="group" aria-label="掃描類型">
            <button type="button" aria-pressed={config.group === 'code'} onClick={() => changeConfig({ group: 'code' })}>掃碼</button>
            <button type="button" aria-pressed={config.group === 'marker'} onClick={() => changeConfig({ group: 'marker' })}>定位標記</button>
          </div>
          {config.group === 'code'
            ? <select aria-label="格式範圍" value={config.scope} onChange={event => changeConfig({ scope: event.target.value as Scope })}>{scopes.map(scope => <option key={scope.id} value={scope.id}>{scope.label}</option>)}</select>
            : <select aria-label="標記字典" title={dictionaryOf(config.family)} value={config.family} onChange={event => changeConfig({ family: event.target.value as Family })}>
              {familyGroups.map(group => <optgroup key={group.label} label={group.label}>{group.families.map(family => <option key={family} value={family}>{familyOption(family)}</option>)}</optgroup>)}
            </select>}
          <details className="advanced" ref={advancedRef}>
            <summary>進階</summary>
            <div className="advanced-menu">
              {config.group === 'code' && <label className="check-option"><input type="checkbox" checked={config.extended} onChange={event => changeConfig({ extended: event.target.checked })} />包含少見格式（Micro QR、rMQR、DataBar）</label>}
              {config.group === 'marker' && <p className="muted">OpenCV 名稱：<code>{dictionaryOf(config.family)}</code></p>}
              <label className="check-option"><input type="checkbox" checked={vibrate} onChange={event => { vibrateRef.current = event.target.checked; setVibrate(event.target.checked); }} />掃到新內容時震動（支援的裝置）</label>
              <label className="check-option"><input type="checkbox" checked={showMetrics} onChange={event => setShowMetrics(event.target.checked)} />顯示效能數據</label>
            </div>
          </details>
        </div>
        <div className={'viewfinder' + (dragging ? ' is-dragging' : '')} onClick={pickShape}>
          <video autoPlay muted playsInline ref={videoRef} className={'scanner-media ' + (live ? '' : 'is-hidden')} />
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="待辨識圖片" className="scanner-media" />
          )}
          <canvas ref={overlayRef} className="scanner-overlay" aria-hidden="true" data-shapes={overlay?.shapes.length ?? 0} />
          <p className={'status-chip' + (live || preview ? '' : ' sr-only')} role="status">
            {notice}{showMetrics && live && !frozen && <span className="metrics"> · {metrics.video} fps · 辨識 {metrics.decode}/s</span>}
          </p>
          {!live && !preview && <div className="camera-prompt">
            <LogoMark className="prompt-mark" />
            <p>開啟相機掃描，或選擇圖片</p>
            <button ref={promptButton} className="primary-action" type="button" disabled={cameraState === 'starting'} onClick={() => void startCamera(deviceId)}>{cameraState === 'starting' ? '開啟中…' : '開啟相機'}</button>
            {notice && cameraState !== 'starting' && <p className={cameraState === 'error' ? 'prompt-error' : 'prompt-note'}>{notice}</p>}
            {!compact && <p className="prompt-note">也可以把圖片拖放到這裡，或直接貼上（Ctrl+V）</p>}
          </div>}
          {dragging && <div className="drop-hint">放開以辨識圖片</div>}
          <div className="viewfinder-toolbar" onClick={event => event.stopPropagation()}>
            {live ? <ToolButton label="停止相機" icon={icons.stop} onClick={() => { focusPrompt.current = true; stopCamera(); setNotice('相機已停止'); }} />
              : preview ? <ToolButton label="開啟相機" icon={icons.camera} onClick={() => void startCamera(deviceId)} /> : null}
            <ToolButton label="選擇圖片" icon={icons.image} onClick={() => fileRef.current?.click()} />
            {live && <ToolButton label={frozen ? '繼續掃描' : '暫停畫面'} icon={frozen ? icons.play : icons.pause} pressed={frozen} onClick={toggleFreeze} />}
            {live && torchAvailable && <ToolButton label="手電筒" icon={icons.torch} pressed={torch} onClick={() => void toggleTorch()} />}
            {live && devices.length > 1 && <select className="camera-select" aria-label="選擇鏡頭" value={deviceId} onChange={event => { setDeviceId(event.target.value); void startCamera(event.target.value); }}>
              {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{names[index]}</option>)}
            </select>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void loadImage(file); }} />
        </div>
      </section>
      <aside className={'details-panel' + (peek ? ' is-peek' : '')} aria-label="結果與紀錄">
        {sheet && <button type="button" className="sheet-handle" aria-expanded={sheetOpen} onClick={() => setSheetOpen(!sheetOpen)}>
          <span className="grip" aria-hidden="true" />{sheetOpen ? '收合' : '展開結果與紀錄'}<span className="count">{history.length}</span>
        </button>}
        <div className="details-body">
          {config.group === 'marker' ? <section className="marker-section" aria-label="畫面中的標記">
            <header className="section-head"><h2>畫面中的標記</h2><span className="count">{markers.length}</span><span className="section-note">{familyOption(config.family)}</span></header>
            {markers.length ? <ul className="marker-list">{markers.map((marker, index) => {
              const picked = isPicked(selectedMarker, overlay?.shapes ?? [], marker.index);
              return <li key={keyOf(marker) + index}><button type="button" aria-pressed={picked} onClick={() => setSelectedMarker(picked ? null : { key: keyOf(marker), index: marker.index })}><strong>ID {marker.text}</strong></button></li>;
            })}</ul> : <p className="muted">{live ? '畫面中沒有標記' : '開啟相機或選擇圖片後，畫面中的標記會列在這裡。'}</p>}
            {!peek && <div className="result-actions">
              <button type="button" disabled={!markers.length} onClick={() => overlay && void copyText(JSON.stringify({
                frame: { width: overlay.width, height: overlay.height }, dictionary: dictionaryOf(config.family),
                markers: markers.map(marker => ({ id: Number(marker.text), corners: marker.points.map(point => [Math.round(point.x * 10) / 10, Math.round(point.y * 10) / 10]) })),
              }, null, 2), '已複製座標')}>複製座標（JSON）</button>
              <button type="button" onClick={() => void copyText(createOpenCvDetectionSnippet(dictionaryOf(config.family)), '已複製 OpenCV 程式碼')}>複製 OpenCV 程式碼</button>
            </div>}
            {live && !frozen && !peek && markers.length > 0 && <p className="muted">暫停畫面可固定位置並顯示所有 ID。</p>}
          </section> : <section className="result-section" aria-label="結果">
            {selected && payload ? <article className="result-card">
              <header className="result-head"><span className="result-type">{payload.title}</span><span className="result-format">{selected.format}</span><time>{timeOf(selected.scannedAt)}</time></header>
              {payload.type === 'text' ? <p className="result-raw">{selected.text}</p> : <>
                {payload.fields.length > 0 && <dl className="result-fields">{payload.fields.map((item, index) => <div key={item.label + index}>
                  <dt>{item.label}</dt>
                  <dd>{item.secret && !reveal ? '••••••••' : item.value}{item.secret && <button type="button" className="link-button" onClick={() => setReveal(!reveal)}>{reveal ? '隱藏' : '顯示'}</button>}</dd>
                </div>)}</dl>}
                {!peek && <details className="result-source"><summary>原始內容</summary><p className="result-raw">{payload.fields.some(item => item.secret) && !reveal ? '（含密碼，按「顯示」後可查看）' : selected.text}</p></details>}
              </>}
              <div className="result-actions">
                {payload.actions.map((action, index) => renderAction(action, index === 0))}
                {!peek && <button type="button" onClick={() => void copyText(selected.text, '已複製全部內容')}>複製全部內容</button>}
                {!peek && selected.opencvDictionary && <button type="button" onClick={() => void copyText(createOpenCvDetectionSnippet(selected.opencvDictionary!), '已複製 OpenCV 程式碼')}>複製 OpenCV 程式碼</button>}
              </div>
            </article> : <div className="empty-result"><h2>尚未掃描到內容</h2><p>掃到的內容會顯示在這裡</p></div>}
          </section>}
          {!peek && <section className="history-section" aria-label="紀錄">
            <header className="section-head">
              <h2>紀錄</h2><span className="count">{history.length}</span>
              <div className="section-actions">
                <button type="button" disabled={!history.length} onClick={() => download(historyToCsv(history), 'text/csv', 'csv')}>匯出 CSV</button>
                <button type="button" disabled={!history.length} onClick={() => download(JSON.stringify(history, null, 2), 'application/json', 'json')}>JSON</button>
                <button type="button" disabled={!history.length} onClick={clearHistory}>清除紀錄</button>
              </div>
            </header>
            {history.length ? <ol className="history-list">{history.map(entry => <li key={entry.id}>
              <button type="button" aria-current={config.group === 'code' ? selected?.id === entry.id : selectedMarker?.key === keyOf(entry)} onClick={() => selectEntry(entry)}>
                <span className="history-format">{entry.format}</span><time>{timeOf(entry.scannedAt)}</time>
                <span className="history-text">{historySummary(entry)}</span>
              </button>
            </li>)}</ol> : <p className="muted">尚無紀錄。紀錄只保留在目前分頁，重新整理後清除。</p>}
          </section>}
        </div>
      </aside>
      {toast && <div className="toast" role="status">{toast.text}{toast.action && <button type="button" onClick={toast.action.run}>{toast.action.label}</button>}</div>}
    </div>
  );
}
