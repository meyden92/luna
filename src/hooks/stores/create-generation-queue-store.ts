import { create } from 'zustand';

interface QueueItemBase {
  id: string;
  status: string;
  progress: number;
  createdAt: number; // timestamp for serialization
  batchId?: string;
  error?: string;
}

type NewQueueItem<TItem extends QueueItemBase> = Omit<TItem, 'createdAt' | 'progress'> & { progress?: number };

export interface GenerationQueueState<TItem extends QueueItemBase> {
  generations: TItem[];
  selectedGenerationId: string | null;
  addGeneration: (item: NewQueueItem<TItem>) => void;
  addGenerations: (items: Array<NewQueueItem<TItem>>) => void;
  updateGeneration: (id: string, updates: Partial<TItem>) => void;
  updateGenerationsByBatch: (batchId: string, updates: Partial<TItem>) => void;
  removeGeneration: (id: string) => void;
  clearCompleted: () => void;
  restoreGenerationSnapshot: (snapshot: { generations: TItem[]; selectedGenerationId: string | null }) => void;
  setSelectedGenerationId: (id: string | null) => void;
}

export function createGenerationQueueStore<TItem extends QueueItemBase>({
  inProgressStatuses,
}: {
  inProgressStatuses: ReadonlyArray<TItem['status']>;
}) {
  const isInProgress = (gen: TItem) => inProgressStatuses.includes(gen.status);
  const withDefaults = (item: NewQueueItem<TItem>) => ({ ...item, progress: item.progress ?? 0, createdAt: Date.now() }) as TItem;

  return create<GenerationQueueState<TItem>>()((set) => ({
    generations: [] as TItem[],
    selectedGenerationId: null,

    addGeneration: (item) =>
      set((state) => ({
        generations: [withDefaults(item), ...state.generations],
      })),

    addGenerations: (items) =>
      set((state) => ({
        generations: [...items.map(withDefaults), ...state.generations],
      })),

    updateGeneration: (id, updates) =>
      set((state) => ({
        generations: state.generations.map((gen) => (gen.id === id ? { ...gen, ...updates } : gen)),
      })),

    updateGenerationsByBatch: (batchId, updates) =>
      set((state) => ({
        generations: state.generations.map((gen) => (gen.batchId === batchId ? { ...gen, ...updates } : gen)),
      })),

    removeGeneration: (id) =>
      set((state) => ({
        generations: state.generations.filter((gen) => gen.id !== id),
        selectedGenerationId: state.selectedGenerationId === id ? null : state.selectedGenerationId,
      })),

    clearCompleted: () =>
      set((state) => ({
        generations: state.generations.filter(isInProgress),
        selectedGenerationId: state.generations.find((gen) => gen.id === state.selectedGenerationId && isInProgress(gen))
          ? state.selectedGenerationId
          : null,
      })),

    restoreGenerationSnapshot: (snapshot) => set(snapshot),

    setSelectedGenerationId: (id) => set({ selectedGenerationId: id }),
  }));
}
