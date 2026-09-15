import type { Category, Tag } from '@shared/api/types';

import type { WorkspaceSearch } from './search';

import { FolderPlus, FolderTree, Globe, Tags, Tag as TagIcon, CircleSlash } from 'lucide-react';

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
import { CategoryTree } from '@nav/features/categories/CategoryTree';
import { UNCATEGORIZED_SLUG } from '@shared/api/types';

export function WorkspaceSidebar({
  categories,
  tags,
  search,
  onSelect,
}: {
  categories: Category[];
  tags: Tag[];
  search: WorkspaceSearch;
  onSelect: (filter: Omit<WorkspaceSearch, 'q'>) => void;
}) {
  const { setOpenMobile } = useSidebar();
  function select(filter: Omit<WorkspaceSearch, 'q'>) {
    setOpenMobile(false);
    onSelect(filter);
  }
  const all = !search.category && !search.tag && !search.untagged && !search.pinned;
  return (
    <nav aria-label="书签索引" className="flex shrink-0 flex-col gap-5">
      <SidebarGroup className="p-0">
        <SidebarGroupLabel>
          <FolderTree />
          分类
        </SidebarGroupLabel>
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
      </SidebarGroup>
      <SidebarGroup className="p-0">
        <SidebarGroupLabel>
          <Tags />
          标签
        </SidebarGroupLabel>
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
      </SidebarGroup>
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
