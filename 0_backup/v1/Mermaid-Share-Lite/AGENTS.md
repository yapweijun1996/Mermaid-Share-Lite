# Agent Instructions: Mermaid Share Lite

This document guides agents (AI or human) working on the `Mermaid Share Lite` repository.
The project is a lightweight, client-side, single-file application for editing and sharing Mermaid diagrams.

## 1. Project Overview & Build

### Architecture
- **Type:** Single-page Application (SPA) contained entirely within `index.html`.
- **Stack:** Vanilla HTML5, CSS3, and JavaScript (ES Modules).
- **No Build System:** There is **NO** `npm`, `package.json`, or bundler. The file is ready to run as-is.
- **Dependencies:** External libraries are loaded via CDN (jsdelivr):
  - `mermaid` (ESM version) for diagram rendering.
  - `pako` for compression/decompression of state in URLs.

### Commands
Since there is no build toolchain, standard commands like `npm test` do not exist.

- **Run/Debug:**
  - Open `index.html` directly in a web browser.
  - Or serve with a simple static server: `python3 -m http.server 8000` or `npx serve`.
- **Linting:**
  - No automated linter is configured.
  - Agents must strictly self-enforce the code style described below.
- **Testing:**
  - **Manual:** Verify changes by rendering the default diagram, changing themes, and testing the "Copy Share Link" feature.
  - **Key Flows:**
    1.  **Render:** Typing in the textarea updates the preview (debounced).
    2.  **Share:** "Copy Share Link" generates a URL with a `#pako:` hash.
    3.  **Restore:** Opening that URL restores the code and theme.

## 2. Code Style & Conventions

### JavaScript (ES Modules)
The script is located at the bottom of `<body>` in a `<script type="module">` block.

- **Indentation:** **2 spaces**.
- **Formatting:**
  - Use semicolons `;`.
  - Use double quotes `"` for strings (unless nesting requires single quotes).
  - Put opening braces `{` on the same line.
- **Variables:**
  - Use `const` by default, `let` if reassignment is needed.
  - **DOM Elements:** Prefix variables storing DOM nodes with `$` (e.g., `$code`, `$preview`, `$theme`).
- **Naming:**
  - Functions: `camelCase` (e.g., `renderNow`, `encodeToHash`).
  - Constants: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_CODE`).
- **Imports:**
  - Use full URL imports for CDN packages.
  - Example: `import mermaid from "https://cdn..."`.

### HTML & CSS
- **HTML:**
  - Use semantic tags where appropriate.
  - Layout structure: `.wrap` (grid) > `.left` (editor) + `.right` (preview).
- **CSS:**
  - Located in the `<head>` style block.
  - Use simple class names.
  - **Flexbox/Grid:** Use for layout (Grid for main columns, Flex for toolbars).
  - **System Fonts:** `system-ui, -apple-system, ...` for performance and native feel.

### Language & Comments
- **Comments:** The codebase currently uses **Chinese** for comments (e.g., `// 复制分享链接`).
  - **Instruction:** When adding new comments, you may use English for broad compatibility, or Chinese if modifying existing sections to maintain consistency.
- **UI Text:**
  - Buttons: English (e.g., "Render", "Reset").
  - Hints/Messages: Mixed (e.g., `链接用 #pako:... 存内容`).

## 3. Core Logic & Implementation

### State Management (URL Hash)
The application state (code + theme) is stored in the URL fragment.
- **Format:** `#pako:<base64url_of_compressed_json>`
- **Flow:**
  1.  `JSON.stringify({ code, mermaid: { theme } })`
  2.  `pako.deflate` (zlib compression)
  3.  `u8ToB64Url` (Custom Base64URL encoding handling `+`/`/` replacement)

### Diagram Rendering
- **Library:** Mermaid v11+.
- **Security:** `securityLevel: "strict"` is configured in initialization.
- **Process:**
  1.  `mermaid.parse(code)` checks syntax.
  2.  `mermaid.render(id, code)` generates SVG.
  3.  Resulting SVG is injected into `$preview.innerHTML`.

### Error Handling
- **User Feedback:** Errors must be caught and displayed in the `$err` div.
- **Syntax Errors:** When `mermaid.parse` fails, clear the preview or keep the last valid one, and show the error message in red.

## 4. Agent Operational Rules

1.  **Single File Policy:**
    - Do **not** split the code into separate `.js` or `.css` files unless explicitly asked to "refactor into a structured project".
    - Keep everything in `index.html`.

2.  **Dependency Management:**
    - Do **not** try to run `npm install`.
    - If a new library is needed, add it via CDN import in the module script.

3.  **Preserve Functionality:**
    - Always ensure the "Share Link" logic (compression/decompression) remains backward compatible if possible.
    - Do not remove the `debounce` logic on the input listener (prevents excessive rendering).

4.  **Security:**
    - Maintain `securityLevel: "strict"` in Mermaid config to prevent XSS via diagram code.
    - Be careful with `innerHTML` usage outside of the sanitized SVG from Mermaid.

5.  **Refactoring:**
    - If modifying the CSS, check if the class is used in JS (e.g., for toggling states).
    - If renaming IDs in HTML, update the corresponding `getElementById` calls immediately.
