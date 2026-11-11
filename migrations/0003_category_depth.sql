-- Snapshot the original forest before changing any parent or inherited privacy.
CREATE TABLE _category_depth_snapshot (
  id INTEGER PRIMARY KEY, root_id INTEGER NOT NULL, depth INTEGER NOT NULL,
  is_private INTEGER NOT NULL, root_private INTEGER NOT NULL,
  sort_order INTEGER NOT NULL, visit_path TEXT NOT NULL
);
--> statement-breakpoint
WITH RECURSIVE ordered AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY parent_id ORDER BY sort_order, name COLLATE NOCASE, id) AS ordinal
  FROM categories
), forest(id, root_id, depth, is_private, root_private, sort_order, visit_path) AS (
  SELECT id, id, 1, visibility = 'private', visibility = 'private', sort_order, printf('%010d', ordinal)
  FROM ordered WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, f.root_id, f.depth + 1, f.is_private OR c.visibility = 'private', f.root_private,
    c.sort_order, f.visit_path || '/' || printf('%010d', c.ordinal)
  FROM ordered c JOIN forest f ON c.parent_id = f.id
)
INSERT INTO _category_depth_snapshot SELECT * FROM forest;
--> statement-breakpoint
-- A cycle or orphan is unreachable from the roots. Abort rather than silently repair it.
CREATE TABLE _category_depth_validation (
  valid INTEGER CONSTRAINT category_hierarchy_invalid CHECK (valid = 1)
);
--> statement-breakpoint
INSERT INTO _category_depth_validation
SELECT (SELECT COUNT(*) FROM categories) = (SELECT COUNT(*) FROM _category_depth_snapshot);
--> statement-breakpoint
WITH promoted AS (
  SELECT s.id, s.root_id, s.is_private, s.root_private,
    COALESCE((SELECT MAX(sort_order) FROM _category_depth_snapshot WHERE root_id = s.root_id AND depth = 2), -1)
    + ROW_NUMBER() OVER (PARTITION BY s.root_id ORDER BY s.visit_path) AS new_order
  FROM _category_depth_snapshot s WHERE s.depth > 2
)
UPDATE categories SET
  parent_id = (SELECT root_id FROM promoted WHERE promoted.id = categories.id),
  sort_order = (SELECT new_order FROM promoted WHERE promoted.id = categories.id),
  visibility = IIF((SELECT is_private AND NOT root_private FROM promoted WHERE promoted.id = categories.id),
    'private', visibility),
  updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT id FROM promoted);
--> statement-breakpoint
DROP TABLE _category_depth_validation;
--> statement-breakpoint
DROP TABLE _category_depth_snapshot;
--> statement-breakpoint
CREATE TRIGGER categories_depth_insert BEFORE INSERT ON categories
WHEN NEW.parent_id IS NOT NULL AND (
  NEW.parent_id = NEW.id
  OR EXISTS (SELECT 1 FROM categories WHERE id = NEW.parent_id AND parent_id IS NOT NULL)
  OR EXISTS (SELECT 1 FROM categories WHERE parent_id = NEW.id)
)
BEGIN
  SELECT RAISE(ABORT, 'category_depth_limit');
END;
--> statement-breakpoint
CREATE TRIGGER categories_depth_update BEFORE UPDATE OF parent_id ON categories
WHEN NEW.parent_id IS NOT NULL AND (
  NEW.parent_id = NEW.id
  OR EXISTS (SELECT 1 FROM categories WHERE id = NEW.parent_id AND parent_id IS NOT NULL)
  OR EXISTS (SELECT 1 FROM categories WHERE parent_id = OLD.id)
)
BEGIN
  SELECT RAISE(ABORT, 'category_depth_limit');
END;
