import { Route, Routes, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import BottomBar from './components/BottomBar'

// Lazy loaded routes for better initial load performance
const Home = lazy(() => import('./routes/Home'))
const Reader = lazy(() => import('./routes/Reader'))
const Vocab = lazy(() => import('./routes/Vocab'))

// Loading fallback
const LoadingFallback = () => (
  <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 64px)' }}>
    <div>Loading...</div>
  </div>
)

function App() {
  return (
    <>
      <main className="main-content">
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/reader/:textId" element={<Reader />} />
            <Route path="/vocab" element={<Vocab />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <BottomBar />
    </>
  )
}

export default App