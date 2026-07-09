import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface TreeNode {
  id: string;
  label: ReactNode;
  children?: TreeNode[];
}

export interface TreeProps {
  nodes: ReadonlyArray<TreeNode>;
  /** Selected node id (selection follows keyboard focus). */
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Node ids expanded on first render. */
  defaultExpandedIds?: ReadonlyArray<string>;
  'aria-label'?: string;
}

interface FlatRow {
  node: TreeNode;
  level: number;
  parentId?: string;
  hasChildren: boolean;
  expanded: boolean;
}

/** Depth-first list of the currently-visible rows (respects expand state). */
function flatten(
  nodes: ReadonlyArray<TreeNode>,
  expanded: ReadonlySet<string>,
  level = 1,
  parentId?: string,
  out: FlatRow[] = [],
): FlatRow[] {
  for (const node of nodes) {
    const hasChildren = !!node.children?.length;
    const isOpen = hasChildren && expanded.has(node.id);
    out.push({ node, level, parentId, hasChildren, expanded: isOpen });
    if (isOpen) flatten(node.children!, expanded, level + 1, node.id, out);
  }
  return out;
}

/**
 * Tree — a single-select ARIA tree for the Phase 9 component editor. Selection
 * follows focus. Keyboard: ↑/↓ move between visible rows, → expands (or steps
 * into the first child), ← collapses (or steps to the parent), Enter/Space
 * select. Expand state is internal; seed it with `defaultExpandedIds`.
 */
export function Tree({
  nodes,
  selectedId,
  onSelect,
  defaultExpandedIds,
  'aria-label': ariaLabel,
}: TreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(defaultExpandedIds ?? []),
  );
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  const rows = useMemo(() => flatten(nodes, expanded), [nodes, expanded]);
  const activeId = selectedId ?? rows[0]?.node.id;

  const setOpen = (id: string, open: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const focus = (id: string) => {
    onSelect?.(id);
    refs.current[id]?.focus();
  };

  const onRowKeyDown = (e: React.KeyboardEvent, row: FlatRow) => {
    const idx = rows.findIndex((r) => r.node.id === row.node.id);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (idx < rows.length - 1) focus(rows[idx + 1].node.id);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (idx > 0) focus(rows[idx - 1].node.id);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (row.hasChildren && !row.expanded) setOpen(row.node.id, true);
        else if (row.hasChildren && row.expanded) focus(rows[idx + 1].node.id);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (row.hasChildren && row.expanded) setOpen(row.node.id, false);
        else if (row.parentId) focus(row.parentId);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect?.(row.node.id);
        break;
    }
  };

  return (
    <div className="fd-tree" role="tree" aria-label={ariaLabel}>
      {rows.map((row) => {
        const selected = row.node.id === activeId;
        return (
          <div
            key={row.node.id}
            ref={(el) => {
              refs.current[row.node.id] = el;
            }}
            role="treeitem"
            aria-level={row.level}
            aria-selected={selected}
            aria-expanded={row.hasChildren ? row.expanded : undefined}
            tabIndex={selected ? 0 : -1}
            className={['fd-tree__item', selected ? 'fd-tree__item--selected' : '']
              .filter(Boolean)
              .join(' ')}
            style={{ paddingLeft: `calc(${row.level - 1} * var(--fd-space-4) + var(--fd-space-2))` }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(row.node.id);
            }}
            onKeyDown={(e) => onRowKeyDown(e, row)}
          >
            {row.hasChildren && (
              <span
                className="fd-tree__twisty"
                aria-hidden="true"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(row.node.id, !row.expanded);
                }}
              >
                {row.expanded ? '▾' : '▸'}
              </span>
            )}
            <span className="fd-tree__label">{row.node.label}</span>
          </div>
        );
      })}
    </div>
  );
}
