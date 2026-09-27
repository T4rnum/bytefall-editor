import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installScene3DRenderer } from './app/scene3d/install';
import './app/styles/tokens.css';
import './app/styles/ui.css';
import './app/styles/app.css';
import './app/styles/timeline.css';
import './app/styles/nodes.css';
import './app/styles/dock.css';

installScene3DRenderer();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root is missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
