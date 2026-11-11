import { useId, useMemo, useState, type KeyboardEvent } from 'react';

import { matchOption, type SearchSelectProps, type SelectOption } from './options';

/** 无外观的单选树：搜索不修改折叠状态，键盘与鼠标共用选择规则。 */
export function useCategorySelect({ options, value, onChange, disabled }: SearchSelectProps) {
  const prefix = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState(value);
  const byValue = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  );
  const children = useMemo(() => {
    const map = new Map<string, SelectOption[]>();
    for (const option of options)
      if (option.parentValue !== undefined) {
        const siblings = map.get(option.parentValue) ?? [];
        siblings.push(option);
        map.set(option.parentValue, siblings);
      }
    return map;
  }, [options]);
  const searching = Boolean(query.trim());
  const rows = useMemo(() => {
    const included = new Set<string>();
    if (searching)
      for (const option of options)
        if (matchOption(option, query)) {
          let current: SelectOption | undefined = option;
          while (current && !included.has(current.value)) {
            included.add(current.value);
            current =
              current.parentValue === undefined ? undefined : byValue.get(current.parentValue);
          }
        }
    return options.filter((option) => {
      if (searching) return included.has(option.value);
      let parent = option.parentValue;
      const seen = new Set<string>();
      while (parent !== undefined && !seen.has(parent)) {
        if (!expanded.has(parent)) return false;
        seen.add(parent);
        parent = byValue.get(parent)?.parentValue;
      }
      return true;
    });
  }, [options, query, searching, byValue, expanded]);
  const positions = useMemo(() => {
    const groups = new Map<string | undefined, SelectOption[]>();
    for (const row of rows) {
      const siblings = groups.get(row.parentValue) ?? [];
      siblings.push(row);
      groups.set(row.parentValue, siblings);
    }
    return new Map(
      [...groups.values()].flatMap((siblings) =>
        siblings.map(
          (row, index) => [row.value, { index: index + 1, size: siblings.length }] as const,
        ),
      ),
    );
  }, [rows]);
  const active = rows.some((option) => option.value === focused) ? focused : rows[0]?.value;
  const itemId = (option: SelectOption) => `${prefix}-${encodeURIComponent(option.value)}`;
  function focus(option?: SelectOption) {
    if (!option) return;
    setFocused(option.value);
    document.getElementById(itemId(option))?.focus();
  }
  function changeOpen(next: boolean) {
    if (next && disabled) return;
    if (next) {
      const ancestors = new Set<string>();
      let parent = byValue.get(value)?.parentValue;
      while (parent !== undefined && !ancestors.has(parent)) {
        ancestors.add(parent);
        parent = byValue.get(parent)?.parentValue;
      }
      setExpanded(ancestors);
      setFocused(value);
      setQuery('');
    }
    setOpen(next);
  }
  function toggle(option: SelectOption) {
    if (searching) return;
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(option.value)) next.delete(option.value);
      else next.add(option.value);
      return next;
    });
    setFocused(option.value);
  }
  function select(option: SelectOption) {
    if (disabled) return;
    onChange(option.value);
    changeOpen(false);
  }
  function keyDown(event: KeyboardEvent, option: SelectOption) {
    if (event.nativeEvent.isComposing) return;
    const index = rows.findIndex((row) => row.value === option.value);
    switch (event.key) {
      case 'ArrowDown':
        focus(rows[Math.min(rows.length - 1, index + 1)]);
        break;
      case 'ArrowUp':
        focus(rows[Math.max(0, index - 1)]);
        break;
      case 'Home':
        focus(rows[0]);
        break;
      case 'End':
        focus(rows[rows.length - 1]);
        break;
      case 'ArrowRight':
        if (!children.has(option.value)) return;
        if (!searching && !expanded.has(option.value)) toggle(option);
        else focus(rows.find((row) => row.parentValue === option.value));
        break;
      case 'ArrowLeft':
        if (!searching && expanded.has(option.value)) toggle(option);
        else focus(option.parentValue === undefined ? undefined : byValue.get(option.parentValue));
        break;
      case 'Enter':
      case ' ':
        select(option);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }
  return {
    open,
    changeOpen,
    query,
    setQuery,
    rows,
    active,
    focus,
    toggle,
    select,
    itemId,
    keyDown,
    selected: byValue.get(value),
    hasChildren: (option: SelectOption) => children.has(option.value),
    isExpanded: (option: SelectOption) => searching || expanded.has(option.value),
    searching,
    itemProps(option: SelectOption) {
      const position = positions.get(option.value)!;
      return {
        id: itemId(option),
        role: 'treeitem',
        tabIndex: active === option.value ? 0 : -1,
        'aria-level': (option.depth ?? 0) + 1,
        'aria-posinset': position.index,
        'aria-setsize': position.size,
        'aria-selected': value === option.value,
        'aria-expanded': children.has(option.value)
          ? searching || expanded.has(option.value)
          : undefined,
        onFocus: () => setFocused(option.value),
        onClick: () => select(option),
        onKeyDown: (event: KeyboardEvent) => keyDown(event, option),
      };
    },
  };
}
