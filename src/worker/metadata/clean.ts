/** 文本清洗与解析辅助：HTML 实体、脚本残留、重复前缀、截断与关键词。 */

const MAX_KEYWORDS = 16;
const MAX_KEYWORD_LENGTH = 60;

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  hellip: '...',
  lt: '<',
  mdash: '-',
  nbsp: ' ',
  ndash: '-',
  quot: '"',
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();

    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }

    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }

    return HTML_ENTITIES[normalized] ?? match;
  });
}

function stripScriptResidue(value: string): string {
  const lower = value.toLowerCase();
  const markerIndexes = [
    lower.indexOf('<script'),
    lower.indexOf('</script'),
    lower.indexOf('{"@context"'),
    lower.indexOf("{'@context'"),
    lower.indexOf('"@context":'),
    lower.indexOf("'@context':"),
  ].filter((index) => index >= 0);

  const initCallIndex = value.search(/\b[A-Za-z_$][\w$]*\.init\s*\(/);
  if (initCallIndex >= 0) {
    markerIndexes.push(initCallIndex);
  }

  if (markerIndexes.length === 0) {
    return value;
  }

  const firstMarker = Math.min(...markerIndexes);
  return firstMarker === 0 ? '' : value.slice(0, firstMarker);
}

function collapseRepeatedPrefix(value: string): string {
  let collapsed = value;

  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;

    for (let length = Math.floor(collapsed.length / 2); length >= 12; length -= 1) {
      const prefix = collapsed.slice(0, length);
      const rest = collapsed.slice(length);

      if (rest.startsWith(prefix)) {
        collapsed = `${prefix}${rest.slice(prefix.length)}`.trim();
        changed = true;
        break;
      }
    }

    if (!changed) {
      return collapsed;
    }
  }

  return collapsed;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f ? ' ' : character;
  }).join('');
}

export function cleanMetadataText(value: string, maxLength: number): string {
  const normalized = replaceControlCharacters(decodeHtmlEntities(value))
    .replace(/\s+/g, ' ')
    .trim();
  const withoutScriptResidue = stripScriptResidue(normalized).replace(/\s+/g, ' ').trim();
  const deduped = collapseRepeatedPrefix(withoutScriptResidue).replace(/\s+/g, ' ').trim();

  return truncateText(deduped, maxLength);
}

export function cleanUrlValue(value: string): string {
  return decodeHtmlEntities(value).trim();
}

export function selectCleanText(candidates: Array<string | undefined>, maxLength: number): string {
  for (const candidate of candidates) {
    const cleaned = cleanMetadataText(candidate ?? '', maxLength);
    if (cleaned) {
      return cleaned;
    }
  }

  return '';
}

export function normalizeLanguage(value: string): string {
  return cleanMetadataText(value, 32).split(',')[0]?.trim().replace(/_/g, '-').toLowerCase() ?? '';
}

export function splitKeywords(raw: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const keyword of raw.split(',')) {
    const cleaned = cleanMetadataText(keyword, MAX_KEYWORD_LENGTH);
    const normalized = cleaned.toLowerCase();

    if (cleaned && !seen.has(normalized)) {
      keywords.push(cleaned);
      seen.add(normalized);
    }

    if (keywords.length >= MAX_KEYWORDS) {
      break;
    }
  }

  return keywords;
}
