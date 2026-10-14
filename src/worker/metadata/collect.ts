import type { CollectedMeta } from './types';

import { cleanMetadataText, cleanUrlValue } from './clean';

/** HTMLRewriter 收集：title/language/meta/link 处理器与响应流排空。 */

const MAX_RAW_TITLE_LENGTH = 4096;
const MAX_OPEN_GRAPH_VALUE_LENGTH = 1024;
const MAX_PARSE_BYTES = 512 * 1024;

export function createCollectedMeta(): CollectedMeta {
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

export class HtmlLanguageHandler {
  constructor(private readonly collected: CollectedMeta) {}

  element(element: Element) {
    const lang = element.getAttribute('lang');
    if (lang && !this.collected.language) {
      this.collected.language = lang;
    }
  }
}

export class HeadEndHandler {
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

export class TitleHandler {
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

export class MetadataElementHandler {
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

/** Buffer at most the parse budget before handing bytes to HTMLRewriter.
 * Reading the remote stream separately ensures a body error cannot strand the rewriter output.
 */
export async function readMetadataBytes(response: Response): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let done = false;
  try {
    while (length < MAX_PARSE_BYTES) {
      const chunk = await reader.read();
      done = chunk.done;
      if (chunk.done) break;
      const bytes = chunk.value.subarray(0, MAX_PARSE_BYTES - length);
      chunks.push(bytes);
      length += bytes.byteLength;
    }
  } finally {
    if (!done) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function drainTransformedResponse(
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
