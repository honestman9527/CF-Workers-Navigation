import type { Bookmark, BookmarkInput, CategoryNode, MetadataPreview } from '@nav/api/types';

import { Image, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, Label, Textarea } from '@/components/ui/primitives';
import { ApiError, api } from '@nav/api/client';
import { DialogPanel } from '@nav/components/DialogPanel';
import { MetadataPreview as Preview } from '@nav/features/bookmarks/MetadataPreview';
import { CategoryPicker } from '@nav/features/categories/CategoryPicker';
import { findCategoryById } from '@nav/utils/bookmarks';

/** 根据网址与代理模板生成 favicon 代理 URL。 */
function buildFaviconProxyUrl(pageUrl: string, template: string): string | null {
  let hostname: string;
  try {
    hostname = new URL(pageUrl.trim()).hostname;
  } catch {
    return null;
  }
  if (!hostname || !template.includes('{domain}')) {
    return null;
  }
  return template.replaceAll('{domain}', hostname);
}

type FormState = BookmarkInput;

function firstCategoryId(tree: CategoryNode[]): number | null {
  return tree[0]?.id ?? null;
}

function defaultState(selectedCategoryId: number | null, tree: CategoryNode[]): FormState {
  const fallback = firstCategoryId(tree);
  const preferred =
    selectedCategoryId !== null && findCategoryById(tree, selectedCategoryId)
      ? selectedCategoryId
      : fallback;

  return {
    categoryId: preferred ?? 0,
    title: '',
    url: '',
    description: '',
    iconUrl: '',
    isPinned: false,
    sortOrder: 0,
  };
}

export function BookmarkForm({
  open,
  categories,
  bookmark,
  selectedCategoryId,
  onClose,
  onSubmit,
}: {
  open: boolean;
  categories: CategoryNode[];
  bookmark?: Bookmark;
  selectedCategoryId: number | null;
  onClose: () => void;
  onSubmit: (input: BookmarkInput) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(() => defaultState(selectedCategoryId, categories));
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchingIcon, setFetchingIcon] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<MetadataPreview | null>(null);
  const hasCategories = categories.length > 0;

  useEffect(() => {
    if (!open) {
      return;
    }

    if (bookmark) {
      setForm({
        categoryId: bookmark.categoryId,
        title: bookmark.title,
        url: bookmark.url,
        description: bookmark.description ?? '',
        iconUrl: bookmark.iconUrl ?? '',
        isPinned: bookmark.isPinned,
        sortOrder: bookmark.sortOrder,
      });
      setMetadata(null);
      setError(null);
      return;
    }

    setForm(defaultState(selectedCategoryId, categories));
    setMetadata(null);
    setError(null);
  }, [bookmark, open, selectedCategoryId, categories]);

  return (
    <DialogPanel
      open={open}
      onClose={onClose}
      size="xl"
      labelledBy="bookmark-form-title"
      title={bookmark ? '编辑书签' : '添加书签'}
    >
      <div className="flex flex-col gap-1 pr-8">
        <h2 id="bookmark-form-title" className="text-lg font-semibold tracking-tight">
          {bookmark ? '编辑书签' : '添加书签'}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">粘贴网址，抓取信息后微调再保存。</p>
      </div>

      <form
        className="mt-4 grid min-w-0 gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!form.categoryId || form.categoryId <= 0) {
            setError('请先选择一个分类');
            return;
          }
          if (!form.url.trim()) {
            setError('请填写网址');
            return;
          }
          try {
            new URL(form.url.trim());
          } catch {
            setError('网址格式不正确');
            return;
          }
          if (!form.title.trim()) {
            setError('请填写标题');
            return;
          }
          setLoading(true);
          setError(null);

          try {
            await onSubmit({
              ...form,
              url: form.url.trim(),
              title: form.title.trim(),
              description: form.description?.trim() || null,
              iconUrl: form.iconUrl?.trim() || null,
            });
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : '保存失败');
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="bm-url">网址</Label>
            <Input
              id="bm-url"
              value={form.url}
              onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://example.com"
              autoFocus={!bookmark}
            />
          </div>
          <Button
            className="w-full sm:w-auto"
            disabled={fetching || !form.url.trim()}
            onClick={async (event) => {
              event.preventDefault();
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
            type="button"
            variant="secondary"
          >
            <Sparkles className="size-4" />
            {fetching ? '抓取中…' : '抓取信息'}
          </Button>
        </div>

        <Preview metadata={metadata} />

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="bm-title">标题</Label>
            <Input
              id="bm-title"
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="书签标题"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="bm-icon">图标地址</Label>
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <Input
                id="bm-icon"
                value={form.iconUrl ?? ''}
                onChange={(event) =>
                  setForm((current) => ({ ...current, iconUrl: event.target.value }))
                }
                placeholder="https://example.com/favicon.ico"
              />
              <Button
                className="w-full sm:w-auto"
                disabled={fetchingIcon || !form.url.trim()}
                onClick={async (event) => {
                  event.preventDefault();
                  if (!form.url.trim()) {
                    setError('请先填写网址');
                    return;
                  }

                  setFetchingIcon(true);
                  setError(null);
                  try {
                    const settings = await api.getSettings();
                    const iconUrl = buildFaviconProxyUrl(form.url, settings.faviconProxyUrl);
                    if (!iconUrl) {
                      setError('无法从网址生成图标代理地址，请检查网址与代理模板');
                      return;
                    }
                    setForm((current) => ({ ...current, iconUrl }));
                  } catch (caught) {
                    setError(caught instanceof ApiError ? caught.message : '获取图标代理失败');
                  } finally {
                    setFetchingIcon(false);
                  }
                }}
                type="button"
                variant="secondary"
                title="使用设置中的 Favicon 代理填充图标地址"
              >
                <Image className="size-4" />
                {fetchingIcon ? '获取中…' : '获取图标'}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="bm-desc">描述</Label>
          <Textarea
            id="bm-desc"
            value={form.description ?? ''}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            className="min-h-20 resize-y"
            placeholder="可选说明"
          />
        </div>

        <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="bm-cat">分类</Label>
            {hasCategories ? (
              <CategoryPicker
                id="bm-cat"
                categories={categories}
                value={form.categoryId > 0 ? form.categoryId : null}
                onChange={(id) =>
                  setForm((current) => ({
                    ...current,
                    categoryId: id ?? 0,
                  }))
                }
                placeholder="选择要放入的分类"
              />
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                暂无分类，请先新建一个。
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="bm-sort">排序</Label>
            <Input
              id="bm-sort"
              type="number"
              value={form.sortOrder ?? 0}
              onChange={(event) =>
                setForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))
              }
            />
          </div>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground">
          <Checkbox
            checked={form.isPinned ?? false}
            onCheckedChange={(checked) =>
              setForm((current) => ({ ...current, isPinned: checked === true }))
            }
          />
          加入收藏
        </label>

        {error ? (
          <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex w-full shrink-0 items-center justify-end gap-2 border-t border-border pt-4">
          <Button className="min-w-16" onClick={onClose} type="button" variant="ghost">
            取消
          </Button>
          <Button
            className="min-w-16"
            disabled={loading || !hasCategories}
            type="submit"
            variant="default"
          >
            {loading ? '保存中…' : bookmark ? '保存' : '创建'}
          </Button>
        </div>
      </form>
    </DialogPanel>
  );
}
