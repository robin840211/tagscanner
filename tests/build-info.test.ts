import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBuildInfo } from '../app/build-info';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
const git = vi.mocked(execFileSync);
const commit = '1234567890abcdef1234567890abcdef12345678';

afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });

describe('version metadata', () => {
  it.each([
    ['2026-01-01T17:30:00Z', '2026-01-02'],
    ['2026-01-01T23:30:00+08:00', '2026-01-01'],
  ])('uses the commit date in Taipei for %s', (timestamp, date) => {
    git.mockReturnValue(`${commit}\r\n${timestamp}\r\n`);
    expect(getBuildInfo()).toEqual({ commit, shortHash: '1234567', date });
  });

  it.each(['unavailable', 'invalid hash', 'invalid date'])('falls back to the build date when Git is %s', (reason) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T17:30:00Z'));
    if (reason === 'unavailable') git.mockImplementation(() => { throw new Error('no git'); });
    else git.mockReturnValue(reason === 'invalid hash' ? 'not-a-hash\n2026-01-01' : `${commit}\ninvalid`);
    expect(getBuildInfo()).toEqual({ commit: '', shortHash: '', date: '2026-01-02' });
  });
});
