import { rgbaToGrayscale } from './apriltag-engine';
import type { ArucoMarker } from './aruco-engine';
import type { OpenCvDictionaryName } from './opencv-reference';

type Pending = {
  id: number;
  resolve(value: ArucoMarker[]): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

export class ArucoWorkerClient {
  readonly ready: Promise<ArucoMarker[]>;
  private worker: Worker | null = null;
  private pending: Pending | null = null;
  private failure: Error | null = null;
  private nextId = 0;

  constructor() {
    try {
      this.worker = new Worker(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/vendor/aruco/worker.js`);
      this.worker.addEventListener('message', (event: MessageEvent) => {
        const response = event.data;
        const pending = this.pending;
        if (!pending || response.id !== pending.id) return;
        if (!response.ok) { this.fail(new Error(response.error || 'ArUco worker failed')); return; }
        clearTimeout(pending.timer); this.pending = null;
        pending.resolve(response.result ?? []);
      });
      this.worker.addEventListener('error', () => this.fail(new Error('ArUco worker failed')));
      this.worker.addEventListener('messageerror', () => this.fail(new Error('ArUco worker message failed')));
      this.ready = this.request({ type: 'init' }, [], 30_000);
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
      this.ready = Promise.reject(this.failure);
    }
    this.ready.catch(() => undefined);
  }

  private fail(error: Error) {
    if (this.failure) return;
    this.failure = error;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = null;
    }
    this.worker?.terminate(); this.worker = null;
  }

  private request(payload: Record<string, unknown>, transfer: Transferable[] = [], timeout = 8_000) {
    if (this.failure) return Promise.reject(this.failure);
    if (this.pending) return Promise.reject(new Error('ArUco detection is already in progress'));
    const id = ++this.nextId;
    return new Promise<ArucoMarker[]>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('ArUco worker timed out')), timeout);
      this.pending = { id, resolve, reject, timer };
      try { this.worker!.postMessage({ ...payload, id }, transfer); }
      catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  async detect(width: number, height: number, pixels: Uint8Array | Uint8ClampedArray, family: OpenCvDictionaryName) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
        width * height > 2560 * 2560 || pixels.byteLength !== width * height * 4) {
      throw new Error('Invalid ArUco frame');
    }
    await this.ready;
    const gray = rgbaToGrayscale(pixels);
    return this.request({ type: 'detect', width, height, pixels: gray.buffer, family }, [gray.buffer]);
  }

  free() { this.fail(new Error('ArUco detector was freed')); }
}
