import type { Bookmark, BookmarkInput, MetadataPreview } from '@nav/api/types';

import { Image, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/primitives';
import { ApiError, api } from '@nav/api/client';
import { DialogPanel } from '@nav/components/DialogPanel';

export function BookmarkForm({
  open,
  bookmark,
  onClose,
  onSubmit,
}: {
  open: boolean;
  bookmark?: Bookmark;
  onClose: () => void;
  onSubmit: (input: BookmarkInput) => Promise<void>;
}) {
  const [form, setForm] = useState({ title: '', url: '', description: '', iconUrl: '', tags: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [faviconFetching, setFaviconFetching] = useState(false);
  const [metadata, setMetadata] = useState<MetadataPreview | null>(null);
  useEffect(() => {
    if (!open) return;
    setForm(
      bookmark
        ? {
            title: bookmark.title,
            url: bookmark.url,
            description: bookmark.description ?? '',
            iconUrl: bookmark.iconUrl ?? '',
            tags: bookmark.tags.join(', '),
          }
        : { title: '', url: '', description: '', iconUrl: '', tags: '' },
    );
    setError(null);
    setMetadata(null);
  }, [open, bookmark]);

  async function fetchFavicon(showError = true): Promise<string> {
    const url = form.url.trim();
    if (!url) return '';
    setFaviconFetching(true);
    if (showError) setError(null);
    try {
      const result = await api.getFavicon('', url);
      if (result.iconUrl) {
        setForm((current) => ({ ...current, iconUrl: result.iconUrl }));
      } else if (showError) {
        setError('自动获取 favicon 已在设置中关闭');
      }
      return result.iconUrl;
    } catch (caught) {
      if (showError) {
        setError(caught instanceof ApiError ? caught.message : '获取图标失败');
      }
      return '';
    } finally {
      setFaviconFetching(false);
    }
  }

  return (
    <DialogPanel
      open={open}
      onClose={onClose}
      size="xl"
      labelledBy="bookmark-form-title"
      title={bookmark ? '编辑书签' : '添加书签'}
    >
      <h2 id="bookmark-form-title" className="font-display text-xl font-semibold">
        {bookmark ? '编辑书签' : '添加书签'}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">网址会自动查重。用逗号分隔多个标签。</p>
      <form
        className="mt-5 grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!form.url.trim() || !form.title.trim()) {
            setError('请填写标题和网址');
            return;
          }
          try {
            new URL(form.url.trim());
          } catch {
            setError('网址格式不正确');
            return;
          }
          setLoading(true);
          setError(null);
          try {
            const iconUrl = form.iconUrl.trim() || (await fetchFavicon(false));
            await onSubmit({
              title: form.title.trim(),
              url: form.url.trim(),
              description: form.description.trim() || null,
              iconUrl: iconUrl || null,
              tags: form.tags
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
              isPinned: bookmark?.isPinned ?? false,
            });
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : '保存失败');
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Label htmlFor="bookmark-url">网址</Label>
            <Input
              id="bookmark-url"
              className="mt-2"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://example.com"
              autoFocus={!bookmark}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="mt-7 shrink-0"
            disabled={fetching || !form.url}
            onClick={async () => {
              setFetching(true);
              setError(null);
              try {
                const result = await api.getMetadata('', form.url.trim());
                setMetadata(result);
                setForm((current) => ({
                  ...current,
                  title: current.title || result.title,
                  description: current.description || result.description,
                  iconUrl: current.iconUrl || result.iconUrl,
                }));
              } catch (caught) {
                setError(caught instanceof ApiError ? caught.message : '抓取信息失败');
              } finally {
                setFetching(false);
              }
            }}
          >
            <Sparkles className="size-4" />
            {fetching ? '抓取中' : '抓取信息'}
          </Button>
        </div>
        {metadata ? (
          <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
            {metadata.iconUrl ? (
              <img src={metadata.iconUrl} alt="" className="size-6 rounded" />
            ) : (
              <Image className="size-5 text-muted-foreground" />
            )}
            <span className="truncate">{metadata.title}</span>
          </div>
        ) : null}
        <div>
          <Label htmlFor="bookmark-title">标题</Label>
          <Input
            id="bookmark-title"
            className="mt-2"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="给它一个容易找到的名字"
          />
        </div>
        <div>
          <Label htmlFor="bookmark-tags">标签</Label>
          <Input
            id="bookmark-tags"
            className="mt-2"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="开发, 阅读, 工具"
          />
        </div>
        <div>
          <Label htmlFor="bookmark-description">描述</Label>
          <Textarea
            id="bookmark-description"
            className="mt-2 min-h-24"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="一句话说明它为什么值得保留"
          />
        </div>
        <div>
          <Label htmlFor="bookmark-icon">图标地址（可选）</Label>
          <div className="mt-2 flex gap-2">
            <Input
              id="bookmark-icon"
              value={form.iconUrl}
              onChange={(e) => setForm({ ...form, iconUrl: e.target.value })}
              placeholder="https://example.com/favicon.ico"
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={faviconFetching || !form.url.trim()}
              onClick={() => void fetchFavicon()}
            >
              <RefreshCw className={faviconFetching ? 'animate-spin' : ''} />
              {faviconFetching ? '获取中' : '获取图标'}
            </Button>
          </div>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? '保存中…' : '保存书签'}
          </Button>
        </div>
      </form>
    </DialogPanel>
  );
}
