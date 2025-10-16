import { openDB } from 'idb';

// Unified database initialization
export const initAppDB = async () => {
  return openDB('readlearn-db', 1, {
    upgrade(db) {
      // Create texts store if it doesn't exist
      if (!db.objectStoreNames.contains('texts')) {
        db.createObjectStore('texts', { keyPath: 'id' });
      }
      
      // Create vocab store if it doesn't exist
      if (!db.objectStoreNames.contains('vocab')) {
        db.createObjectStore('vocab', { keyPath: 'id' });
      }
    },
  });
};