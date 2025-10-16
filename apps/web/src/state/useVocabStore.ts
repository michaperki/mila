import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { openDB, IDBPDatabase } from 'idb'
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

async function ensureFrequency(
  items: StarredItem[],
  db: IDBPDatabase<unknown>
): Promise<StarredItem[]> {
  let changed = false;
  const normalized = items.map((item) => {
    if (!item.frequency || item.frequency < 1) {
      changed = true;
      return { ...item, frequency: 1 };
    }
    return item;
  });

  if (changed) {
    const tx = db.transaction('vocab', 'readwrite');
    await Promise.all(normalized.map((item) => tx.store.put(item)));
    await tx.done;
  }

  return normalized;
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

          // Ensure database is initialized properly
          try {
            const db = await initAppDB();
            const rawVocab = await db.getAll('vocab') as StarredItem[];
            const normalizedVocab = await ensureFrequency(rawVocab, db);

            // Sort by createdAt in descending order (newest first)
            const sortedVocab = normalizedVocab.sort((a, b) => b.createdAt - a.createdAt);

            set({ vocab: sortedVocab, isLoading: false, lastUpdated: Date.now(), error: null });
            return sortedVocab;
          } catch (dbError) {
            console.error('Database initialization error:', dbError);

            // Try reinitializing the database
            try {
              // Force a new connection by using a different version number temporarily
              const tempDB = await openDB('readlearn-db', 2, {
                upgrade(db) {
                  // Create vocab store if it doesn't exist
                  if (!db.objectStoreNames.contains('vocab')) {
                    db.createObjectStore('vocab', { keyPath: 'id' });
                  }
                  if (!db.objectStoreNames.contains('texts')) {
                    db.createObjectStore('texts', { keyPath: 'id' });
                  }
                },
              });

              // Close the temporary connection
              tempDB.close();

              // Try the original connection again
              const db = await initAppDB();
              const rawVocab = await db.getAll('vocab') as StarredItem[];
              const normalizedVocab = await ensureFrequency(rawVocab, db);

              const sortedVocab = normalizedVocab.sort((a, b) => b.createdAt - a.createdAt);

              set({ vocab: sortedVocab, isLoading: false, lastUpdated: Date.now(), error: null });
              return sortedVocab;
            } catch (retryError) {
              throw new Error(`Database initialization failed. Please reload the app. Details: ${(retryError as Error).message}`);
            }
          }
        } catch (error) {
          set({ error: (error as Error).message, isLoading: false });
          return [];
        }
      },

      starItem: async (item: StarredItem) => {
        try {
          set({ isLoading: true, error: null });

          // Ensure database is initialized
          await get().getVocab();

          const db = await initAppDB();

          // Check if the lemma already exists
          const vocab = get().vocab;
          const existingItem = vocab.find(v => v.lemma === item.lemma);

          if (existingItem) {
            // Update the existing item with the new data but keep the original ID
            const updatedItem = {
              ...existingItem,
              gloss: item.gloss, // Update gloss in case it has changed
              createdAt: Date.now(), // Update timestamp to move it to top
              frequency: (existingItem.frequency || 1) + 1, // Increment frequency
            };

            await db.put('vocab', updatedItem);

            const updatedVocab = vocab.map(v =>
              v.id === existingItem.id ? updatedItem : v
            );

            set({ vocab: updatedVocab, isLoading: false, lastUpdated: Date.now(), error: null });
          } else {
            // Add new item with frequency 1
            const newItem = { ...item, frequency: 1 };
            await db.put('vocab', newItem);
            set({
              vocab: [newItem, ...vocab],
              isLoading: false,
              lastUpdated: Date.now(),
              error: null
            });
          }
        } catch (error) {
          console.error('Error starring item:', error);
          set({ error: (error as Error).message, isLoading: false });
        }
      },

      removeItem: async (id: string) => {
        try {
          set({ isLoading: true, error: null });

          // Ensure database is initialized
          await get().getVocab();

          const db = await initAppDB();
          await db.delete('vocab', id);

          // Update the vocab list
          const vocab = get().vocab.filter(item => item.id !== id);
          set({ vocab, isLoading: false, lastUpdated: Date.now(), error: null });
        } catch (error) {
          console.error('Error removing item:', error);
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

          // Ensure database is initialized
          await get().getVocab();

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
            validItems.map((item: StarredItem) => {
              const itemToStore: StarredItem = {
                ...item,
                frequency: item.frequency && item.frequency > 0 ? item.frequency : 1
              };
              return tx.store.put(itemToStore);
            })
          );

          await tx.done;

          // Update state
          await get().getVocab();
          set({ isLoading: false, lastUpdated: Date.now(), error: null });

          return true;
        } catch (error) {
          console.error('Import failed:', error);
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

          // Ensure database is initialized
          await get().getVocab();

          const db = await initAppDB();
          const tx = db.transaction('vocab', 'readwrite');
          await tx.store.clear();
          await tx.done;

          set({
            vocab: [],
            isLoading: false,
            lastUpdated: Date.now(),
            error: null
          });
        } catch (error) {
          console.error('Clear vocab failed:', error);
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
