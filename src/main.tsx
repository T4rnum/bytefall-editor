import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ErrorBoundary } from './app/components/ErrorBoundary';
import { installErrorCapture } from './app/store/errorStore';
import { installScene3DRenderer } from './app/scene3d/install';
import './app/styles/tokens.css';
import './app/styles/ui.css';
import './app/styles/app.css';
import './app/styles/timeline.css';
import './app/styles/nodes.css';
import './app/styles/curves.css';
import './app/styles/dock.css';

installErrorCapture();
installScene3DRenderer();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root is missing');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
