import type { MetadataPreview } from '../shared/api/types';

export type MetadataShape = MetadataPreview;

export type MetadataResult = { ok: true; metadata: MetadataShape } | { ok: false; error: string };

export type FaviconOpts = {
  faviconProxyUrl: string;
  faviconProxyEnabled: boolean;
};

type CollectedMeta = {
  title: string;
  description: string;
  keywords: string;
  language: string;
  faviconUrl: string;
  canonicalUrl: string;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
};

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_PARSE_BYTES = 512 * 1024;
const MAX_RAW_TITLE_LENGTH = 4096;
const MAX_TITLE_LENGTH = 140;
const MAX_DESCRIPTION_LENGTH = 320;
const MAX_OPEN_GRAPH_VALUE_LENGTH = 1024;
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

function createCollectedMeta(): CollectedMeta {
  return {
    title: '',
    description: '',
    keywords: '',
    language: '',
    faviconUrl: '',
    canonicalUrl: '',
    openGraph: {},
    twitter: {},
  };
}

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

function cleanMetadataText(value: string, maxLength: number): string {
  const normalized = replaceControlCharacters(decodeHtmlEntities(value))
    .replace(/\s+/g, ' ')
    .trim();
  const withoutScriptResidue = stripScriptResidue(normalized).replace(/\s+/g, ' ').trim();
  const deduped = collapseRepeatedPrefix(withoutScriptResidue).replace(/\s+/g, ' ').trim();

  return truncateText(deduped, maxLength);
}

function cleanUrlValue(value: string): string {
  return decodeHtmlEntities(value).trim();
}

function selectCleanText(candidates: Array<string | undefined>, maxLength: number): string {
  for (const candidate of candidates) {
    const cleaned = cleanMetadataText(candidate ?? '', maxLength);
    if (cleaned) {
      return cleaned;
    }
  }

  return '';
}

function normalizeLanguage(value: string): string {
  return cleanMetadataText(value, 32).split(',')[0]?.trim().replace(/_/g, '-').toLowerCase() ?? '';
}

