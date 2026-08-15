export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugifyName(name) || `cat-${Math.random().toString(36).slice(2, 8)}`;
  if (!taken.has(base)) {
    return base;
  }

  let counter = 2;
  for (;;) {
    const candidate = `${base}-${counter}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}
