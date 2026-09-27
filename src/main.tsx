import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'
import { Analytics } from './components/Analytics.tsx'
import { ensureStorageValid } from './hooks/useLocalStorage.ts'

import "./main.css"
import "./styles/theme.css"
import "./index.css"

// Check if localStorage has expired (7 days since last visit)
// If so, clear all settings to start fresh
const wasCleared = ensureStorageValid()
if (wasCleared) {
  console.log('[App] Local storage was cleared due to inactivity. Starting fresh.')
}

// Analytics is opt-out (legitimate interest): <Analytics /> loads the tracker
// unless the visitor switched it off or the browser sends Global Privacy Control.
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <Analytics />
    <App />
   </ErrorBoundary>
)
