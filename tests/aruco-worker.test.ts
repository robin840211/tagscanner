import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { describe, expect, it, vi, afterEach } from 'vitest';
import fixtures from './fixtures/aruco-bits.json';
import { ArucoWorkerClient } from '../app/aruco-worker-client';
import { createArucoDetector } from '../app/aruco-engine';

const script = readFileSync(new URL('../public/vendor/aruco/worker.js', import.meta.url), 'utf8');
const cvReady = createRequire(import.meta.url)('@techstark/opencv-js');
async function harness() {
  const responses: Array<{ ok: boolean; error?: string; result?: Array<{ id: number; corners: { x: number; y: number }[] }> }> = [];
  const scope = { cv: await cvReady, postMessage: (value: typeof responses[number]) => responses.push(value),
    onmessage: null as unknown as (event: { data: Record<string, unknown> }) => Promise<void> };
  vm.runInNewContext(script, { self: scope, importScripts: () => {}, Uint8Array });
  await scope.onmessage({ data: { type: 'init', id: 0 } });
  expect(responses.pop()?.ok).toBe(true);
  return async (frame: Record<string, unknown>) => {
    await scope.onmessage({ data: { type: 'detect', id: 1, ...frame } });
    return responses.pop()!;
  };
}

function markerFrame(bits: number[][], rotation = 0) {
  const width = 200, pixels = new Uint8Array(width * width).fill(255);
  const size = bits.length;
  for (let y = 0; y < size + 2; y++) for (let x = 0; x < size + 2; x++) {
    let bx = x - 1, by = y - 1;
    const border = x === 0 || y === 0 || x === size + 1 || y === size + 1;
    for (let r = 0; r < rotation; r++) [bx, by] = [by, size - 1 - bx];
    const value = border ? 0 : bits[by][bx] * 255;
    for (let dy = 0; dy < 20; dy++) for (let dx = 0; dx < 20; dx++) pixels[(20 + y * 20 + dy) * width + 20 + x * 20 + dx] = value;
  }
  return { width, height: width, pixels: pixels.buffer };
}

describe('OpenCV ArUco worker', () => {
  it.each([4, 5])('decodes %i-cell dictionary capacities and rotations using OpenCV 4.11 reference bits', async size => {
    const detect = await harness();
    const bits = fixtures[String(size) as keyof typeof fixtures];
    for (const capacity of [50, 100, 250, 1000]) {
      const id = capacity - 1;
      for (let rotation = 0; rotation < 4; rotation++) {
        const result = await detect({ ...markerFrame(bits[String(id) as keyof typeof bits], rotation), family: `DICT_${size}X${size}_${capacity}` });
        expect(result.ok).toBe(true);
        expect(result.result?.map(marker => marker.id)).toEqual([id]);
        expect(result.result?.[0].corners).toHaveLength(4);
      }
    }
  });
  it('switches grid size and rejects invalid input and out-of-range IDs', async () => {
    const detect = await harness();
    expect((await detect({ ...markerFrame(fixtures['4']['99']), family: 'DICT_4X4_50' })).result).toEqual([]);
    expect((await detect({ ...markerFrame(fixtures['5']['3']), family: 'DICT_5X5_50' })).result?.[0].id).toBe(3);
    expect((await detect({ ...markerFrame(fixtures['4']['0']), family: 'DICT_4X4_50' })).result?.[0].id).toBe(0);
    expect((await detect({ width: 200, height: 200, pixels: new Uint8Array(40000).fill(255).buffer, family: 'DICT_5X5_50' })).result).toEqual([]);
    expect((await detect({ ...markerFrame(fixtures['4']['0']), family: 'UNKNOWN' })).ok).toBe(false);
    expect((await detect({ width: 2, height: 2, pixels: new ArrayBuffer(1) })).ok).toBe(false);
    expect((await detect({ ...markerFrame(fixtures['4']['0']), family: 'DICT_5X5_50' })).result).toEqual([]);
    expect((await detect({ ...markerFrame(fixtures['5']['3']), family: 'DICT_4X4_50' })).result).toEqual([]);
  });
});

class FakeWorker {
  static latest: FakeWorker;
  listeners = new Map<string, (event: { data: unknown }) => void>();
  requests: Record<string, unknown>[] = [];
  terminated = false;
  constructor() { FakeWorker.latest = this; }
  addEventListener(name: string, callback: (event: { data: unknown }) => void) { this.listeners.set(name, callback); }
  postMessage(request: Record<string, unknown>) { this.requests.push(request); }
  terminate() { this.terminated = true; }
  reply(data: unknown) { this.listeners.get('message')!({ data }); }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('ArUco worker lifecycle', () => {
  it('uses one worker while switching OpenCV dictionaries', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const detector = await createArucoDetector('DICT_4X4_50');
    const worker = FakeWorker.latest;
    worker.reply({ id: 1, ok: true });
    for (const family of ['DICT_4X4_50', 'DICT_5X5_1000'] as const) {
      const detection = detector.detect(1, 1, new Uint8Array(4), family);
      await Promise.resolve();
      const request = worker.requests.at(-1)!;
      expect(request.family).toBe(family);
      worker.reply({ id: request.id, ok: true, result: [] });
      await expect(detection).resolves.toEqual([]);
      expect(FakeWorker.latest).toBe(worker);
      expect(worker.terminated).toBe(false);
    }
    detector.free(); expect(worker.terminated).toBe(true);
  });
  it('rejects overlap and frees outstanding work immediately', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const client = new ArucoWorkerClient(), worker = FakeWorker.latest;
    worker.reply({ id: 1, ok: true }); await client.ready;
    const pending = client.detect(1, 1, new Uint8Array(4), 'DICT_4X4_50');
    const assertion = expect(pending).rejects.toThrow('freed');
    await expect(client.detect(1, 1, new Uint8Array(4), 'DICT_5X5_50')).rejects.toThrow('already');
    client.free(); await assertion; expect(worker.terminated).toBe(true);
  });
  it('terminates on initialization timeout and permits a fresh client', async () => {
    vi.useFakeTimers(); vi.stubGlobal('Worker', FakeWorker);
    const client = new ArucoWorkerClient(), worker = FakeWorker.latest;
    const assertion = expect(client.ready).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(30001); await assertion; expect(worker.terminated).toBe(true);
    const fresh = new ArucoWorkerClient(); FakeWorker.latest.reply({ id: 1, ok: true });
    await fresh.ready; fresh.free();
  });
  it('handles startup failures and invalid frames', async () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('blocked'); } });
    const client = new ArucoWorkerClient();
    await expect(client.ready).rejects.toThrow('blocked');
    await expect(client.detect(2, 2, new Uint8Array(4), 'DICT_4X4_50')).rejects.toThrow('Invalid');
  });
});
