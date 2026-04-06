# Mermaid Share Lite

A lightweight, serverless, client-side editor for [Mermaid](https://mermaid.js.org/) diagrams.

It allows you to edit diagrams with real-time preview and generate **shareable URLs** that store the entire diagram state. No database or backend is required—everything is compressed and stored in the URL hash.

## Features

- **Real-time Preview:** See your diagram update instantly as you type (with debounce).
- **Serverless Sharing:** "Copy Share Link" generates a URL containing the compressed diagram code.
- **Theme Support:** Switch between Default, Dark, Forest, and Neutral Mermaid themes.
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

## Dependencies

All dependencies are loaded via ESM from jsDelivr CDN:
- [Mermaid.js](https://github.com/mermaid-js/mermaid) (Diagram rendering)
- [Pako](https://github.com/nodeca/pako) (Zlib compression for URLs)

## License

MIT
