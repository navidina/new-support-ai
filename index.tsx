
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Global Error Handler for Production/Deployment issues
window.addEventListener('error', (e) => {
    // Only hijack if root is empty (app failed to mount)
    if (rootElement && rootElement.innerHTML.trim() === '') {
        rootElement.innerHTML = `
            <div style="
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                background: #020617; 
                color: #ef4444; 
                font-family: sans-serif;
                text-align: center;
                padding: 20px;
                direction: ltr;
            ">
                <div style="background: rgba(239, 68, 68, 0.1); padding: 15px; border-radius: 50%; margin-bottom: 20px;">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                </div>
                <h1 style="font-size: 1.5rem; margin-bottom: 1rem; font-weight: 700; color: white;">Application Failed to Start</h1>
                <p style="color: #94a3b8; margin-bottom: 2rem; max-width: 400px; line-height: 1.5;">
                    A critical error occurred while initializing the application. This is often due to missing dependencies or build configuration issues.
                </p>
                <div style="
                    background: #1e293b; 
                    padding: 20px; 
                    border-radius: 12px; 
                    text-align: left; 
                    overflow: auto; 
                    width: 100%;
                    max-width: 800px;
                    border: 1px solid #334155;
                    font-family: monospace;
                    font-size: 0.85rem;
                    color: #e2e8f0;
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
                ">
                    <div style="color: #64748b; margin-bottom: 8px; font-weight: bold;">ERROR DETAILS:</div>
                    ${e.message}
                    ${e.filename ? `<br/><span style="color: #475569">${e.filename}:${e.lineno}</span>` : ''}
                </div>
            </div>
        `;
    }
});

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
