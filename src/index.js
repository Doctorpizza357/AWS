import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import favicon from './assets/logo.png';

// Set favicon dynamically from bundled asset
try {
  const setFavicon = (href) => {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.getElementsByTagName('head')[0].appendChild(link);
    }
    link.href = href;
  };

  if (favicon) setFavicon(favicon);
} catch (e) {
  // ignore in non-browser environments
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
