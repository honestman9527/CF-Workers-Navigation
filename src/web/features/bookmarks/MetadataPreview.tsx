import type { MetadataPreview as MetadataShape } from '@shared/api/types';

import { Tag } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

const LANGUAGE_LABELS: Record<string, string> = {
  zh: '中文',
  'zh-cn': '中文',
  'zh-tw': '繁体中文',
  en: '英文',
  ja: '日文',
  ko: '韩文',
};

function languageLabel(code: string): string {
  if (!code) {
    return '未知语言';
  }
  return LANGUAGE_LABELS[code.toLowerCase()] ?? code;
}

export function MetadataPreview({ metadata }: { metadata: MetadataShape | null }) {
  if (!metadata) {
    return null;
  }

  const keywords = metadata.keywords.slice(0, 6);

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/40 p-3.5">
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        抓取预览
      </p>
      {metadata.partial ? (
        <div className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-xs text-muted-foreground">
          未能抓取完整信息，请手动补充标题和描述。
        </div>
      ) : null}
      <div className="mt-2.5 flex min-w-0 items-center gap-2.5">
        {metadata.iconUrl ? (
          <img alt="" className="h-8 w-8 shrink-0 rounded-md" src={metadata.iconUrl} />
        ) : null}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{metadata.title}</div>
          <div className="text-xs text-muted-foreground">{languageLabel(metadata.language)}</div>
        </div>
      </div>
      <p className="mt-2 text-sm leading-6 break-words text-muted-foreground">
        {metadata.description || '未返回描述。'}
      </p>
      {keywords.length > 0 ? (
        <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-1.5">
          <Tag className="size-3 text-muted-foreground" />
          {keywords.map((keyword) => (
            <Badge key={keyword} variant="secondary" className="max-w-full font-normal break-words">
              {keyword}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
