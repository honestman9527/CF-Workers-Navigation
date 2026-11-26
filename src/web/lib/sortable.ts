import type { FocusEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export type SortableLayout = 'vertical' | 'grid';
export type ReorderMeta = { commit: boolean };

export type UseSortableListOptions<T extends { id: number }> = {
  items: T[];
  enabled: boolean;
  layout: SortableLayout;
  getLabel: (item: T) => string;
  onChangeOrder: (nextIds: number[], meta: ReorderMeta) => void;
};

type RectLike = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type DragSession = {
  itemId: number;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startScrollX: number;
  startScrollY: number;
  startContainerLeft: number;
  startContainerTop: number;
  startItemRect: RectLike;
  active: boolean;
  handleEl: HTMLButtonElement;
  itemEl: HTMLElement;
};

type GrabSession = {
  itemId: number;
  initialIds: number[];
};

type ElementWithScopedVt = HTMLElement & {
  startViewTransition?: (update: () => void) => {
    ready: Promise<void>;
    finished: Promise<void>;
  };
};

const DRAG_THRESHOLD_PX = 4;
const SCOPED_VT_MAX_ITEMS = 150;
const ANNOUNCE_DEBOUNCE_MS = 500;
const SETTLE_DURATION_MS = 220;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sameOrder(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function moveItemIds(ids: number[], fromIndex: number, insertIndex: number): number[] {
  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  const adjustedIndex = insertIndex > fromIndex ? insertIndex - 1 : insertIndex;
  next.splice(adjustedIndex, 0, moved);
  return next;
}

function toRectLike(rect: DOMRect | RectLike): RectLike {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function supportsScopedViewTransition(): boolean {
  return (
    typeof Element !== 'undefined' &&
    typeof (Element.prototype as ElementWithScopedVt).startViewTransition === 'function'
  );
}

/**
 * 桌面与键盘通用的单容器拖拽排序 Hook：
 * - 指针拖拽仅在专用手柄触发，原地抬起真实 DOM 节点并显示纯伪元素放置指示器；
 * - 键盘支持 Space/Enter 拾取-方向键移动-Space/Enter 放置-Escape 取消；
 * - 支持一键重排的元素级作用域 View Transition 与 WAAPI FLIP 过渡。
 */
export function useSortableList<T extends { id: number }>({
  items,
  enabled,
  layout,
  getLabel,
  onChangeOrder,
}: UseSortableListOptions<T>) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [grabbedId, setGrabbedId] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const listElRef = useRef<HTMLElement | null>(null);
  const markerElRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef(new Map<number, HTMLElement>());
  const handleRefs = useRef(new Map<number, HTMLButtonElement>());
  const moveButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  const itemsRef = useRef(items);
  const enabledRef = useRef(enabled);
  const layoutRef = useRef(layout);
  const getLabelRef = useRef(getLabel);
  const onChangeOrderRef = useRef(onChangeOrder);

  const dragRef = useRef<DragSession | null>(null);
  const grabRef = useRef<GrabSession | null>(null);
  const internalFocusRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const announceTimerRef = useRef<number | null>(null);
  const settleTokensRef = useRef(new Map<number, number>());

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    getLabelRef.current = getLabel;
  }, [getLabel]);

  useEffect(() => {
    onChangeOrderRef.current = onChangeOrder;
  }, [onChangeOrder]);

  const setListRef = useCallback((node: HTMLElement | null) => {
    listElRef.current = node;
  }, []);

  const setMarkerRef = useCallback((node: HTMLElement | null) => {
    markerElRef.current = node;
  }, []);

  const announce = useCallback((message: string, delayMs = 0) => {
    if (announceTimerRef.current !== null) {
      window.clearTimeout(announceTimerRef.current);
      announceTimerRef.current = null;
    }
    if (delayMs <= 0) {
      setAnnouncement(message);
      return;
    }
    setAnnouncement('');
    announceTimerRef.current = window.setTimeout(() => {
      announceTimerRef.current = null;
      setAnnouncement(message);
    }, delayMs);
  }, []);

  const clearMarker = useCallback(() => {
    const marker = markerElRef.current ?? listElRef.current;
    if (!marker) return;
    delete marker.dataset.drop;
    marker.style.removeProperty('--drop-x');
    marker.style.removeProperty('--drop-y');
    marker.style.removeProperty('--drop-w');
    marker.style.removeProperty('--drop-h');
  }, []);

  const animateFlip = useCallback((beforeRects: Map<number, RectLike>, settledId?: number) => {
    if (prefersReducedMotion()) return;
    for (const item of itemsRef.current) {
      const el = itemRefs.current.get(item.id);
      const before = beforeRects.get(item.id);
      if (!el || !before) continue;
      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      const isSettling = item.id === settledId;
      if (!isSettling && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

      const token = (settleTokensRef.current.get(item.id) ?? 0) + 1;
      settleTokensRef.current.set(item.id, token);
      if (isSettling) el.dataset.settling = 'true';

      if (typeof el.animate !== 'function') {
        if (isSettling && settleTokensRef.current.get(item.id) === token) {
          delete el.dataset.settling;
        }
        continue;
      }

      const animation = el.animate(
        [
          {
            translate: `${dx}px ${dy}px`,
            ...(isSettling ? { scale: '1.02' } : {}),
          },
          {
            translate: '0px 0px',
            ...(isSettling ? { scale: '1' } : {}),
          },
        ],
        {
          duration: SETTLE_DURATION_MS,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        },
      );

      const cleanup = () => {
        if (settleTokensRef.current.get(item.id) === token) {
          delete el.dataset.settling;
        }
      };
      void animation.finished.then(cleanup, cleanup);
    }
  }, []);

  const captureBeforeRects = useCallback((): Map<number, RectLike> => {
    const map = new Map<number, RectLike>();
    for (const item of itemsRef.current) {
      const el = itemRefs.current.get(item.id);
      if (!el) continue;
      el.getAnimations?.().forEach((animation) => animation.finish());
      map.set(item.id, toRectLike(el.getBoundingClientRect()));
    }
    return map;
  }, []);

  const computeDropTarget = useCallback(
    (session: DragSession): { nextIds: number[] } | null => {
      const listEl = listElRef.current;
      const markerEl = markerElRef.current ?? listEl;
      if (!listEl || !markerEl) return null;

      const currentItems = itemsRef.current;
      const orderedIds = currentItems.map((item) => item.id);
      const draggedIndex = orderedIds.indexOf(session.itemId);
      if (draggedIndex < 0) return null;

      const listRect = listEl.getBoundingClientRect();
      const markerRect = markerEl.getBoundingClientRect();
      const containerDeltaX = listRect.left - session.startContainerLeft;
      const containerDeltaY = listRect.top - session.startContainerTop;

      const rects: RectLike[] = [];
      for (const id of orderedIds) {
        const el = itemRefs.current.get(id);
        if (!el) return null;
        if (id === session.itemId) {
          rects.push({
            left: session.startItemRect.left + containerDeltaX,
            top: session.startItemRect.top + containerDeltaY,
            right: session.startItemRect.right + containerDeltaX,
            bottom: session.startItemRect.bottom + containerDeltaY,
            width: session.startItemRect.width,
            height: session.startItemRect.height,
          });
        } else {
          rects.push(toRectLike(el.getBoundingClientRect()));
        }
      }

      const py = clamp(session.lastY, listRect.top, listRect.bottom);
      const px = clamp(session.lastX, listRect.left, listRect.right);

      type RowGroup = { start: number; end: number; top: number; bottom: number };
      const rows: RowGroup[] = [];
      if (layoutRef.current === 'grid') {
        for (let index = 0; index < rects.length; index += 1) {
          const rect = rects[index];
          const prevRow = rows.at(-1);
          if (
            prevRow &&
            Math.abs(rect.top - prevRow.top) <=
              Math.min(rect.height, prevRow.bottom - prevRow.top) * 0.5
          ) {
            prevRow.end = index;
            prevRow.top = Math.min(prevRow.top, rect.top);
            prevRow.bottom = Math.max(prevRow.bottom, rect.bottom);
          } else {
            rows.push({ start: index, end: index, top: rect.top, bottom: rect.bottom });
          }
        }
      }

      const useVerticalAxis =
        layoutRef.current === 'vertical' || rows.every((row) => row.start === row.end);

      let insertIndex = rects.length;
      if (useVerticalAxis) {
        for (let index = 0; index < rects.length; index += 1) {
          const midpoint = rects[index].top + rects[index].height / 2;
          if (py < midpoint) {
            insertIndex = index;
            break;
          }
        }
        if (insertIndex === draggedIndex || insertIndex === draggedIndex + 1) {
          clearMarker();
          return null;
        }
        const markerY =
          insertIndex === 0
            ? rects[0].top - 2
            : insertIndex === rects.length
              ? rects[rects.length - 1].bottom + 2
              : (rects[insertIndex - 1].bottom + rects[insertIndex].top) / 2;
        markerEl.dataset.drop = 'horizontal';
        markerEl.style.setProperty('--drop-x', `${listRect.left - markerRect.left}px`);
        markerEl.style.setProperty('--drop-y', `${markerY - markerRect.top}px`);
        markerEl.style.setProperty('--drop-w', `${listRect.width}px`);
        markerEl.style.setProperty('--drop-h', '2px');
      } else {
        let targetRow = rows[0];
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const row of rows) {
          if (py >= row.top && py <= row.bottom) {
            targetRow = row;
            break;
          }
          const center = (row.top + row.bottom) / 2;
          const distance = Math.abs(py - center);
          if (distance < bestDistance) {
            bestDistance = distance;
            targetRow = row;
          }
        }

        insertIndex = targetRow.end + 1;
        for (let index = targetRow.start; index <= targetRow.end; index += 1) {
          const midpoint = rects[index].left + rects[index].width / 2;
          if (px < midpoint) {
            insertIndex = index;
            break;
          }
        }

        if (insertIndex === draggedIndex || insertIndex === draggedIndex + 1) {
          clearMarker();
          return null;
        }

        const gapFallback = 10;
        let markerX: number;
        if (insertIndex === targetRow.start) {
          const first = rects[targetRow.start];
          const next = rects[targetRow.start + 1];
          const gap = next ? Math.max(4, next.left - first.right) : gapFallback;
          markerX = first.left - gap / 2;
        } else if (insertIndex === targetRow.end + 1) {
          const last = rects[targetRow.end];
          const prev = rects[targetRow.end - 1];
          const gap = prev ? Math.max(4, last.left - prev.right) : gapFallback;
          markerX = last.right + gap / 2;
        } else {
          markerX = (rects[insertIndex - 1].right + rects[insertIndex].left) / 2;
        }

        const clampedX = clamp(markerX, markerRect.left + 2, markerRect.right - 2);
        markerEl.dataset.drop = 'vertical';
        markerEl.style.setProperty('--drop-x', `${clampedX - markerRect.left}px`);
        markerEl.style.setProperty('--drop-y', `${targetRow.top - markerRect.top}px`);
        markerEl.style.setProperty('--drop-w', '2px');
        markerEl.style.setProperty('--drop-h', `${targetRow.bottom - targetRow.top}px`);
      }

      return { nextIds: moveItemIds(orderedIds, draggedIndex, insertIndex) };
    },
    [clearMarker],
  );

  const stopAutoScroll = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastFrameRef.current = 0;
  }, []);

  const updateDragVisuals = useCallback(
    (session: DragSession) => {
      const dx = session.lastX - session.startX + (window.scrollX - session.startScrollX);
      const dy = session.lastY - session.startY + (window.scrollY - session.startScrollY);
      session.itemEl.style.setProperty('--drag-x', `${dx}px`);
      session.itemEl.style.setProperty('--drag-y', `${dy}px`);
      computeDropTarget(session);
    },
    [computeDropTarget],
  );

  const cleanupDragRef = useRef<() => void>(() => {});

  const startAutoScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    const step = (now: number) => {
      const session = dragRef.current;
      if (!session || !session.active) {
        rafRef.current = null;
        lastFrameRef.current = 0;
        return;
      }
      const dt = lastFrameRef.current ? Math.min((now - lastFrameRef.current) / 1000, 0.05) : 0.016;
      lastFrameRef.current = now;

      const viewportHeight = window.innerHeight || 0;
      const edgeZone = clamp(session.startItemRect.height, 40, Math.min(110, viewportHeight / 3));
      let speed = 0;
      if (session.lastY < edgeZone) {
        const depth = clamp((edgeZone - session.lastY) / edgeZone, 0, 1.5);
        speed = -depth * 560;
      } else if (viewportHeight > 0 && session.lastY > viewportHeight - edgeZone) {
        const depth = clamp((session.lastY - (viewportHeight - edgeZone)) / edgeZone, 0, 1.5);
        speed = depth * 560;
      }

      if (speed !== 0 && typeof window.scrollBy === 'function') {
        const prevY = window.scrollY;
        window.scrollBy(0, speed * dt);
        if (window.scrollY !== prevY) {
          updateDragVisuals(session);
        }
      }

      rafRef.current = window.requestAnimationFrame(step);
    };
    rafRef.current = window.requestAnimationFrame(step);
  }, [updateDragVisuals]);

  const finishDrag = useCallback(
    (mode: 'commit' | 'cancel') => {
      const session = dragRef.current;
      if (!session) return;
      cleanupDragRef.current();

      const item = itemsRef.current.find((entry) => entry.id === session.itemId);
      const label = item ? getLabelRef.current(item) : '书签';
      const wasActive = session.active;
      const draggedVisualRect = wasActive
        ? toRectLike(session.itemEl.getBoundingClientRect())
        : null;
      const dropResult = mode === 'commit' && wasActive ? computeDropTarget(session) : null;

      clearMarker();
      session.itemEl.style.removeProperty('--drag-x');
      session.itemEl.style.removeProperty('--drag-y');
      document.documentElement.classList.remove('drag-reordering');
      setDraggingId(null);

      try {
        if (session.handleEl.hasPointerCapture?.(session.pointerId)) {
          session.handleEl.releasePointerCapture(session.pointerId);
        }
      } catch {
        // Ignore synthetic test environments without active pointer capture.
      }

      if (!wasActive) return;

      if (mode === 'cancel' || !dropResult) {
        if (draggedVisualRect) {
          const beforeRects = new Map<number, RectLike>([[session.itemId, draggedVisualRect]]);
          session.itemEl.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
          animateFlip(beforeRects, session.itemId);
        }
        if (mode === 'cancel') {
          announce(`已取消调整「${label}」的顺序`, ANNOUNCE_DEBOUNCE_MS);
        }
        return;
      }

      const beforeRects = captureBeforeRects();
      if (draggedVisualRect) {
        beforeRects.set(session.itemId, draggedVisualRect);
      }

      flushSync(() => {
        onChangeOrderRef.current(dropResult.nextIds, { commit: true });
      });

      const movedEl = itemRefs.current.get(session.itemId);
      movedEl?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      animateFlip(beforeRects, session.itemId);
      const newPosition = dropResult.nextIds.indexOf(session.itemId) + 1;
      announce(
        `已将「${label}」移至第 ${newPosition} / ${dropResult.nextIds.length} 位`,
        ANNOUNCE_DEBOUNCE_MS,
      );
    },
    [animateFlip, announce, captureBeforeRects, clearMarker, computeDropTarget],
  );

  useEffect(() => {
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const session = dragRef.current;
      if (!session) return;
      if (event.pointerId !== undefined && event.pointerId !== session.pointerId) return;

      session.lastX = event.clientX;
      session.lastY = event.clientY;
      if (!session.active) {
        if (
          Math.hypot(event.clientX - session.startX, event.clientY - session.startY) <=
          DRAG_THRESHOLD_PX
        ) {
          return;
        }
        session.active = true;
        document.documentElement.classList.add('drag-reordering');
        setDraggingId(session.itemId);
        startAutoScroll();
      }
      updateDragVisuals(session);
    };

    const onPointerUp = (event: globalThis.PointerEvent) => {
      const session = dragRef.current;
      if (!session) return;
      if (event.pointerId !== undefined && event.pointerId !== session.pointerId) return;
      if (session.active) {
        session.lastX = event.clientX;
        session.lastY = event.clientY;
      }
      finishDrag('commit');
    };

    const onPointerCancel = (event: globalThis.PointerEvent) => {
      const session = dragRef.current;
      if (!session) return;
      if (event.pointerId !== undefined && event.pointerId !== session.pointerId) return;
      finishDrag('cancel');
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && dragRef.current) {
        event.preventDefault();
        finishDrag('cancel');
      }
    };

    cleanupDragRef.current = () => {
      dragRef.current = null;
      stopAutoScroll();
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
    };

    return () => {
      cleanupDragRef.current();
      clearMarker();
      document.documentElement.classList.remove('drag-reordering');
      if (announceTimerRef.current !== null) {
        window.clearTimeout(announceTimerRef.current);
      }
    };
  }, [clearMarker, finishDrag, startAutoScroll, stopAutoScroll, updateDragVisuals]);

  useEffect(() => {
    if (enabled) return;
    if (dragRef.current) finishDrag('cancel');
    if (grabRef.current) {
      grabRef.current = null;
      setGrabbedId(null);
    }
  }, [enabled, finishDrag]);

  const moveBy = useCallback(
    (
      id: number,
      delta: -1 | 1,
      options?: { commit?: boolean; focusMode?: 'handle' | 'move-button'; delayAnnounce?: boolean },
    ) => {
      if (!enabledRef.current) return false;
      const orderedIds = itemsRef.current.map((item) => item.id);
      const fromIndex = orderedIds.indexOf(id);
      const targetIndex = fromIndex + delta;
      if (fromIndex < 0 || targetIndex < 0 || targetIndex >= orderedIds.length) return false;

      const nextIds = [...orderedIds];
      [nextIds[fromIndex], nextIds[targetIndex]] = [nextIds[targetIndex], nextIds[fromIndex]];

      const beforeRects = captureBeforeRects();
      internalFocusRef.current = true;
      flushSync(() => {
        onChangeOrderRef.current(nextIds, { commit: options?.commit ?? true });
      });

      const itemEl = itemRefs.current.get(id);
      itemEl?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });

      if (options?.focusMode === 'handle') {
        handleRefs.current.get(id)?.focus({ preventScroll: true });
      } else if (options?.focusMode === 'move-button') {
        const atBoundary =
          (delta === -1 && targetIndex === 0) ||
          (delta === 1 && targetIndex === nextIds.length - 1);
        const nextDelta = atBoundary ? (delta === -1 ? 1 : -1) : delta;
        const targetBtn =
          moveButtonRefs.current.get(`${id}:${nextDelta}`) ??
          moveButtonRefs.current.get(`${id}:${delta}`);
        targetBtn?.focus({ preventScroll: true });
      }
      internalFocusRef.current = false;

      animateFlip(beforeRects, id);
      const item = itemsRef.current.find((entry) => entry.id === id);
      const label = item ? getLabelRef.current(item) : '书签';
      const directionLabel =
        layoutRef.current === 'grid' ? (delta < 0 ? '前移' : '后移') : delta < 0 ? '上移' : '下移';
      announce(
        `已将「${label}」${directionLabel}至第 ${targetIndex + 1} / ${nextIds.length} 位`,
        options?.delayAnnounce === false ? 0 : ANNOUNCE_DEBOUNCE_MS,
      );
      return true;
    },
    [animateFlip, announce, captureBeforeRects],
  );

  const animateReorder = useCallback(
    (nextIds: number[], statusText: string) => {
      if (!enabledRef.current) return;
      const listEl = listElRef.current as ElementWithScopedVt | null;
      const reduced = prefersReducedMotion();
      const startVt = listEl?.startViewTransition;
      const canUseScopedVt =
        !reduced &&
        listEl !== null &&
        itemsRef.current.length <= SCOPED_VT_MAX_ITEMS &&
        supportsScopedViewTransition() &&
        typeof startVt === 'function';

      if (canUseScopedVt && listEl && startVt) {
        listEl.dataset.vtSorting = 'true';
        const transition = startVt.call(listEl, () => {
          flushSync(() => {
            onChangeOrderRef.current(nextIds, { commit: true });
          });
        });
        transition.ready.catch(() => {});
        void transition.finished.finally(() => {
          delete listEl.dataset.vtSorting;
        });
      } else if (!reduced && listEl) {
        const beforeRects = captureBeforeRects();
        flushSync(() => {
          onChangeOrderRef.current(nextIds, { commit: true });
        });
        animateFlip(beforeRects);
      } else {
        onChangeOrderRef.current(nextIds, { commit: true });
      }

      announce(statusText, 0);
    },
    [animateFlip, announce, captureBeforeRects],
  );

  const commitKeyboardGrab = useCallback(
    (reason: 'drop' | 'cancel' | 'blur') => {
      const session = grabRef.current;
      if (!session) return;
      grabRef.current = null;
      setGrabbedId(null);

      const currentIds = itemsRef.current.map((item) => item.id);
      const item = itemsRef.current.find((entry) => entry.id === session.itemId);
      const label = item ? getLabelRef.current(item) : '书签';

      if (reason === 'cancel') {
        if (!sameOrder(currentIds, session.initialIds)) {
          const beforeRects = captureBeforeRects();
          internalFocusRef.current = true;
          flushSync(() => {
            onChangeOrderRef.current(session.initialIds, { commit: false });
          });
          const itemEl = itemRefs.current.get(session.itemId);
          itemEl?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
          handleRefs.current.get(session.itemId)?.focus({ preventScroll: true });
          internalFocusRef.current = false;
          animateFlip(beforeRects, session.itemId);
        }
        announce(`已取消调整「${label}」的顺序`, ANNOUNCE_DEBOUNCE_MS);
        return;
      }

      if (!sameOrder(currentIds, session.initialIds)) {
        onChangeOrderRef.current(currentIds, { commit: true });
        const position = currentIds.indexOf(session.itemId) + 1;
        announce(
          `已放置「${label}」在第 ${position} / ${currentIds.length} 位`,
          ANNOUNCE_DEBOUNCE_MS,
        );
      } else if (reason === 'drop') {
        announce(`「${label}」位置未改变`, 0);
      }
    },
    [animateFlip, announce, captureBeforeRects],
  );

  const startPointerDrag = useCallback(
    (item: T, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!enabledRef.current || event.button !== 0) return;
      if (dragRef.current) return;
      const listEl = listElRef.current;
      const itemEl = itemRefs.current.get(item.id);
      if (!listEl || !itemEl) return;

      if (grabRef.current) {
        grabRef.current = null;
        setGrabbedId(null);
      }

      const listRect = listEl.getBoundingClientRect();
      const itemRect = itemEl.getBoundingClientRect();
      const session: DragSession = {
        itemId: item.id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        startScrollX: window.scrollX,
        startScrollY: window.scrollY,
        startContainerLeft: listRect.left,
        startContainerTop: listRect.top,
        startItemRect: toRectLike(itemRect),
        active: false,
        handleEl: event.currentTarget,
        itemEl,
      };
      dragRef.current = session;

      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Ignore synthetic events without active browser pointer id.
      }

      const attachListeners = () => {
        const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
          const current = dragRef.current;
          if (!current) return;
          if (moveEvent.pointerId !== undefined && moveEvent.pointerId !== current.pointerId)
            return;
          current.lastX = moveEvent.clientX;
          current.lastY = moveEvent.clientY;
          if (!current.active) {
            if (
              Math.hypot(moveEvent.clientX - current.startX, moveEvent.clientY - current.startY) <=
              DRAG_THRESHOLD_PX
            ) {
              return;
            }
            current.active = true;
            document.documentElement.classList.add('drag-reordering');
            setDraggingId(current.itemId);
            startAutoScroll();
          }
          updateDragVisuals(current);
        };

        const onPointerUp = (upEvent: globalThis.PointerEvent) => {
          const current = dragRef.current;
          if (!current) return;
          if (upEvent.pointerId !== undefined && upEvent.pointerId !== current.pointerId) return;
          if (current.active) {
            current.lastX = upEvent.clientX;
            current.lastY = upEvent.clientY;
          }
          finishDrag('commit');
        };

        const onPointerCancel = (cancelEvent: globalThis.PointerEvent) => {
          const current = dragRef.current;
          if (!current) return;
          if (cancelEvent.pointerId !== undefined && cancelEvent.pointerId !== current.pointerId) {
            return;
          }
          finishDrag('cancel');
        };

        const onKeyDown = (keyEvent: globalThis.KeyboardEvent) => {
          if (keyEvent.key === 'Escape' && dragRef.current) {
            keyEvent.preventDefault();
            finishDrag('cancel');
          }
        };

        cleanupDragRef.current = () => {
          dragRef.current = null;
          stopAutoScroll();
          document.removeEventListener('pointermove', onPointerMove);
          document.removeEventListener('pointerup', onPointerUp);
          document.removeEventListener('pointercancel', onPointerCancel);
          window.removeEventListener('keydown', onKeyDown);
        };

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerCancel);
        window.addEventListener('keydown', onKeyDown);
      };

      attachListeners();
    },
    [finishDrag, startAutoScroll, stopAutoScroll, updateDragVisuals],
  );

  const onListFocus = useCallback((event: FocusEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    let focusVisible = false;
    try {
      focusVisible = target.matches(':focus-visible');
    } catch {
      focusVisible = false;
    }
    if (!focusVisible) return;
    const itemEl = target.closest<HTMLElement>('[data-sortable-id]');
    if (!itemEl) return;
    const hasRunningAnimation = itemEl
      .getAnimations?.()
      .some((animation) => animation.playState === 'running');
    if (!hasRunningAnimation) {
      itemEl.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }, []);

  const getItemProps = useCallback(
    (id: number) => ({
      'data-sortable-id': id,
      'data-dragging': draggingId === id ? 'true' : undefined,
      'data-grabbed': grabbedId === id ? 'true' : undefined,
      ref: (node: HTMLElement | null) => {
        if (node) itemRefs.current.set(id, node);
        else itemRefs.current.delete(id);
      },
    }),
    [draggingId, grabbedId],
  );

  const getHandleProps = useCallback(
    (item: T, _index: number) => ({
      ref: (node: HTMLButtonElement | null) => {
        if (node) handleRefs.current.set(item.id, node);
        else handleRefs.current.delete(item.id);
      },
      disabled: !enabled,
      'aria-label': `调整顺序：${getLabelRef.current(item)}`,
      'aria-pressed': grabbedId === item.id,
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        startPointerDrag(item, event);
      },
      onLostPointerCapture: () => {
        const current = dragRef.current;
        if (!current || current.itemId !== item.id) return;
        if (!current.handleEl.hasPointerCapture?.(current.pointerId)) {
          finishDrag('cancel');
        }
      },
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (!enabledRef.current) return;
        const isGrabbed = grabRef.current?.itemId === item.id;
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          if (isGrabbed) {
            commitKeyboardGrab('drop');
          } else {
            if (grabRef.current) commitKeyboardGrab('blur');
            grabRef.current = {
              itemId: item.id,
              initialIds: itemsRef.current.map((entry) => entry.id),
            };
            setGrabbedId(item.id);
            const currentPos = itemsRef.current.findIndex((entry) => entry.id === item.id) + 1;
            const hint =
              layoutRef.current === 'grid'
                ? '使用方向键调整位置，空格或回车放置，Esc 取消'
                : '使用上下方向键调整位置，空格或回车放置，Esc 取消';
            announce(
              `已抓取「${getLabelRef.current(item)}」，当前第 ${currentPos} / ${itemsRef.current.length} 位。${hint}`,
              0,
            );
          }
          return;
        }
        if (!isGrabbed) return;

        if (event.key === 'Escape') {
          event.preventDefault();
          commitKeyboardGrab('cancel');
          return;
        }

        let delta: -1 | 1 | 0 = 0;
        if (layoutRef.current === 'vertical') {
          if (event.key === 'ArrowUp') delta = -1;
          else if (event.key === 'ArrowDown') delta = 1;
        } else {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') delta = -1;
          else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') delta = 1;
        }
        if (delta !== 0) {
          event.preventDefault();
          moveBy(item.id, delta, { commit: false, focusMode: 'handle' });
        }
      },
      onBlur: () => {
        if (internalFocusRef.current) return;
        if (grabRef.current?.itemId === item.id) {
          commitKeyboardGrab('blur');
        }
      },
    }),
    [announce, commitKeyboardGrab, enabled, finishDrag, grabbedId, moveBy, startPointerDrag],
  );

  const registerMoveButton = useCallback(
    (id: number, delta: -1 | 1) => (node: HTMLButtonElement | null) => {
      const key = `${id}:${delta}`;
      if (node) moveButtonRefs.current.set(key, node);
      else moveButtonRefs.current.delete(key);
    },
    [],
  );

  return {
    setListRef,
    setMarkerRef,
    draggingId,
    grabbedId,
    announcement,
    onListFocus,
    getItemProps,
    getHandleProps,
    registerMoveButton,
    moveBy: (id: number, delta: -1 | 1) =>
      moveBy(id, delta, { commit: true, focusMode: 'move-button' }),
    animateReorder,
  };
}
