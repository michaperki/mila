import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { openDB } from 'idb'
import { StarredItem } from '../types'
import { initAppDB } from '../lib/database';

interface VocabState {
  vocab: StarredItem[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: number;
  getVocab: () => Promise<StarredItem[]>;
  starItem: (item: StarredItem) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  searchVocab: (query: string) => StarredItem[];
  exportVocab: () => string;
  importVocab: (jsonData: string) => Promise<boolean>;
  clearVocab: () => Promise<void>;
}

export const useVocabStore = create<VocabState>()(
  persist(
    (set, get) => ({
      vocab: [],
      isLoading: false,
      error: null,
      lastUpdated: Date.now(),

      getVocab: async () => {
        try {
          set({ isLoading: true, error: null });
          const db = await initAppDB();
          const vocab = await db.getAll('vocab');

          // Sort by createdAt in descending order (newest first)
          const sortedVocab = vocab.sort((a, b) => b.createdAt - a.createdAt);

          set({ vocab: sortedVocab, isLoading: false, lastUpdated: Date.now() });
          return sortedVocab;
        } catch (error) {
          set({ error: (error as Error).message, isLoading: false });
          return [];
        }
      },

      starItem: async (item: StarredItem) => {
        try {
          set({ isLoading: true, error: null });
          const db = await initAppDB();

          // Check if the lemma already exists
          const vocab = get().vocab;
          const existingItem = vocab.find(v => v.lemma === item.lemma);

          if (existingItem) {
            // Update the existing item with the new data but keep the original ID
            const updatedItem = {
              ...item,
              id: existingItem.id,
              createdAt: Date.now() // Update timestamp to move it to top
            };

            await db.put('vocab', updatedItem);

            const updatedVocab = vocab.map(v =>
              v.id === existingItem.id ? updatedItem : v
            );

            set({ vocab: updatedVocab, isLoading: false, lastUpdated: Date.now() });
          } else {
            // Add new item
            await db.put('vocab', item);
            set({
              vocab: [item, ...vocab],
              isLoading: false,
              lastUpdated: Date.now()
            });
          }
        } catch (error) {
          set({ error: (error as Error).message, isLoading: false });
        }
      },

      removeItem: async (id: string) => {
        try {
          set({ isLoading: true, error: null });
          const db = await initAppDB();
          await db.delete('vocab', id);

          // Update the vocab list
          const vocab = get().vocab.filter(item => item.id !== id);
          set({ vocab, isLoading: false, lastUpdated: Date.now() });
        } catch (error) {
          set({ error: (error as Error).message, isLoading: false });
        }
      },

      // Search vocabulary items by lemma or translation
      searchVocab: (query: string) => {
        if (!query || query.trim() === '') {
          return get().vocab;
        }

        const normalizedQuery = query.toLowerCase().trim();
        return get().vocab.filter(
          item =>
            item.lemma.toLowerCase().includes(normalizedQuery) ||
            item.gloss.toLowerCase().includes(normalizedQuery)
        );
      },

      // Export vocab as JSON string
      exportVocab: () => {
        const vocab = get().vocab;
        return JSON.stringify({
          version: 1,
          timestamp: Date.now(),
          items: vocab
        }, null, 2);
      },

      // Import vocab from JSON string
      importVocab: async (jsonData: string) => {
        try {
          set({ isLoading: true, error: null });

          // Parse JSON data
          const parsed = JSON.parse(jsonData);

          // Validate structure
          if (!parsed.items || !Array.isArray(parsed.items)) {
            throw new Error('Invalid vocabulary data format');
          }

          // Verify each item has required properties
          const validItems = parsed.items.filter((item: any) =>
            item.id && item.lemma && item.gloss
          );

          if (validItems.length === 0) {
            throw new Error('No valid vocabulary items found');
          }

          // Store in database
          const db = await initAppDB();
          const tx = db.transaction('vocab', 'readwrite');

          // Add all items to database
          await Promise.all(
            validItems.map((item: StarredItem) => tx.store.put(item))
          );

          await tx.done;

          // Update state
          await get().getVocab();
          set({ isLoading: false, lastUpdated: Date.now() });

          return true;
        } catch (error) {
          set({
            error: `Import failed: ${(error as Error).message}`,
            isLoading: false
          });
          return false;
        }
      },

      // Clear all vocabulary
      clearVocab: async () => {
        try {
          set({ isLoading: true, error: null });

          const db = await initAppDB();
          const tx = db.transaction('vocab', 'readwrite');
          await tx.store.clear();
          await tx.done;

          set({
            vocab: [],
            isLoading: false,
            lastUpdated: Date.now()
          });
        } catch (error) {
          set({
            error: `Clear failed: ${(error as Error).message}`,
            isLoading: false
          });
        }
      }
    }),
    {
      name: 'readlearn-vocab-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        vocab: state.vocab,
        lastUpdated: state.lastUpdated
      }),
    }
  )
);