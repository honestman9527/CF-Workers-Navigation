import type { Bookmark, BookmarkInput, MetadataPreview, Visibility } from '@shared/api/types';

import { useEffect, useRef, useState } from 'react';

import { ApiError, api } from '@nav/api/client';

export type BookmarkEditorProps = {
  open: boolean;
  bookmark?: Bookmark;
  defaultCategoryId?: number | null;
  onSubmit: (input: BookmarkInput) => Promise<void>;
};

function appendTag(tags: string[], raw: string) {
  const result = [...tags];
  for (const value of raw.split(',')) {
    const next = value.trim().replace(/^#/, '').trim();
    if (next && !result.some((item) => item.toLocaleLowerCase() === next.toLocaleLowerCase())) {
      result.push(next);
    }
  }
  return result;
}

/** 前后台共用的编辑状态与提交规则，不依赖任何呈现组件。 */
export function useBookmarkEditor({
  open,
  bookmark,
  defaultCategoryId = null,
  onSubmit,
}: BookmarkEditorProps) {
  const [form, setForm] = useState({
    visibility: undefined as Visibility | undefined,
    title: '',
    url: '',
    description: '',
    iconUrl: '',
    tags: '',
    categoryId: null as number | null,
  });
  const [tagDraft, setTagDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [faviconFetching, setFaviconFetching] = useState(false);
  const [metadata, setMetadata] = useState<MetadataPreview | null>(null);
  const [iconOpen, setIconOpen] = useState(false);
  const metadataRequest = useRef<AbortController | null>(null);
  const faviconRequest = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    submitting.current = false;
    setLoading(false);
    setFetching(false);
    setFaviconFetching(false);
    setMetadata(null);
    return () => {
      revision.current += 1;
      metadataRequest.current?.abort();
      faviconRequest.current?.abort();
    };
  }, [open, bookmark, form.url]);
  useEffect(() => {
    if (!open) return;
    setForm(
      bookmark
        ? {
            visibility: bookmark.visibility,
            title: bookmark.title,
            url: bookmark.url,
            description: bookmark.description ?? '',
            iconUrl: bookmark.iconUrl ?? '',
            tags: bookmark.tags.join(', '),
            categoryId: bookmark.categoryId,
          }
        : {
            visibility: undefined,
            title: '',
            url: '',
            description: '',
            iconUrl: '',
            tags: '',
            categoryId: defaultCategoryId,
          },
    );
    setTagDraft('');
    setError(null);
    setMetadata(null);
    setIconOpen(false);
  }, [open, bookmark, defaultCategoryId]);

  const selectedTags = form.tags
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  function addTag(raw: string) {
    setForm((current) => ({ ...current, tags: appendTag(selectedTags, raw).join(', ') }));
    setTagDraft('');
  }

  function removeTag(target: string) {
    setForm((current) => ({
      ...current,
      tags: selectedTags.filter((item) => item !== target).join(', '),
    }));
  }

  async function fetchFavicon(showError = true): Promise<string> {
    const url = form.url.trim();
    if (!url) return '';
    faviconRequest.current?.abort();
    const current = new AbortController();
    faviconRequest.current = current;
    setFaviconFetching(true);
    if (showError) setError(null);
    try {
      const result = await api.getFavicon(url, current.signal);
      if (current.signal.aborted) return '';
      if (result.iconUrl) {
        setForm((current) => ({ ...current, iconUrl: result.iconUrl }));
      } else if (showError) {
        setError('自动获取图标已关闭，可填写图标地址');
      }
      return result.iconUrl;
    } catch (caught) {
      if (showError && !current.signal.aborted) {
        setError(caught instanceof ApiError ? caught.message : '获取图标失败');
      }
      return '';
    } finally {
      if (!current.signal.aborted) setFaviconFetching(false);
    }
  }

  async function submit() {
    if (submitting.current) return;
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
    submitting.current = true;
    const currentRevision = revision.current;
    setLoading(true);
    setError(null);
    try {
      const iconUrl = form.iconUrl.trim() || (await fetchFavicon(false));
      if (currentRevision !== revision.current) return;
      await onSubmit({
        visibility: form.visibility,
        title: form.title.trim(),
        url: form.url.trim(),
        description: form.description.trim() || null,
        iconUrl: iconUrl || null,
        categoryId: form.categoryId,
        tags: appendTag(selectedTags, tagDraft),
        isPinned: bookmark?.isPinned ?? false,
      });
    } catch (caught) {
      if (currentRevision === revision.current)
        setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      if (currentRevision === revision.current) {
        submitting.current = false;
        setLoading(false);
      }
    }
  }

  async function fetchMetadata() {
    metadataRequest.current?.abort();
    const current = new AbortController();
    metadataRequest.current = current;
    setFetching(true);
    setError(null);
    try {
      const result = await api.getMetadata(form.url.trim(), current.signal);
      if (current.signal.aborted) return;
      setMetadata(result);
      setForm((current) => ({
        ...current,
        title: current.title || result.title,
        description: current.description || result.description,
        iconUrl: current.iconUrl || result.iconUrl,
      }));
    } catch (caught) {
      if (!current.signal.aborted)
        setError(caught instanceof ApiError ? caught.message : '抓取信息失败');
    } finally {
      if (!current.signal.aborted) setFetching(false);
    }
  }

  return {
    form,
    setForm,
    tagDraft,
    setTagDraft,
    selectedTags,
    addTag,
    removeTag,
    error,
    loading,
    fetching,
    faviconFetching,
    metadata,
    iconOpen,
    setIconOpen,
    fetchFavicon,
    fetchMetadata,
    submit,
  };
}
