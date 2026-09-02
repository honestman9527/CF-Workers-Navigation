/** 将名称规范化为稳定 slug。保留中日韩等 Unicode 字母与数字字符。 */
export function slugify(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '');
}
