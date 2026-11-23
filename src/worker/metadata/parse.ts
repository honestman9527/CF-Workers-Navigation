import type { FaviconOpts, MetadataResult, MetadataShape } from './types';

import { isHttpUrl, isSafePublicHttpUrl } from '../validation';
import { normalizeLanguage, selectCleanText, splitKeywords } from './clean';
import {
  createCollectedMeta,
  drainTransformedResponse,
  HeadEndHandler,
  HtmlLanguageHandler,
  MetadataElementHandler,
  readMetadataBytes,
  TitleHandler,
} from './collect';

/** 抓取与结果组装：安全重定向校验、有界 HTTP 读取、fallback 与公开入口。 */

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_TITLE_LENGTH = 140;
const MAX_DESCRIPTION_LENGTH = 320;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function parseContentLength(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function resolveSafeHttpUrl(href: string, baseUrl: string): string {
  try {
    const resolved = new URL(href, baseUrl).toString();
    return isHttpUrl(resolved) ? resolved : '';
  } catch {
    return '';
  }
}

async function fetchWithSafeRedirects(
  initialUrl: string,
): Promise<{ response: Response; finalUrl: string } | null> {
  let currentUrl = initialUrl;
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isSafePublicHttpUrl(currentUrl)) {
      return null;
    }

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NavBookmarkBot/1.0)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'manual',
      });
    } catch {
      return null;
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('Location');
      await response.body?.cancel().catch(() => undefined);
      if (!location || hop === MAX_REDIRECTS) {
        return null;
      }
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        return null;
      }
      continue;
    }

    const finalUrl = response.url || currentUrl;
    if (!isSafePublicHttpUrl(finalUrl)) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }

    return { response, finalUrl };
  }

  return null;
}

async function parseHtmlMetadata(url: string): Promise<MetadataShape | null> {
  const fetched = await fetchWithSafeRedirects(url);
  if (!fetched) {
    return null;
  }
  const { response, finalUrl } = fetched;

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }

  const contentLength = parseContentLength(response.headers.get('Content-Length'));
  if (contentLength !== null && contentLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }

  const contentType = (response.headers.get('Content-Type') ?? '').toLowerCase();
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }

  const collected = createCollectedMeta();
  const headEndHandler = new HeadEndHandler();
  const metadataHandler = new MetadataElementHandler(collected);

  try {
    const bytes = await readMetadataBytes(response);
    const buffered = new Response(bytes, {
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'text/html' },
    });
    const transformed = new HTMLRewriter()
      .on('html', new HtmlLanguageHandler(collected))
      .on('head', headEndHandler)
      .on('title', new TitleHandler(collected))
      .on('meta', metadataHandler)
      .on('link', metadataHandler)
      .transform(buffered);

    await drainTransformedResponse(transformed, () => headEndHandler.isComplete());
  } catch {
    // Headers may have arrived before the remote body fails or its timeout fires.
    await response.body?.cancel().catch(() => undefined);
    return null;
  }

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
  const faviconUrl = collected.faviconUrl ? resolveSafeHttpUrl(collected.faviconUrl, finalUrl) : '';
  const canonicalUrl = collected.canonicalUrl
    ? resolveSafeHttpUrl(collected.canonicalUrl, finalUrl)
    : '';

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
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    hostname = parsed.hostname;
  } catch {
    return '';
  }
  if (!hostname) return '';
  return opts.faviconProxyUrl.replaceAll('{domain}', encodeURIComponent(hostname));
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
