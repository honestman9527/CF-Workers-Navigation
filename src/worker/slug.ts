/** 将名称规范化为稳定 slug。保留中日韩等 Unicode 字母与数字字符。 */
export function slugify(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '');
}

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugifyName(name) || `cat-${Math.random().toString(36).slice(2, 10)}`;
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
