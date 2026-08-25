import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { getMermaidErrorMessage } from './components/MarkdownRenderer';
import { GoogleOAuthProvider } from '@react-oauth/google';

// Suppress WebSocket errors and unhandled rejections
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', function(event) {
    const isWebSocketError = 
      (event.reason && typeof event.reason.message === 'string' && event.reason.message.includes('WebSocket')) ||
      (typeof event.reason === 'string' && event.reason.includes('WebSocket')) ||
      (event.reason && event.reason.toString && event.reason.toString().includes('WebSocket'));

    if (isWebSocketError) {
      event.preventDefault();
      return;
    }
  });

  window.addEventListener('error', function(event) {
    if (event.message && typeof event.message === 'string' && event.message.includes('WebSocket')) {
      event.preventDefault();
      return;
    }
  });
  const originalError = console.error;
  console.error = function(...args) {
      if (typeof args[0] === 'string' && args[0].includes('[vite] failed to connect to websocket')) {
          return;
      }
      originalError.apply(console, args);
  };
}

try {
  // Apply dark mode class from localStorage
  if (localStorage.getItem('aurenex-theme') === 'dark' || 
      (!('aurenex-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
} catch (e) {
  // Fallback to system preference if localStorage is blocked
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

// Make the error parser globally available for index.html script
(window as any).getMermaidErrorMessage = getMermaidErrorMessage;


const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || 'placeholder'}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
);