# Mermaid Share Lite

A lightweight, serverless, client-side editor for [Mermaid](https://mermaid.js.org/) diagrams.

It allows you to edit diagrams with real-time preview and generate **shareable URLs** that store the entire diagram state. No database or backend is required—everything is compressed and stored in the URL hash.

## Features

- **Real-time Preview:** See your diagram update instantly as you type (with debounce).
- **Serverless Sharing:** "Copy Share Link" generates a URL containing the compressed diagram code.
- **Theme Support:** Switch between Default, Dark, Forest, Neutral, and Base Mermaid themes.
- **Right-Click Visual Editing:** Right-click nodes in flowcharts to add child nodes, create Yes/No branches, connect nodes, change shapes, or delete — no syntax knowledge required.
- **PWA Support:** Installable as a Progressive Web App with offline caching and auto-update service worker.
- **Apple Safe Area:** Supports `viewport-fit=cover` and `env(safe-area-inset-*)` for notched devices.
- **Mobile Responsive:** Tab-based layout on mobile with Code/Preview switching.
- **Presentation Mode:** Full-screen presentation with laser pointer and arrow hover effects.
- **Export:** Download diagrams as SVG or PNG.
- **Inline Editing:** Double-click nodes to edit labels directly in the preview.
- **Pan & Zoom:** Interactive SVG navigation with mouse wheel and controls.
- **Lightweight:** Simple static structure (HTML + JS + CSS). Zero build steps. No `npm install` needed.
- **Secure:** Uses Mermaid's strict security level.

## Quick Start

### Online

Simply host this folder on any static hosting service (GitHub Pages, Vercel, Netlify).

### Local

1. Clone or download this repository.
2. Open `index.html` directly in your browser.
   *Or for a better experience (to avoid local file restrictions), run a simple server:*
   ```bash
   # Python
   python3 -m http.server 8000

   # Node.js
   npx serve
   ```
3. Open `http://localhost:8000`

## How it Works

The application does not use a database. Instead, it uses **URL Fragment Compression**:

1. **State Capture:** Takes your Mermaid code and selected theme.
2. **Compression:** Compresses the data using `pako` (zlib/deflate).
3. **Encoding:** Converts the binary result to a URL-safe Base64 string.
4. **Result:** Produces a link like `https://yoursite.com/#pako:eNq1...`

When someone opens the link, the app reverses this process to restore your diagram.

## Right-Click Visual Editing (Flowchart)

For flowchart diagrams, right-click on the preview to visually edit:

| Action | Description |
|--------|-------------|
| **Right-click node** | Add child node, Yes/No branch, connect to another node, change shape, or delete |
| **Right-click arrow** | Delete connection |
| **Right-click empty space** | Add a new standalone node |

The node dialog lets you choose from 5 shapes: Rectangle, Rounded, Diamond, Circle, and Stadium.

## PWA & Offline

The app includes a service worker (`sw.js`) that:
- Pre-caches all local assets for offline use
- Uses network-first strategy for local files (always fetches latest)
- Uses cache-first strategy for CDN resources
- Auto-updates: bump `APP_VERSION` in `sw.js` to trigger cache refresh
- Notifies users when a new version is available

To install as PWA: open in a supported browser and use "Add to Home Screen" or "Install App".

## Dependencies

All dependencies are loaded via ESM from jsDelivr CDN:
- [Mermaid.js](https://github.com/mermaid-js/mermaid) (Diagram rendering)
- [CodeMirror](https://codemirror.net/) (Code editor with line numbers)
- [Pako](https://github.com/nodeca/pako) (Zlib compression for URLs)
- [svg-pan-zoom](https://github.com/bumbu/svg-pan-zoom) (Pan & zoom for SVG)

## License

MIT
