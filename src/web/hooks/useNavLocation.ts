const STORAGE_KEY = 'nav-location';

export type NavLocation = { kind: 'home' } | { kind: 'folder'; categoryId: number };

export function parseNavLocation(raw: string | null): NavLocation {
  if (!raw) {
    return { kind: 'home' };
  }

  try {
    const parsed = JSON.parse(raw) as { kind?: string; categoryId?: number };
    const categoryId = parsed.categoryId;
    if (
      parsed.kind === 'folder' &&
      typeof categoryId === 'number' &&
      Number.isInteger(categoryId) &&
      categoryId > 0
    ) {
      return { kind: 'folder', categoryId };
    }
  } catch {
    /* ignore */
  }

  return { kind: 'home' };
}

export function readNavLocation(): NavLocation {
  try {
    return parseNavLocation(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { kind: 'home' };
  }
}

export function writeNavLocation(location: NavLocation) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
  } catch {
    /* ignore */
  }
}
