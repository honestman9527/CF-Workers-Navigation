import type { Category, Tag } from '@shared/api/types';

import { ChevronDown, RefreshCw, Sparkles, X } from 'lucide-react';

import { isComposingKey } from '@/lib/keyboard';
import {
  useBookmarkEditor,
  type BookmarkEditorProps,
} from '@nav/features/bookmarks/useBookmarkEditor';
import { buildCategoryTree, flattenCategoryTree } from '@nav/features/categories/tree';
import { useVisibilityDefaults } from '@nav/features/visibility/useVisibilityDefaults';

import { FrontButton, FrontInput, frontInputClass } from './controls';
import { FrontDialog } from './FrontDialog';

export function FrontBookmarkEditor({
  onClose,
  categories,
  tags,
  ...props
}: BookmarkEditorProps & { onClose: () => void; categories: Category[]; tags: Tag[] }) {
  const editor = useBookmarkEditor(props);
  const defaults = useVisibilityDefaults();
  const { form, setForm } = editor;
  const category = categories.find((item) => item.id === form.categoryId);
  return (
    <FrontDialog
      open={props.open}
      onClose={onClose}
      title={props.bookmark ? '编辑书签' : '添加书签'}
      dismissible={!editor.loading}
    >
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void editor.submit();
        }}
      >
        <fieldset disabled={editor.loading} className="grid min-w-0 gap-5 disabled:opacity-60">
          <div>
            <label htmlFor="bookmark-url" className="mb-2 block text-sm font-semibold">
              网址
            </label>
            <div className="flex gap-2">
              <FrontInput
                id="bookmark-url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://example.com"
                autoFocus={!props.bookmark}
              />
              <FrontButton
                aria-label="自动填写"
                disabled={editor.fetching || !form.url.trim()}
                onClick={() => void editor.fetchMetadata()}
                className="bg-secondary px-3"
              >
                <Sparkles className="size-4" />
                <span className="hidden sm:inline">{editor.fetching ? '获取中…' : '自动填写'}</span>
                <span className="sr-only sm:hidden">自动填写</span>
              </FrontButton>
            </div>
            {editor.metadata?.partial ? (
              <p className="mt-2 text-sm text-muted-foreground">部分信息未获取到，可手动补充</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="bookmark-title" className="mb-2 block text-sm font-semibold">
              标题
            </label>
            <FrontInput
              id="bookmark-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="给它一个容易找到的名字"
            />
          </div>
          <div>
            <label htmlFor="bookmark-description" className="mb-2 block text-sm font-semibold">
              描述
            </label>
            <textarea
              id="bookmark-description"
              className={`${frontInputClass} min-h-24 resize-y`}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="一句话说明它的用途"
            />
          </div>
          <div>
            <label htmlFor="bookmark-category" className="mb-2 block text-sm font-semibold">
              分类
            </label>
            <select
              id="bookmark-category"
              className={frontInputClass}
              value={form.categoryId ?? ''}
              onChange={(e) =>
                setForm({ ...form, categoryId: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">未分类</option>
              {flattenCategoryTree(buildCategoryTree(categories)).map((item) => (
                <option key={item.id} value={item.id}>
                  {'　'.repeat(item.depth)}
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bookmark-tags" className="mb-2 block text-sm font-semibold">
              标签
            </label>
            <div className="mb-2 flex flex-wrap gap-1">
              {editor.selectedTags.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => editor.removeTag(tag)}
                  aria-label={`移除标签 ${tag}`}
                  className="flex min-h-9 items-center gap-2 rounded-full bg-secondary px-3 text-sm"
                >
                  {tag}
                  <X className="size-3" />
                </button>
              ))}
            </div>
            <FrontInput
              id="bookmark-tags"
              value={editor.tagDraft}
              onChange={(e) => editor.setTagDraft(e.target.value)}
              placeholder="回车添加标签"
              onKeyDown={(event) => {
                if (isComposingKey(event.nativeEvent)) return;
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault();
                  editor.addTag(editor.tagDraft);
                }
              }}
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {tags
                .filter(
                  (tag) =>
                    !editor.selectedTags.some(
                      (value) => value.toLocaleLowerCase() === tag.name.toLocaleLowerCase(),
                    ) &&
                    tag.name
                      .toLocaleLowerCase()
                      .includes(editor.tagDraft.trim().toLocaleLowerCase()),
                )
                .slice(0, 8)
                .map((tag) => (
                  <FrontButton
                    key={tag.id}
                    className="min-h-9 px-2 text-xs"
                    onClick={() => editor.addTag(tag.name)}
                  >
                    + {tag.name}
                  </FrontButton>
                ))}
            </div>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">访问权限</legend>
            <div className="flex gap-6">
              {(['public', 'private'] as const).map((value) => (
                <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="visibility"
                    className="size-4 accent-primary"
                    value={value}
                    checked={
                      (form.visibility ?? defaults.data?.defaultBookmarkVisibility) === value
                    }
                    onChange={() => setForm({ ...form, visibility: value })}
                  />
                  {value === 'public' ? '公开' : '私有'}
                </label>
              ))}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {category?.effectiveVisibility === 'private'
                ? '受上级分类限制：当前仅登录可见。移出私有分类后，将按自身权限生效。'
                : '公开内容无需登录；私有内容仅管理员登录后可见。'}
            </p>
          </fieldset>
          {props.bookmark?.effectiveVisibility === 'private' &&
          props.bookmark.visibility === 'public' &&
          props.bookmark.categoryId !== form.categoryId ? (
            <p className="text-sm text-muted-foreground">
              移动会重新计算权限；移出私有分类后，此书签可能公开。
            </p>
          ) : null}
          {defaults.error && !props.bookmark ? (
            <p role="alert" className="text-sm text-destructive">
              默认权限加载失败，请明确选择公开或私有。
              <FrontButton onClick={defaults.refresh}>重试</FrontButton>
            </p>
          ) : null}
          <div>
            <FrontButton
              className="w-full justify-between rounded-xl bg-secondary"
              aria-expanded={editor.iconOpen}
              onClick={() => editor.setIconOpen(!editor.iconOpen)}
            >
              自定义图标
              <ChevronDown className={`size-4 ${editor.iconOpen ? 'rotate-180' : ''}`} />
            </FrontButton>
            {editor.iconOpen ? (
              <div className="mt-3">
                <label htmlFor="bookmark-icon" className="mb-2 block text-sm">
                  图标地址（可选）
                </label>
                <div className="flex gap-2">
                  <FrontInput
                    id="bookmark-icon"
                    value={form.iconUrl}
                    onChange={(e) => setForm({ ...form, iconUrl: e.target.value })}
                  />
                  <FrontButton
                    aria-label="获取图标"
                    disabled={editor.faviconFetching || !form.url.trim()}
                    onClick={() => void editor.fetchFavicon()}
                  >
                    <RefreshCw
                      className={`size-4 ${editor.faviconFetching ? 'animate-spin' : ''}`}
                    />
                  </FrontButton>
                </div>
              </div>
            ) : null}
          </div>
        </fieldset>
        {editor.error ? (
          <p role="alert" className="text-sm text-destructive">
            {editor.error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
          <FrontButton disabled={editor.loading} onClick={onClose}>
            取消
          </FrontButton>
          <FrontButton
            type="submit"
            tone="primary"
            disabled={editor.loading || (!props.bookmark && !form.visibility && !defaults.data)}
          >
            {editor.loading ? '保存中…' : '保存书签'}
          </FrontButton>
        </div>
      </form>
    </FrontDialog>
  );
}
