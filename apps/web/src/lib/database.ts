import { openDB, deleteDB, IDBPDatabase } from 'idb';

// Global reference to ensure we're reusing the same connection
let dbInstance: IDBPDatabase | null = null;

// Handle any existing blocked connections
const handleBlocked = () => {
  // If there's an existing connection that's blocking the upgrade
  console.warn('Database upgrade blocked by existing connections');
  // Close the current connection if it exists
  if (dbInstance) {
    try {
      dbInstance.close();
      dbInstance = null;
    } catch (e) {
      console.error('Error closing existing database connection', e);
    }
  }
};

// Check if database is working properly and fix if needed
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    // Reset any existing instance to force a clean connection
    dbInstance = null;

    // Force a clean database connection with proper upgrades
    const db = await openDB('readlearn-db', 1, {
      upgrade(db) {
        // Create texts store if it doesn't exist
        if (!db.objectStoreNames.contains('texts')) {
          console.log('Creating missing texts store');
          db.createObjectStore('texts', { keyPath: 'id' });
        }

        // Create vocab store if it doesn't exist
        if (!db.objectStoreNames.contains('vocab')) {
          console.log('Creating missing vocab store');
          db.createObjectStore('vocab', { keyPath: 'id' });
        }
      },
      blocked: handleBlocked,
      blocking() {
        console.warn('This connection is blocking a db upgrade');
      }
    });

    // Test reading from both stores
    try {
      await db.transaction('vocab', 'readonly')
        .objectStore('vocab')
        .count();

      await db.transaction('texts', 'readonly')
        .objectStore('texts')
        .count();

      // Store the verified working instance
      dbInstance = db;
      return true;
    } catch (readError) {
      console.error('Store verification failed:', readError);

      // Try one more time with database deletion
      db.close();
      await deleteDB('readlearn-db');

      // Recreate the database with both stores
      const newDb = await openDB('readlearn-db', 1, {
        upgrade(db) {
          // Always create both stores
          db.createObjectStore('texts', { keyPath: 'id' });
          db.createObjectStore('vocab', { keyPath: 'id' });
        }
      });

      // Test again
      await newDb.transaction('vocab', 'readonly')
        .objectStore('vocab')
        .count();

      await newDb.transaction('texts', 'readonly')
        .objectStore('texts')
        .count();

      // Store the working instance
      dbInstance = newDb;
      return true;
    }
  } catch (error) {
    console.error('Database health check failed:', error);
    // Clear the instance to force recreation on next attempt
    dbInstance = null;
    return false;
  }
};

// Unified database initialization
export const initAppDB = async (retry = true) => {
  try {
    // Return existing instance if available and verify it works
    if (dbInstance) {
      try {
        // Quick test to make sure the connection is still valid
        await dbInstance.transaction('vocab', 'readonly')
          .objectStore('vocab')
          .count();
        return dbInstance;
      } catch (connectionError) {
        console.warn('Existing database connection failed, creating new one:', connectionError);
        dbInstance = null;
      }
    }

    // Create a new connection
    const db = await openDB('readlearn-db', 1, {
      upgrade(db) {
        console.log('Running database upgrade...');
        // Create texts store if it doesn't exist
        if (!db.objectStoreNames.contains('texts')) {
          console.log('Creating texts store');
          db.createObjectStore('texts', { keyPath: 'id' });
        }

        // Create vocab store if it doesn't exist
        if (!db.objectStoreNames.contains('vocab')) {
          console.log('Creating vocab store');
          db.createObjectStore('vocab', { keyPath: 'id' });
        }
      },
      blocked: handleBlocked,
      blocking() {
        console.warn('This connection is blocking a db upgrade');
      },
      terminated() {
        console.warn('Database connection was terminated unexpectedly');
        dbInstance = null;
      }
    });

    // Verify stores exist by attempting to access them
    try {
      await db.transaction('vocab', 'readonly')
        .objectStore('vocab')
        .count();

      await db.transaction('texts', 'readonly')
        .objectStore('texts')
        .count();
    } catch (storeError) {
      console.error('Store verification error after initialization:', storeError);

      // Close and try to recreate database
      db.close();
      throw new Error('Database stores not properly created');
    }

    // Store the instance for reuse
    dbInstance = db;
    return db;
  } catch (error) {
    console.error('Database initialization error:', error);

    // If this is the first attempt and we should retry
    if (retry) {
      console.log('Attempting database recovery by deleting and recreating...');

      try {
        // Reset the database instance
        dbInstance = null;

        // Delete the database
        await deleteDB('readlearn-db', {
          blocked: handleBlocked
        });

        // Create a fresh database with explicit store creation
        const freshDb = await openDB('readlearn-db', 1, {
          upgrade(db) {
            console.log('Creating fresh database stores');
            // Always create both stores
            db.createObjectStore('texts', { keyPath: 'id' });
            db.createObjectStore('vocab', { keyPath: 'id' });
          },
          blocked: handleBlocked
        });

        // Verify the stores exist
        await freshDb.transaction('vocab', 'readonly')
          .objectStore('vocab')
          .count();

        await freshDb.transaction('texts', 'readonly')
          .objectStore('texts')
          .count();

        // Set as instance and return
        dbInstance = freshDb;
        return freshDb;
      } catch (recoveryError) {
        console.error('Database recovery failed:', recoveryError);
        throw new Error(`Database initialization failed. Please reload the app. Details: ${(error as Error).message}`);
      }
    } else {
      // If we've already tried recovery once, give up
      throw new Error(`Database initialization failed after recovery attempt. Please reload the app. Details: ${(error as Error).message}`);
    }
  }
};