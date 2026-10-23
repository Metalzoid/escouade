import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { earlyAppearance } from './lib/appearance';
import { guardFileDrops } from './lib/attachments';
import { guardLinks } from './lib/links';

// The app is a desktop window: keep the browser's own context menu out of the way,
// except in text fields where copy/paste matters.
window.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest('input, textarea, .md, .xterm')) e.preventDefault();
});

// Files are dropped on the composer only: anywhere else the WebView would open them.
guardFileDrops(window);

// A link never takes the window away from the app: the ones that go outside open in the browser.
guardLinks(document);

// The theme the page kept, before the first render: the settings say it again a moment later.
earlyAppearance();

mount(App, { target: document.getElementById('app')! });
