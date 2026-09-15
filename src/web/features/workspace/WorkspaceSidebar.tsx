import type { Category, Tag } from '@shared/api/types';

import type { WorkspaceSearch } from './search';

import {
  ChevronDown,
  FolderPlus,
  FolderTree,
  Globe,
  Tags,
  Tag as TagIcon,
  CircleSlash,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { CategoryTree } from '@nav/features/categories/CategoryTree';
import { UNCATEGORIZED_SLUG } from '@shared/api/types';

export function WorkspaceSidebar({
  categories,
  tags,
  search,
  onSelect,
  revealSelection = 0,
}: {
  categories: Category[];
  tags: Tag[];
  search: WorkspaceSearch;
  revealSelection?: number;
  onSelect: (filter: Omit<WorkspaceSearch, 'q'>) => void;
}) {
  const { setOpenMobile } = useSidebar();
  function select(filter: Omit<WorkspaceSearch, 'q'>) {
    setOpenMobile(false);
    onSelect(filter);
  }
  const [groups, setGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('nav-sidebar-groups') ?? '{}');
      return { categories: saved?.categories !== false, tags: saved?.tags !== false };
    } catch {
      return { categories: true, tags: true };
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('nav-sidebar-groups', JSON.stringify(groups));
    } catch {
      /* optional preference */
    }
  }, [groups]);
  useEffect(() => {
    if (search.category && search.category !== UNCATEGORIZED_SLUG)
      setGroups((prev) => ({ ...prev, categories: true }));
  }, [search.category, revealSelection]);
  useEffect(() => {
    if (search.tag) setGroups((prev) => ({ ...prev, tags: true }));
  }, [search.tag, revealSelection]);
  const all = !search.category && !search.tag && !search.untagged && !search.pinned;
  return (
    <nav aria-label="书签索引" className="flex shrink-0 flex-col gap-5">
      <Collapsible
        open={groups.categories}
        onOpenChange={(open) => setGroups((prev) => ({ ...prev, categories: open }))}
      >
        <SidebarGroup className="p-0">
          <SidebarGroupLabel
            render={<CollapsibleTrigger />}
            className="w-full cursor-pointer gap-2"
          >
            <FolderTree />
            分类
            <ChevronDown className={cn('ml-auto', groups.categories && 'rotate-180')} />
          </SidebarGroupLabel>
          <CollapsibleContent keepMounted>
            <SidebarGroupContent>
              {categories.length ? (
                <CategoryTree
                  categories={categories}
                  selectedSlug={search.category}
                  onSelect={(category) => select({ category })}
                  showLevel
                  showCount
                />
              ) : (
                <p className="px-2 py-2 text-xs text-muted-foreground">暂无分类</p>
              )}
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
      <Collapsible
        open={groups.tags}
        onOpenChange={(open) => setGroups((prev) => ({ ...prev, tags: open }))}
      >
        <SidebarGroup className="p-0">
          <SidebarGroupLabel
            render={<CollapsibleTrigger />}
            className="w-full cursor-pointer gap-2"
          >
            <Tags />
            标签
            <ChevronDown className={cn('ml-auto', groups.tags && 'rotate-180')} />
          </SidebarGroupLabel>
          <CollapsibleContent keepMounted>
            <SidebarGroupContent>
              {tags.length ? (
                <SidebarMenu>
                  {tags.map((tag) => (
                    <SidebarMenuItem key={tag.id}>
                      <SidebarMenuButton
                        isActive={search.tag === tag.slug}
                        aria-current={search.tag === tag.slug ? 'page' : undefined}
                        onClick={() => select({ tag: tag.slug })}
                      >
                        <TagIcon />
                        <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums">
                          {tag.bookmarkCount}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              ) : (
                <p className="px-2 py-2 text-xs text-muted-foreground">暂无标签</p>
              )}
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
      <SidebarGroup className="p-0">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={all}
                aria-current={all ? 'page' : undefined}
                onClick={() => select({})}
              >
                <Globe />
                <span>全部网站</span>
              </SidebarMenuButton>
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton
                    render={<button type="button" />}
                    isActive={search.category === UNCATEGORIZED_SLUG}
                    aria-current={search.category === UNCATEGORIZED_SLUG ? 'page' : undefined}
                    onClick={() => select({ category: UNCATEGORIZED_SLUG })}
                  >
                    <FolderPlus />
                    <span>未分类</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton
                    render={<button type="button" />}
                    isActive={search.untagged === true}
                    aria-current={search.untagged ? 'page' : undefined}
                    onClick={() => select({ untagged: true })}
                  >
                    <CircleSlash />
                    <span>无标签</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </nav>
  );
}
