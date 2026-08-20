import type { LucideIcon } from 'lucide-react';

import {
  BookOpen,
  Bookmark,
  Briefcase,
  Code2,
  Folder,
  FolderOpen,
  Folders,
  Gamepad2,
  Globe,
  GraduationCap,
  Heart,
  Home,
  Inbox,
  Music,
  Palette,
  ShoppingBag,
  Sparkles,
  Star,
  Utensils,
  Wrench,
} from 'lucide-react';

/** 分类可选图标的精选集合：以稳定 key 存库，避免直接存组件引用。 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  'folder-open': FolderOpen,
  folders: Folders,
  inbox: Inbox,
  star: Star,
  heart: Heart,
  book: BookOpen,
  bookmark: Bookmark,
  code: Code2,
  palette: Palette,
  briefcase: Briefcase,
  home: Home,
  graduation: GraduationCap,
  music: Music,
  utensils: Utensils,
  gamepad: Gamepad2,
  shopping: ShoppingBag,
  wrench: Wrench,
  sparkles: Sparkles,
  globe: Globe,
};

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS);

export function categoryIcon(key: string | null | undefined): LucideIcon {
  return (key ? CATEGORY_ICONS[key] : undefined) ?? Folder;
}
