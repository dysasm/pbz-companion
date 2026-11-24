import { describe, expect, it } from 'vitest';
import { difficultyLabel, formatBytes, formatPbzStamp, formatPlayTime } from '../src/lib/format';

describe('format helpers', () => {
  it('formats play time cleanly', () => {
    expect(formatPlayTime(0)).toBe('0m');
    expect(formatPlayTime(1800)).toBe('30m');
    expect(formatPlayTime(148032)).toBe('41h 7m');
  });

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(26 * 1024 * 1024)).toBe('26.00 MB');
  });

  it('parses PBZ timestamps', () => {
    expect(formatPbzStamp('2026.11.19-22.21.32')).toContain('2026');
    expect(formatPbzStamp('')).toBe('Unknown time');
  });

  it('maps difficulty labels', () => {
    expect(difficultyLabel(3)).toBe('Hellwalker (Extreme)');
    expect(difficultyLabel(4)).toBe('Nightmare');
  });
});
