import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  restrictToFirstScrollableAncestor,
  restrictToHorizontalAxis,
} from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PhotoRotation } from '@scran/shared';
import { useEffect, useRef, useState } from 'react';

import { CaptureIcon } from './capture-icons';
import { Button } from './ui';

const holdToDrag = { delay: 250, tolerance: 8 };

export type CapturePhoto = {
  id: string;
  file: File;
  preview: Blob;
  rotation: PhotoRotation;
};

export function CapturePhotoStrip({
  photos,
  selectedId,
  busy,
  onSelect,
  onReorder,
  onAdd,
}: {
  photos: CapturePhoto[];
  selectedId: string;
  busy: boolean;
  onSelect: (id: string) => void;
  onReorder: (photos: CapturePhoto[]) => void;
  onAdd: () => void;
}) {
  const strip = useRef<HTMLOListElement>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: holdToDrag }),
    useSensor(TouchSensor, { activationConstraint: holdToDrag }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const position = (id: string | number) =>
    photos.findIndex(photo => photo.id === id) + 1;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis, restrictToFirstScrollableAncestor]}
      autoScroll={{ canScroll: element => element === strip.current }}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'To reorder a photo, press Space, then use the left and right arrow keys. Press Space to drop, or Escape to cancel.',
        },
        announcements: {
          onDragStart: ({ active }) =>
            `Picked up photo ${position(active.id)} of ${photos.length}.`,
          onDragOver: ({ over }) =>
            over
              ? `Move to position ${position(over.id)} of ${photos.length}.`
              : undefined,
          onDragEnd: ({ over }) =>
            over
              ? `Photo dropped at position ${position(over.id)} of ${photos.length}.`
              : 'Photo order unchanged.',
          onDragCancel: () => 'Reordering cancelled. Photo order unchanged.',
        },
      }}
      onDragStart={({ active }) => onSelect(String(active.id))}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) {
          onReorder(
            arrayMove(photos, position(active.id) - 1, position(over.id) - 1),
          );
        }
      }}
    >
      <SortableContext items={photos} strategy={horizontalListSortingStrategy}>
        <ol
          ref={strip}
          aria-label="Photos in reading order"
          className="flex gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain px-1 py-2"
        >
          {photos.map((photo, index) => (
            <SortablePhoto
              key={photo.id}
              photo={photo}
              index={index}
              selected={photo.id === selectedId}
              busy={busy}
              onSelect={onSelect}
            />
          ))}
          <li className="shrink-0">
            <Button
              variant="secondary"
              aria-label="Add photos"
              title="Add photos"
              disabled={busy}
              onClick={onAdd}
              className="h-24 w-20 border-dashed"
            >
              <CaptureIcon name="plus" />
            </Button>
          </li>
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortablePhoto({
  photo,
  index,
  selected,
  busy,
  onSelect,
}: {
  photo: CapturePhoto;
  index: number;
  selected: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id, disabled: busy });
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.preview);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.preview]);
  return (
    <li
      ref={setNodeRef}
      className={`relative shrink-0 ${isDragging ? 'z-10' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label={`Review photo ${index + 1}`}
        aria-pressed={selected}
        title={`Photo ${index + 1} · Hold, then drag to reorder`}
        disabled={busy}
        onClick={() => onSelect(photo.id)}
        className={`rounded-ui flex h-24 w-20 flex-col items-center justify-center gap-1 overflow-hidden border-2 p-1 select-none [-webkit-touch-callout:none] disabled:opacity-50 ${isDragging ? 'shadow-card scale-105 cursor-grabbing' : 'cursor-grab'} ${selected ? 'border-selection-line bg-selection' : 'border-line bg-background'}`}
      >
        <span className="flex h-14 w-14 items-center justify-center overflow-hidden">
          {url && (
            <img
              src={url}
              alt=""
              draggable={false}
              className="max-h-12 max-w-12 object-contain"
              style={{ transform: `rotate(${photo.rotation}deg)` }}
            />
          )}
        </span>
        <span className="type-label">{index + 1}</span>
      </button>
    </li>
  );
}
