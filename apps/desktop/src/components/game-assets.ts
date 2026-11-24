const MAPS = import.meta.glob<string>('../assets/maps/*.webp', { eager: true, import: 'default' });
const ICONS = import.meta.glob<string>('../assets/icons/*.webp', { eager: true, import: 'default' });

export function mapImageUrl(layerPath: string): string | undefined {
  return MAPS[`../assets/maps/${layerPath}.webp`];
}

const CAT_ICON_MAP: Record<string, string> = {
  bell: 'bell',
  weapon: 'weapon',
  accessory: 'accessory',
  challenge: 'challenge',
  amber: 'amber',
  blackstone: 'blackstone',
  flower: 'flower',
  key: 'key',
  treasure: 'chest',
};

const CHALLENGE_ARR_ICON: Record<string, string> = {
  RongShu: 'banyan',
  LongZhu: 'pillar',
  DaoCaoRen: 'scarecrow',
};

export function entryIconUrl(cat: string, arr?: string): string | undefined {
  const name = (cat === 'challenge' && arr && CHALLENGE_ARR_ICON[arr]) || CAT_ICON_MAP[cat] || 'chest';
  return ICONS[`../assets/icons/${name}.webp`];
}

export function categoryIconUrl(cat: string, extra = false): string | undefined {
  const name = extra ? (CAT_ICON_MAP[cat] ?? 'chest') : `cp-${cat}`;
  return ICONS[`../assets/icons/${name}.webp`] ?? ICONS[`../assets/icons/${CAT_ICON_MAP[cat] ?? 'chest'}.webp`];
}

export function mapBellIconUrl(): string | undefined {
  return ICONS['../assets/icons/mapbell.webp'] ?? ICONS['../assets/icons/bell.webp'];
}