function parseContentLength(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

class HtmlLanguageHandler {
  constructor(private readonly collected: CollectedMeta) {}

  element(element: Element) {
    const lang = element.getAttribute('lang');
    if (lang && !this.collected.language) {
      this.collected.language = lang;
    }
  }
}

class HeadEndHandler {
  private complete = false;

  element(element: Element) {
    element.onEndTag(() => {
      this.complete = true;
    });
  }

  isComplete(): boolean {
    return this.complete;
  }
}

class TitleHandler {
  private chunks: string[] = [];
  private currentLength = 0;

  constructor(private readonly collected: CollectedMeta) {}

  element(element: Element) {
    if (this.collected.title) {
      return;
    }

    this.chunks = [];
    this.currentLength = 0;
    element.onEndTag(() => {
      if (!this.collected.title) {
        this.collected.title = this.chunks.join('');
      }
    });
  }

  text(text: Text) {
    if (this.collected.title || this.currentLength >= MAX_RAW_TITLE_LENGTH) {
      return;
    }

    const chunk = text.text.slice(0, MAX_RAW_TITLE_LENGTH - this.currentLength);
    this.chunks.push(chunk);
    this.currentLength += chunk.length;
  }
}

class MetadataElementHandler {
  constructor(private readonly collected: CollectedMeta) {}

  element(element: Element) {
    const tag = element.tagName.toLowerCase();

    if (tag === 'meta') {
      this.handleMeta(element);
    }

    if (tag === 'link') {
      this.handleLink(element);
    }
  }

  private handleMeta(element: Element) {
    const name = (element.getAttribute('name') ?? '').toLowerCase();
    const property = (element.getAttribute('property') ?? '').toLowerCase();
    const httpEquiv = (element.getAttribute('http-equiv') ?? '').toLowerCase();
    const key = property || name;
    const rawContent = element.getAttribute('content') ?? '';
    const content = cleanMetadataText(rawContent, MAX_OPEN_GRAPH_VALUE_LENGTH);

    if (!content) {
      return;
    }

    if (key.startsWith('og:')) {
      this.collected.openGraph[key] = content;
    }

    if (key.startsWith('twitter:')) {
      this.collected.twitter[key] = content;
    }

    if (name === 'description' && !this.collected.description) {
      this.collected.description = content;
    } else if (name === 'keywords' && !this.collected.keywords) {
      this.collected.keywords = content;
    } else if (httpEquiv === 'content-language' && !this.collected.language) {
      this.collected.language = content;
    }
  }

  private handleLink(element: Element) {
    const rel = (element.getAttribute('rel') ?? '').toLowerCase();
    const href = cleanUrlValue(element.getAttribute('href') ?? '');

    if (!href) {
      return;
    }

    const relTokens = rel.split(/\s+/).filter(Boolean);
    if (relTokens.includes('canonical') && !this.collected.canonicalUrl) {
      this.collected.canonicalUrl = href;
    }

    if (
      relTokens.some((token) => token.includes('icon')) &&
      !this.collected.faviconUrl &&
      !href.toLowerCase().startsWith('data:')
    ) {
      this.collected.faviconUrl = href;
    }
  }
}

async function drainTransformedResponse(
  response: Response,
  shouldStop: () => boolean,
): Promise<void> {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  let done = false;
  let bytesRead = 0;

  try {
    while (bytesRead < MAX_PARSE_BYTES && !shouldStop()) {
      const chunk = await reader.read();
      done = chunk.done;

      if (chunk.done) {
        break;
      }

      bytesRead += chunk.value.byteLength;
    }
  } finally {
    if (!done) {
      await reader.cancel().catch(() => undefined);
    }
  }
}

function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function splitKeywords(raw: string): string[] {
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

async function parseHtmlMetadata(url: string): Promise<MetadataShape | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NavBot/1.0; +https://nav.7s.nz)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const contentLength = parseContentLength(response.headers.get('Content-Length'));
  if (contentLength !== null && contentLength > MAX_RESPONSE_BYTES) {
    return null;
  }

  const contentType = (response.headers.get('Content-Type') ?? '').toLowerCase();
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    return null;
  }

  const collected = createCollectedMeta();
  const headEndHandler = new HeadEndHandler();
  const metadataHandler = new MetadataElementHandler(collected);

  const transformed = new HTMLRewriter()
    .on('html', new HtmlLanguageHandler(collected))
    .on('head', headEndHandler)
    .on('title', new TitleHandler(collected))
    .on('meta', metadataHandler)
    .on('link', metadataHandler)
    .transform(response);

  await drainTransformedResponse(transformed, () => headEndHandler.isComplete());

  const title = selectCleanText(
    [collected.openGraph['og:title'], collected.twitter['twitter:title'], collected.title],
    MAX_TITLE_LENGTH,
  );

  if (!title) {
    return null;
  }

  const description = selectCleanText(
    [
      collected.openGraph['og:description'],
      collected.twitter['twitter:description'],
      collected.description,
    ],
    MAX_DESCRIPTION_LENGTH,
  );
  const keywords = splitKeywords(collected.keywords);
  const language = normalizeLanguage(collected.language);
  const faviconUrl = collected.faviconUrl ? resolveUrl(collected.faviconUrl, url) : '';
  const canonicalUrl = collected.canonicalUrl ? resolveUrl(collected.canonicalUrl, url) : '';

  return {
    url,
    title,
    description,
    iconUrl: faviconUrl,
    keywords,
    language,
    metadata: {
      page_url: url,
      canonical_url: canonicalUrl,
      keywords,
      language,
      open_graph: collected.openGraph,
    },
  };
}

function fallbackMetadata(url: string, opts: FaviconOpts): MetadataShape {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }

  let iconUrl = '';
  if (opts.faviconProxyEnabled) {
    iconUrl = opts.faviconProxyUrl.replace('{domain}', hostname);
  }

  return {
    url,
    title: hostname,
    description: '',
    iconUrl,
    keywords: [],
    language: '',
    partial: true,
    metadata: {
      page_url: url,
      canonical_url: '',
      keywords: [],
      language: '',
      open_graph: {},
    },
  };
}

export async function fetchBookmarkMetadata(
  url: string,
  opts: FaviconOpts,
): Promise<MetadataResult> {
  const parsed = await parseHtmlMetadata(url);

  if (parsed) {
    return { ok: true, metadata: parsed };
  }

  const fallback = fallbackMetadata(url, opts);
  return { ok: true, metadata: fallback };
}
