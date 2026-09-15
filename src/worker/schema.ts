import { sql } from 'drizzle-orm';
import {
  AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    parentId: integer('parent_id').references((): AnySQLiteColumn => categories.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    icon: text('icon'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('categories_slug_idx').on(table.slug),
    index('categories_parent_sort_idx').on(table.parentId, table.sortOrder),
  ],
);

export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    url: text('url').notNull(),
    description: text('description'),
    iconUrl: text('icon_url'),
    isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
    archivedAt: text('archived_at'),
    deletedAt: text('deleted_at'),
    urlNormalized: text('url_normalized').notNull().default(''),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('bookmarks_category_idx').on(table.categoryId),
    index('bookmarks_status_created_idx').on(
      table.deletedAt,
      table.archivedAt,
      table.createdAt,
      table.id,
    ),
    index('bookmarks_pinned_created_idx').on(
      table.isPinned,
      table.deletedAt,
      table.archivedAt,
      table.createdAt,
      table.id,
    ),
    uniqueIndex('bookmarks_url_normalized_idx')
      .on(table.urlNormalized)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex('tags_slug_idx').on(table.slug)],
);

export const bookmarkTags = sqliteTable(
  'bookmark_tags',
  {
    bookmarkId: integer('bookmark_id')
      .notNull()
      .references(() => bookmarks.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('bookmark_tags_unique_idx').on(table.bookmarkId, table.tagId),
    index('bookmark_tags_tag_idx').on(table.tagId),
  ],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
