import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
const DeveloperPage = React.lazy(
  () => import('./pages/developer/DeveloperPage'),
);
import { ErrorBoundary } from './features/ErrorBoundary';
import './styles.css';
import './landing.css';
import './room.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);
const surface = import.meta.env.VITE_SURFACE === 'admin' ? 'admin' : 'public';
// Release the old root when Vite replaces this entry module in development.
import.meta.hot?.dispose(() => root.unmount());
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <React.Suspense fallback={<p role="status">Loading Strangely…</p>}>
        {surface === 'admin' ? <DeveloperPage /> : <App />}
      </React.Suspense>
    </ErrorBoundary>
  </React.StrictMode>,
);
