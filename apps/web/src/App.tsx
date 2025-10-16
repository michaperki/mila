import { Route, Routes, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import BottomBar from './components/BottomBar'
import { checkDatabaseHealth } from './lib/database'

// Lazy loaded routes for better initial load performance
const Home = lazy(() => import('./routes/Home'))
const Reader = lazy(() => import('./routes/Reader'))
const Vocab = lazy(() => import('./routes/Vocab'))
const Settings = lazy(() => import('./routes/Settings'))

// Loading fallback
const LoadingFallback = () => (
  <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 64px)' }}>
    <div>Loading...</div>
  </div>
)

function App() {
  const [dbHealthy, setDbHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    // Check database health on component mount
    const checkDb = async () => {
      try {
        // Try multiple times with a delay between attempts
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            console.log(`Database health check attempt ${attempt + 1}`);
            const isHealthy = await checkDatabaseHealth();

            if (isHealthy) {
              console.log('Database health check passed');
              setDbHealthy(true);
              return;
            } else {
              console.warn(`Attempt ${attempt + 1}: Database health check failed, will retry...`);
              // Wait a bit before retrying
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } catch (attemptError) {
            console.error(`Attempt ${attempt + 1} error:`, attemptError);
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        // If we get here, all attempts failed
        console.error('All database health check attempts failed');
        setDbHealthy(false);
      } catch (error) {
        console.error('Database check process error:', error);
        setDbHealthy(false);
      }
    };

    checkDb();
  }, []);

  // If database check is in progress, show loading
  if (dbHealthy === null) {
    return <LoadingFallback />;
  }

  // If database is not healthy, show error and recovery options
  if (dbHealthy === false) {
    const handleFixDatabase = async () => {
      try {
        // Try to delete and recreate the database
        const indexedDB = window.indexedDB;
        const deleteRequest = indexedDB.deleteDatabase('readlearn-db');

        deleteRequest.onsuccess = () => {
          console.log('Database deleted successfully');
          window.location.reload();
        };

        deleteRequest.onerror = (event) => {
          console.error('Could not delete database:', event);
        };
      } catch (error) {
        console.error('Failed to reset database:', error);
        alert('Failed to reset database. Please try reloading the page.');
      }
    };

    return (
      <div className="flex items-center justify-center flex-col" style={{ height: '100vh' }}>
        <div className="p-6 bg-red-50 border border-red-200 text-red-800 rounded max-w-md">
          <h2 className="text-lg font-bold mb-2">Database Connection Error</h2>
          <p className="mb-4">
            The app cannot connect to its local database. This might be due to a browser storage issue.
          </p>

          <div className="flex flex-col gap-3">
            <button
              className="btn bg-red-600 text-white hover:bg-red-700"
              onClick={() => window.location.reload()}
            >
              Reload App
            </button>

            <button
              className="btn bg-orange-600 text-white hover:bg-orange-700"
              onClick={handleFixDatabase}
            >
              Reset Database
            </button>

            <div className="mt-2 p-3 bg-white bg-opacity-60 rounded text-sm">
              <p className="font-medium mb-1">Troubleshooting Steps:</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Try reloading the app first</li>
                <li>If that doesn't work, click "Reset Database" to clear and rebuild the database</li>
                <li>If problems persist, try using a different browser</li>
                <li>You may also try clearing your browser's site data</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <main className="main-content">
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/reader/:textId" element={<Reader />} />
            <Route path="/vocab" element={<Vocab />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <BottomBar />
    </>
  )
}

export default App