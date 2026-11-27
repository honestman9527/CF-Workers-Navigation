import type { Tag } from '@shared/api/types';

import { Hash, Tags } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import {
  retainSelectedOption,
  sortTagsByPopularity,
  tagOptions,
} from '@nav/features/selection/options';

import { FrontButton } from './controls';
import { FrontSearchSelect } from './FrontSearchSelect';

const UNTAGGED_VALUE = '__untagged__';
const MAX_QUICK_TAGS = 12;

type QuickChip = {
  key: string;
  kind: 'all' | 'tag' | 'untagged';
  label: string;
  count?: number;
  active: boolean;
  onActivate: () => void;
};

/** 站内模式直出式标签筛选栏：热门标签胶囊条 + 可搜索下拉，兼容 focusgroup 与横向滚屏渐隐回退。 */
export function FrontTagFilterBar({
  tags,
  loading,
  error,
  onRetry,
  selectedTag,
  untagged,
  onChange,
}: {
  tags: Tag[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedTag?: string;
  untagged?: boolean;
  onChange: (next: { tag?: string; untagged?: boolean }) => void;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  const supportsFocusGroup =
    typeof HTMLElement !== 'undefined' && 'focusGroup' in HTMLElement.prototype;
  const supportsScrollTimeline =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('animation-timeline', 'scroll()');

  const sortedTags = useMemo(() => sortTagsByPopularity(tags), [tags]);

  const matchedSelected = useMemo(() => {
    if (!selectedTag) return undefined;
    const lower = selectedTag.toLocaleLowerCase();
    return sortedTags.find(
      (item) => item.slug.toLocaleLowerCase() === lower || item.name.toLocaleLowerCase() === lower,
    );
  }, [sortedTags, selectedTag]);

  const selectedKey = matchedSelected?.slug ?? selectedTag;

  const chips = useMemo<QuickChip[]>(() => {
    const popular = sortedTags.filter((tag) => tag.bookmarkCount > 0).slice(0, MAX_QUICK_TAGS);
    const hasSelectedInPopular =
      selectedKey !== undefined &&
      popular.some((tag) => tag.slug.toLocaleLowerCase() === selectedKey.toLocaleLowerCase());

    const quickTags =
      selectedKey && !hasSelectedInPopular
        ? [
            {
              slug: selectedKey,
              name: matchedSelected?.name ?? selectedTag ?? selectedKey,
              bookmarkCount: matchedSelected?.bookmarkCount,
            },
            ...popular,
          ]
        : popular;

    const allChip: QuickChip = {
      key: 'all',
      kind: 'all',
      label: '全部',
      active: !selectedTag && !untagged,
      onActivate: () => onChange({ tag: undefined, untagged: undefined }),
    };

    const untaggedChip: QuickChip = {
      key: UNTAGGED_VALUE,
      kind: 'untagged',
      label: '无标签',
      active: Boolean(untagged && !selectedTag),
      onActivate: () =>
        onChange(
          untagged && !selectedTag
            ? { tag: undefined, untagged: undefined }
            : { tag: undefined, untagged: true },
        ),
    };

    const tagChips: QuickChip[] = quickTags.map((tag) => {
      const active =
        selectedKey !== undefined &&
        tag.slug.toLocaleLowerCase() === selectedKey.toLocaleLowerCase();
      return {
        key: `tag:${tag.slug}`,
        kind: 'tag',
        label: tag.name,
        count: tag.bookmarkCount,
        active,
        onActivate: () =>
          onChange(
            active
              ? { tag: undefined, untagged: undefined }
              : { tag: tag.slug, untagged: undefined },
          ),
      };
    });

    return untagged && !selectedTag
      ? [allChip, untaggedChip, ...tagChips]
      : [allChip, ...tagChips, untaggedChip];
  }, [sortedTags, matchedSelected, selectedKey, selectedTag, untagged, onChange]);

  const selectOptions = useMemo(
    () =>
      retainSelectedOption(
        [
          { value: '', label: '全部标签', keywords: 'all' },
          { value: UNTAGGED_VALUE, label: '无标签', keywords: 'untagged none' },
          ...tagOptions(sortedTags, true),
        ],
        selectedTag ?? '',
      ),
    [sortedTags, selectedTag],
  );

  const activeChipKey = chips.find((chip) => chip.active)?.key ?? 'all';
  const tabStopKey =
    focusedKey && chips.some((chip) => chip.key === focusedKey) ? focusedKey : activeChipKey;
  const hasActiveTag = Boolean(selectedTag || untagged);

  useEffect(() => {
    if (!selectedTag && !untagged) return;
    buttonRefs.current.get(activeChipKey)?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeChipKey, selectedTag, untagged]);

  useEffect(() => {
    const scroller = toolbarRef.current;
    if (!scroller || supportsScrollTimeline || typeof IntersectionObserver === 'undefined') return;
    const buttons = [...scroller.querySelectorAll('button')];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (!first || !last || first === last) {
      scroller.classList.remove('has-more-start', 'has-more-end');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === first) {
            scroller.classList.toggle('has-more-start', entry.intersectionRatio < 1);
          } else if (entry.target === last) {
            scroller.classList.toggle('has-more-end', entry.intersectionRatio < 1);
          }
        }
      },
      { root: scroller, threshold: 1, rootMargin: '1px' },
    );

    observer.observe(first);
    observer.observe(last);
    return () => {
      observer.disconnect();
      scroller.classList.remove('has-more-start', 'has-more-end');
    };
  }, [chips, supportsScrollTimeline]);

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label="快捷标签筛选"
          {...({ focusgroup: 'toolbar wrap' } as Record<string, string>)}
          onKeyDown={(event) => {
            if (supportsFocusGroup || chips.length === 0) return;
            if (
              event.key !== 'ArrowRight' &&
              event.key !== 'ArrowLeft' &&
              event.key !== 'Home' &&
              event.key !== 'End'
            ) {
              return;
            }
            event.preventDefault();
            const currentIndex = Math.max(
              0,
              chips.findIndex((chip) => chip.key === tabStopKey),
            );
            const rtl =
              typeof getComputedStyle === 'function' && toolbarRef.current
                ? getComputedStyle(toolbarRef.current).direction === 'rtl'
                : false;
            let nextIndex = currentIndex;
            if (event.key === 'Home') {
              nextIndex = 0;
            } else if (event.key === 'End') {
              nextIndex = chips.length - 1;
            } else {
              const delta = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : rtl ? 1 : -1;
              nextIndex = (currentIndex + delta + chips.length) % chips.length;
            }
            const nextChip = chips[nextIndex];
            if (!nextChip) return;
            setFocusedKey(nextChip.key);
            buttonRefs.current.get(nextChip.key)?.focus();
          }}
          className="scroll-edge-fade-x flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5"
        >
          {chips.map((chip) => (
            <button
              key={chip.key}
              ref={(node) => {
                if (node) {
                  buttonRefs.current.set(chip.key, node);
                } else {
                  buttonRefs.current.delete(chip.key);
                }
              }}
              type="button"
              aria-pressed={chip.active}
              tabIndex={supportsFocusGroup ? undefined : chip.key === tabStopKey ? 0 : -1}
              onFocus={() => {
                if (!supportsFocusGroup) setFocusedKey(chip.key);
              }}
              onClick={chip.onActivate}
              title={
                chip.kind === 'tag' && chip.active
                  ? `点击取消标签筛选：${chip.label}`
                  : chip.kind === 'tag'
                    ? `按标签筛选：${chip.label}`
                    : chip.label
              }
              className="tag-chip inline-flex min-h-8 shrink-0 cursor-pointer snap-start items-center gap-1 rounded-full border border-border bg-secondary/75 px-3 text-xs font-medium text-muted-foreground transition-colors outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary/45 aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:shadow-xs pointer-coarse:min-h-11 hover-capable:hover:border-primary/35 hover-capable:hover:bg-secondary hover-capable:hover:text-foreground"
            >
              {chip.kind === 'all' ? (
                <Tags aria-hidden="true" className="size-3.5 shrink-0 opacity-75" />
              ) : chip.kind === 'tag' ? (
                <Hash aria-hidden="true" className="size-3 shrink-0 opacity-75" />
              ) : null}
              <span className="max-w-32 truncate">{chip.label}</span>
              {chip.count !== undefined ? (
                <span className="text-[11px] tabular-nums opacity-75">
                  {chip.count}
                  <span className="sr-only"> 条书签</span>
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <FrontSearchSelect
          id="search-tag"
          label="标签筛选"
          placeholder="搜索标签"
          options={selectOptions}
          disabled={loading && tags.length === 0}
          value={untagged ? UNTAGGED_VALUE : (selectedTag ?? '')}
          onChange={(value) =>
            onChange({
              tag: value && value !== UNTAGGED_VALUE ? value : undefined,
              untagged: value === UNTAGGED_VALUE ? true : undefined,
            })
          }
          className={cn(
            'min-h-8 max-w-full rounded-xl px-2.5 text-xs sm:max-w-44 pointer-coarse:min-h-11',
            hasActiveTag && 'border-primary/45 text-foreground',
          )}
        />
      </div>

      {error ? (
        <span role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive">
          <span>{error}</span>
          <FrontButton onClick={onRetry} className="min-h-8 px-2.5 text-xs pointer-coarse:min-h-11">
            重试标签
          </FrontButton>
        </span>
      ) : null}
    </div>
  );
}
