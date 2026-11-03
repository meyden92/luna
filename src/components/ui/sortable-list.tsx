import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/libs/utils';
import styles from './sortable-list.module.css';

/**
 * A vertical list the user reorders by dragging each item's handle, or with
 * the keyboard (focus the handle, Space, arrows, Space). `onReorder` gets the
 * items in their new order.
 */
function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  className,
}: {
  items: T[];
  getId: (item: T) => string;
  onReorder: (items: T[]) => void;
  /** Place `handle` where the item should be grabbed. */
  renderItem: (item: T, handle: React.ReactNode) => React.ReactNode;
  className?: string;
}) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = items.map(getId);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(items, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={ids}
        strategy={verticalListSortingStrategy}
      >
        <ul className={cn(styles.list, className)}>
          {items.map((item) => (
            <SortableRow
              key={getId(item)}
              id={getId(item)}
            >
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }: { id: string; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      className={styles.handle}
      aria-label="Drag to reorder"
      {...attributes}
      {...listeners}
    >
      <GripVertical />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      className={styles.row}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children(handle)}
    </li>
  );
}

export { SortableList };
