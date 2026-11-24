export function formatNumber(n: number): string {
  return new Intl.NumberFormat(undefined).format(n);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function formatPlayTime(seconds: number): string {
  if (!seconds || seconds < 0) return '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

export function formatEpochMs(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPbzStamp(raw: string): string {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})$/.exec(raw);
  if (!m) return raw || 'Unknown time';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const DIFFICULTIES: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Wayfarer (Story)' },
  { value: 1, label: 'Swordsman (Normal)' },
  { value: 2, label: 'Blade Master (Hard)' },
  { value: 3, label: 'Hellwalker (Extreme)' },
  { value: 4, label: 'Nightmare' },
];

export function difficultyLabel(val: number): string {
  return DIFFICULTIES.find((d) => d.value === val)?.label ?? `Difficulty ${val}`;
}
