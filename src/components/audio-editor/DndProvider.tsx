import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { type ReactNode, useCallback, useState } from 'react';
import { type AudioClip, type MediaFile, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { pixelsToSeconds } from '@/libs/audio-editor/audio-utils';

const SNAP_THRESHOLD_PX = 10; // Pixels within which to snap

interface AudioEditorDndProviderProps {
  children: ReactNode;
}

export function AudioEditorDndProvider({ children }: AudioEditorDndProviderProps) {
  const moveClip = useAudioEditorStore((state) => state.moveClip);
  const createClipFromMedia = useAudioEditorStore((state) => state.createClipFromMedia);
  const pixelsPerSecond = useAudioEditorStore((state) => state.pixelsPerSecond);
  const clips = useAudioEditorStore((state) => state.clips);
  const tracks = useAudioEditorStore((state) => state.tracks);
  const [activeMedia, setActiveMedia] = useState<MediaFile | null>(null);

  // Get snap points for a given track (excluding the active clip)
  const getSnapPointsForTrack = useCallback(
    (trackId: string, excludeClipId?: string) => {
      const track = tracks.find((t) => t.id === trackId);
      if (!track) return [];

      const snapPoints: number[] = [0]; // Always include 0

      for (const clipId of track.clipIds) {
        if (clipId === excludeClipId) continue;
        const clip = clips[clipId];
        if (!clip) continue;

        const clipDuration = clip.trimEnd - clip.offset;
        snapPoints.push(clip.startTime); // Start of clip
        snapPoints.push(clip.startTime + clipDuration); // End of clip
      }

      return snapPoints;
    },
    [tracks, clips],
  );

  // Snap a position to nearby snap points
  const snapToNearby = useCallback(
    (position: number, snapPoints: number[], clipDuration: number): number => {
      const thresholdSeconds = pixelsToSeconds(SNAP_THRESHOLD_PX, pixelsPerSecond);

      // Check if clip start snaps to any point
      for (const snapPoint of snapPoints) {
        if (Math.abs(position - snapPoint) <= thresholdSeconds) {
          return snapPoint;
        }
      }

      // Check if clip end snaps to any point
      const clipEnd = position + clipDuration;
      for (const snapPoint of snapPoints) {
        if (Math.abs(clipEnd - snapPoint) <= thresholdSeconds) {
          return snapPoint - clipDuration;
        }
      }

      return position;
    },
    [pixelsPerSecond],
  );

  // Setup DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  // Custom collision detection that prefers tracks over clips
  const collisionDetection = useCallback((args: Parameters<typeof rectIntersection>[0]) => {
    // First check for pointer-based collisions (more accurate)
    const pointerCollisions = pointerWithin(args);
    // Then check for rect intersections as fallback
    const rectCollisions = rectIntersection(args);
    const allCollisions = [...pointerCollisions, ...rectCollisions];

    // Prioritize track collisions over clip collisions
    const trackCollisions = allCollisions.filter((collision) => collision.data?.droppableContainer?.data?.current?.type === 'track');

    if (trackCollisions.length > 0) {
      return trackCollisions;
    }

    return allCollisions;
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === 'media') {
      setActiveMedia(active.data.current.media);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over, delta } = event;
      setActiveMedia(null);

      if (!over) return;

      const targetData = over.data.current;

      // Handle clip drag
      if (active.data.current?.type === 'clip' && active.data.current?.clip) {
        const clip = active.data.current.clip as AudioClip;

        // Calculate new start time based on drag delta
        const deltaTime = pixelsToSeconds(delta.x, pixelsPerSecond);
        let newStartTime = Math.max(0, clip.startTime + deltaTime);

        // Determine target track
        let targetTrackId = clip.trackId;
        if (targetData?.type === 'track' && targetData.track) {
          targetTrackId = targetData.track.id;
        }

        // Apply snapping
        const clipDuration = clip.trimEnd - clip.offset;
        const snapPoints = getSnapPointsForTrack(targetTrackId, clip.id);
        newStartTime = snapToNearby(newStartTime, snapPoints, clipDuration);

        moveClip(clip.id, targetTrackId, newStartTime);
      }

      // Handle media drop from pool
      if (active.data.current?.type === 'media' && active.data.current?.media) {
        const media = active.data.current.media as MediaFile;

        // Only allow dropping on tracks
        if (targetData?.type === 'track' && targetData.track) {
          const trackId = targetData.track.id;
          // Calculate drop position based on where the pointer is relative to the track
          // For now, place at start of timeline
          createClipFromMedia(media.id, trackId, 0);
        }
      }
    },
    [moveClip, createClipFromMedia, pixelsPerSecond, getSnapPointsForTrack, snapToNearby],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}

      {/* Drag overlay for media pool items only */}
      <DragOverlay>
        {activeMedia && (
          <div className="opacity-90 p-2 rounded-md border border-primary bg-primary/20 text-sm font-medium shadow-lg">
            {activeMedia.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
