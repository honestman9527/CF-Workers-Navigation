import type { FaviconOpts, MetadataResult, MetadataShape } from './types';

import { normalizeLanguage, selectCleanText, splitKeywords } from './clean';
import {
  createCollectedMeta,
  drainTransformedResponse,
  HeadEndHandler,
  HtmlLanguageHandler,
  MetadataElementHandler,
  TitleHandler,
} from './collect';

/** 抓取与结果组装：HTTP 请求、SSRF/大小防护、fallback 与公开入口。 */

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_TITLE_LENGTH = 140;
const MAX_DESCRIPTION_LENGTH = 320;

function parseContentLength(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
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

  const iconUrl = faviconUrlFor(url, opts);

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

export function faviconUrlFor(url: string, opts: FaviconOpts): string {
  if (!opts.faviconProxyEnabled) return '';
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }
  return opts.faviconProxyUrl.replaceAll('{domain}', hostname);
}

export async function fetchBookmarkMetadata(
  url: string,
  opts: FaviconOpts,
): Promise<MetadataResult> {
  const parsed = await parseHtmlMetadata(url);

  if (parsed) {
    if (!parsed.iconUrl) parsed.iconUrl = faviconUrlFor(url, opts);
    return { ok: true, metadata: parsed };
  }

  const fallback = fallbackMetadata(url, opts);
  return { ok: true, metadata: fallback };
}
