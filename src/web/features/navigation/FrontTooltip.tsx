import type { ReactElement, ReactNode } from 'react';

import { Tooltip } from '@base-ui/react/tooltip';

import { cn } from '@/lib/utils';

/** 前台 Tooltip 分组上下文，使图标栏连续悬停或键盘遍历时即时切换提示。 */
export function FrontTooltipProvider({
  delay = 220,
  closeDelay = 0,
  children,
}: {
  delay?: number;
  closeDelay?: number;
  children: ReactNode;
}) {
  return (
    <Tooltip.Provider delay={delay} closeDelay={closeDelay}>
      {children}
    </Tooltip.Provider>
  );
}

/**
 * 基于 Base UI Tooltip 原语的前台提示浮层：
 * - 满足 WCAG 1.4.13（悬停/焦点显现、鼠标可移入提示、Esc 可关闭）；
 * - 仅在 enabled=true（例如侧栏折叠为紧凑图标栏）时挂载，展开态零额外节点与开销。
 */
export function FrontTooltip({
  content,
  enabled = true,
  side = 'right',
  align = 'center',
  sideOffset = 10,
  className,
  children,
}: {
  content: ReactNode;
  enabled?: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
  children: ReactElement;
}) {
  return (
    <Tooltip.Root disabled={!enabled}>
      <Tooltip.Trigger render={children} />
      {enabled ? (
        <Tooltip.Portal>
          <Tooltip.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50">
            <Tooltip.Popup
              className={cn(
                'front-surface glass-surface inline-flex max-w-xs items-center gap-1.5 rounded-lg border border-border bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lg transition-[opacity,transform] duration-150 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0',
                className,
              )}
            >
              {content}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      ) : null}
    </Tooltip.Root>
  );
}
