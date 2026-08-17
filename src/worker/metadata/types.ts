import type { MetadataPreview } from '../../shared/api/types';

export type MetadataShape = MetadataPreview;

export type MetadataResult = { ok: true; metadata: MetadataShape } | { ok: false; error: string };

export type FaviconOpts = {
  faviconProxyUrl: string;
  faviconProxyEnabled: boolean;
};

export type CollectedMeta = {
  title: string;
  description: string;
  keywords: string;
  language: string;
  faviconUrl: string;
  canonicalUrl: string;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
};
