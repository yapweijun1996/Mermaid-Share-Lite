import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
import pako from "../lib/pako.esm.mjs";

window.mermaid = mermaid;

// --- DOM Elements ---
const $code = document.getElementById("code");
const $preview = document.getElementById("preview");
const $err = document.getElementById("error-container");
const $theme = document.getElementById("theme");
const $template = document.getElementById("template");
const $toast = document.getElementById("toast");
const $inlineEditor = document.getElementById("inline-editor");

// --- CodeMirror Init ---
// Initialize CodeMirror on the textarea
const editor = CodeMirror.fromTextArea($code, {
  lineNumbers: true,
  mode: "markdown", // Good enough for Mermaid syntax highlighting
  theme: "default",
  lineWrapping: true,
  indentUnit: 2,
  tabSize: 2
});

const TEMPLATES = {
  flowchart: `flowchart TD
  A[Start] --> B{Is it working?}
  B -- Yes --> C[Great!]
  B -- No --> D[Debug]
  D --> B`,
  sequence: `sequenceDiagram
  Alice->>John: Hello John, how are you?
  John-->>Alice: Great!
  Alice-)John: See you later!`,
  class: `classDiagram
  Animal <|-- Duck
  Animal <|-- Fish
  Animal <|-- Zebra
  class Animal{
    +int age
    +String gender
    +isMammal()
    +mate()
  }
  class Duck{
    +String beakColor
    +swim()
    +quack()
  }`,
  state: `stateDiagram-v2
  [*] --> Still
  Still --> [*]
  Still --> Moving
  Moving --> Still
  Moving --> Crash
  Crash --> [*]`,
  er: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE-ITEM : contains
  CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`,
  gantt: `gantt
  title A Gantt Diagram
  dateFormat  YYYY-MM-DD
  section Section
  A task           :a1, 2014-01-01, 30d
  Another task     :after a1  , 20d
  section Another
  Task in sec      :2014-01-12  , 12d
  anther task      : 24d`,
  pie: `pie title Pets adopted by volunteers
  "Dogs" : 386
  "Cats" : 85
  "Rats" : 15`,
  git: `gitGraph
  commit
  commit
  branch develop
  checkout develop
  commit
  commit
  checkout main
  merge develop
  commit`,
  mindmap: `mindmap
  root((mindmap))
    Origins
      Long history
      ::icon(fa fa-book)
      Popularisation
        British popular psychology author Tony Buzan
    Research
      On effectiveness<br/>and features
      On Automatic creation
        Uses
            Creative techniques
            Strategic planning
            Argument mapping`
};

const DEFAULT_CODE = TEMPLATES.flowchart;

// --- Utils: Base64URL & Compression ---
function u8ToB64Url(u8) {
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64UrlToU8(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

function encodeToHash(code, theme) {
  const payload = { code, mermaid: { theme } };
  const json = JSON.stringify(payload);
  const compressed = pako.deflate(json, { level: 9 });
  return `#pako:${u8ToB64Url(compressed)}`;
}

function decodeFromHash(hash) {
  if (!hash?.startsWith("#pako:")) return null;
  try {
    const b64url = hash.slice("#pako:".length);
    const u8 = b64UrlToU8(b64url);
    const json = new TextDecoder().decode(pako.inflate(u8));
    const payload = JSON.parse(json);
    return {
      code: typeof payload.code === "string" ? payload.code : "",
      theme: payload?.mermaid?.theme || "default",
    };
  } catch (e) {
    console.error("Decode failed", e);
    return null;
  }
}

function showToast(msg) {
  $toast.textContent = msg;
  $toast.classList.add("show");
  setTimeout(() => $toast.classList.remove("show"), 2500);
}

// --- Auto-fix Node Labels (自动修复节点标签) ---
/**
 * 自动给含有特殊符号的 flowchart 节点标签加双引号
 * 例如: A[text (note)] -> A["text (note)"]
 * 
 * 策略：逐行扫描，找到节点定义，用括号配对算法提取标签
 */
function autoFixNodeLabels(code) {
  // 只处理 flowchart 类型
  if (!code.trim().startsWith("flowchart")) return code;

  const lines = code.split('\n');
  const fixedLines = lines.map(line => {
    // 跳过空行和注释
    if (!line.trim() || line.trim().startsWith('%%')) return line;

    // 匹配节点定义的开始：NodeID[ 或 NodeID( 等
    const nodeStartPattern = /(\w+)([\[\(\{])/g;
    let result = line;
    let match;

    // 重置正则状态
    nodeStartPattern.lastIndex = 0;

    while ((match = nodeStartPattern.exec(line)) !== null) {
      const nodeId = match[1];
      const openBracket = match[2];
      const startPos = match.index + match[0].length;

      // 确定对应的闭合括号
      const closeBracket = { '[': ']', '(': ')', '{': '}' }[openBracket];

      // 从开始位置找到配对的闭合括号
      let depth = 1;
      let endPos = -1;

      for (let i = startPos; i < line.length; i++) {
        if (line[i] === openBracket) depth++;
        if (line[i] === closeBracket) {
          depth--;
          if (depth === 0) {
            endPos = i;
            break;
          }
        }
      }

      if (endPos === -1) continue; // 未找到闭合括号，跳过

      const label = line.substring(startPos, endPos);

      // 如果已经用双引号包裹，跳过
      if (label.trim().startsWith('"') && label.trim().endsWith('"')) {
        continue;
      }

      // 检查是否含有特殊符号（括号）
      // 注意：<br/> 这种 HTML 标签不算，只检查 Mermaid 语法符号
      const hasParentheses = /[\(\)]/.test(label);

      if (hasParentheses) {
        // 构建修复后的节点定义
        const originalNode = line.substring(match.index, endPos + 1);
        const fixedNode = `${nodeId}${openBracket}"${label}"${closeBracket}`;

        // 替换（只替换第一个匹配，避免重复）
        result = result.replace(originalNode, fixedNode);
      }
    }

    return result;
  });

  return fixedLines.join('\n');
}

// --- Rendering ---
let currentTheme = "default";
let panZoomInstance = null; // Store the instance

async function renderNow() {
  let code = editor.getValue().trim(); // Use CodeMirror value

  // Auto Save
  localStorage.setItem("mermaid-code", code);
  localStorage.setItem("mermaid-theme", $theme.value);

  if (!code) {
    $preview.innerHTML = "";
    return;
  }

  // Destroy old pan-zoom before re-rendering
  if (panZoomInstance) {
    panZoomInstance.destroy();
    panZoomInstance = null;
  }

  if ($theme.value !== currentTheme) {
    currentTheme = $theme.value;
    mermaid.initialize({ startOnLoad: false, theme: currentTheme, securityLevel: "strict" });
  } else {
    mermaid.initialize({ startOnLoad: false, theme: currentTheme, securityLevel: "strict" });
  }

  /**** AMENDMENT [start] "自动修复 Mermaid 节点标签语法" ****/
  // 预处理：自动给含特殊符号的节点加双引号
  code = autoFixNodeLabels(code);
  /**** AMENDMENT [end  ] "自动修复 Mermaid 节点标签语法" ****/

  try {
    await mermaid.parse(code);
    $err.textContent = "";
    $err.classList.remove("active");
    const id = "mermaid-" + Math.random().toString(36).slice(2);
    const { svg } = await mermaid.render(id, code);
    $preview.innerHTML = svg;

    // Initialize Pan Zoom
    const svgElement = $preview.querySelector("svg");
    if (svgElement) {
      // 1. Reset Mermaid styles to allow full expansion
      svgElement.removeAttribute("style");
      svgElement.setAttribute("width", "100%");
      svgElement.setAttribute("height", "100%");

      // 2. Initialize library
      panZoomInstance = svgPanZoom(svgElement, {
        zoomEnabled: true,
        controlIconsEnabled: true,
        fit: true,
        center: true,
        minZoom: 0.1,
        maxZoom: 50, // Allow deeper zoom
        contain: true, // Keep it within bounds initially? No, let it flow.
        viewportSelector: null,
        dblClickZoomEnabled: false
      });

      // 3. Force a resize update to sync
      panZoomInstance.resize();
      panZoomInstance.fit();
      panZoomInstance.center();
    }

  } catch (e) {
    // Keep previous preview if possible, just show error
    $err.textContent = `Syntax Error:\n${e.message}`;
    $err.classList.add("active");
  }
}

// --- Event Listeners ---

// 1. Live Preview with Debounce (CodeMirror Event)
let debounceTimer = null;
editor.on("change", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(renderNow, 300);
});

// 2. Tab Key is handled by CodeMirror default

// 2.1 Quick Actions (Snippets)
document.querySelectorAll(".btn-snippet").forEach(btn => {
  btn.addEventListener("click", () => {
    const ins = btn.dataset.ins;
    if (!ins) return;

    // Insert at cursor
    const doc = editor.getDoc();
    const cursor = doc.getCursor();
    // Decode escaped newlines if any
    const textToInsert = ins.replace(/\\n/g, "\n");
    doc.replaceRange(textToInsert, cursor);

    // Move focus back
    editor.focus();
  });
});

// 3. Template Change
$template.addEventListener("change", () => {
  const type = $template.value;
  if (TEMPLATES[type]) {
    const currentCode = editor.getValue();
    const isDefault = Object.values(TEMPLATES).some(t => t.trim() === currentCode.trim());
    if (currentCode.trim() === "" || isDefault || confirm("Replace current code with template?")) {
      editor.setValue(TEMPLATES[type]);
      // renderNow trigger via change event is automatic? No, setValue triggers 'change'
    }
  }
  $template.value = "";
});

// 4. Theme Change
$theme.addEventListener("change", renderNow);

// 5. Share/Copy Link
document.getElementById("btnCopy").addEventListener("click", async () => {
  const code = editor.getValue();
  const hash = encodeToHash(code, $theme.value);
  const url = location.origin + location.pathname + hash;
  try {
    await navigator.clipboard.writeText(url);
    history.replaceState(null, "", hash);
    showToast("Link copied to clipboard!");
  } catch (err) {
    showToast("Failed to copy link.");
  }
});

// 6. Reset
document.getElementById("btnReset").addEventListener("click", () => {
  if (confirm("Reset to default?")) {
    history.replaceState(null, "", location.pathname);
    editor.setValue(DEFAULT_CODE);
    $theme.value = "default";
  }
});

// 7. Download SVG
document.getElementById("btnDownloadSVG").addEventListener("click", () => {
  const svg = $preview.querySelector("svg");
  if (!svg) return showToast("Nothing to download");
  const svgData = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mermaid-diagram.svg";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

// 8. Download PNG
document.getElementById("btnDownloadPNG").addEventListener("click", () => {
  const svg = $preview.querySelector("svg");
  if (!svg) return showToast("Nothing to download");
  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  const bbox = svg.getBoundingClientRect();
  const scale = 2;
  canvas.width = bbox.width * scale;
  canvas.height = bbox.height * scale;
  img.onload = () => {
    ctx.scale(scale, scale);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const a = document.createElement("a");
    a.download = "mermaid-diagram.png";
    a.href = canvas.toDataURL("image/png");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
});

// 9. Reverse Sync (Click Preview to Edit)
$preview.addEventListener("click", (e) => {
  const target = e.target;
  if (!target || target === $preview) return;

  let textToFind = "";
  if (target.tagName === "tspan" || target.tagName === "text" || target.tagName === "p" || target.tagName === "div") {
    textToFind = target.textContent.trim();
  } else {
    const nodeGroup = target.closest(".node, .actor, .label, .cluster, .task");
    if (nodeGroup) textToFind = nodeGroup.textContent.trim();
  }

  if (!textToFind) return;

  // CodeMirror search
  const cursor = editor.getSearchCursor(textToFind);
  if (cursor.findNext()) {
    editor.setSelection(cursor.from(), cursor.to());
    editor.focus();
    // Scroll into view
    editor.scrollIntoView(cursor.from(), 200);
    showToast(`Located: "${textToFind.substring(0, 15)}..."`);
  }
});

// 10. Inline Edit (Double Click)
let editingTargetText = "";
let editingRange = null;

$preview.addEventListener("dblclick", (e) => {
  const target = e.target;
  if (!target || target === $preview) return;
  e.preventDefault();

  // If clicking on pan-zoom controls, ignore
  if (target.closest("#svg-pan-zoom-controls")) return;

  let oldText = "";
  if (target.tagName === "tspan" || target.tagName === "text" || target.tagName === "p" || target.tagName === "div") {
    oldText = target.textContent.trim();
  } else {
    const nodeGroup = target.closest(".node, .actor, .label, .cluster, .task");
    if (nodeGroup) oldText = nodeGroup.textContent.trim();
  }

  if (!oldText) return;

  // Find in editor first to verify it exists
  const cursor = editor.getSearchCursor(oldText);
  if (!cursor.findNext()) {
    return showToast("Could not locate text in code.");
  }

  editingRange = { from: cursor.from(), to: cursor.to() };
  editingTargetText = oldText;

  // Position the inline editor over the clicked element
  // Need to account for pan/zoom transform if active
  const rect = target.getBoundingClientRect();

  $inlineEditor.style.display = "block";
  $inlineEditor.style.left = `${rect.left + window.scrollX}px`;
  $inlineEditor.style.top = `${rect.top + window.scrollY}px`;
  $inlineEditor.value = oldText;
  $inlineEditor.focus();
  $inlineEditor.select();
});

// Handle Inline Editor Commit
function commitInlineEdit() {
  const newText = $inlineEditor.value;
  $inlineEditor.style.display = "none";

  if (newText && newText !== editingTargetText && editingRange) {
    editor.replaceRange(newText, editingRange.from, editingRange.to);
    showToast("Updated!");
    // Range is now invalid, clear it
    editingRange = null;
  }
}

$inlineEditor.addEventListener("blur", () => {
  // Delay slightly to allow Enter key to work if pressed
  setTimeout(commitInlineEdit, 100);
});

$inlineEditor.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $inlineEditor.blur(); // Triggers commit
  }
  if (e.key === "Escape") {
    $inlineEditor.style.display = "none";
    editingRange = null;
  }
});


// --- Init ---
// Priority: Hash -> LocalStorage -> Default
const decoded = decodeFromHash(location.hash);
const savedCode = localStorage.getItem("mermaid-code");
const savedTheme = localStorage.getItem("mermaid-theme");

if (decoded) {
  editor.setValue(decoded.code || DEFAULT_CODE);
  $theme.value = decoded.theme || "default";
} else if (savedCode) {
  editor.setValue(savedCode);
  if (savedTheme) $theme.value = savedTheme;
} else {
  editor.setValue(DEFAULT_CODE);
}

// Initial Render handled by setValue triggering change? 
// CodeMirror setValue triggers change? Usually no, unless origin passed?
// Let's force render
renderNow();

// --- Resizer Logic ---
const $gutter = document.getElementById("gutter");
const $editorPanel = document.querySelector(".editor-panel");
let isDragging = false;

$gutter.addEventListener("mousedown", (e) => {
  isDragging = true;
  $gutter.classList.add("dragging");
  document.body.style.cursor = "col-resize";
  e.preventDefault();
});

document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const minWidth = 250;
  const maxWidth = window.innerWidth - 300;
  let newWidth = e.clientX;
  if (newWidth < minWidth) newWidth = minWidth;
  if (newWidth > maxWidth) newWidth = maxWidth;
  $editorPanel.style.width = `${newWidth}px`;
});

document.addEventListener("mouseup", () => {
  if (isDragging) {
    isDragging = false;
    $gutter.classList.remove("dragging");
    document.body.style.cursor = "";
  }
});

// --- Presentation Mode ---
const $btnPresent = document.getElementById("btnPresent");
const $btnExitPresent = document.getElementById("btnExitPresent");

function togglePresentationMode(active) {
  if (active) {
    document.body.classList.add("presentation-mode");
    document.documentElement.requestFullscreen().catch(err => {
      console.log("Error attempting to enable full-screen mode:", err.message);
    });
  } else {
    document.body.classList.remove("presentation-mode");
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => console.log(err));
    }
  }
  // Allow layout to settle then resize panZoom
  setTimeout(() => {
    if (panZoomInstance) {
      panZoomInstance.resize();
      panZoomInstance.fit();
      panZoomInstance.center();
    }
  }, 100);
}

// Logic to show/hide exit button is handled by CSS, we just handle the click
$btnPresent.addEventListener("click", () => togglePresentationMode(true));
$btnExitPresent.addEventListener("click", () => togglePresentationMode(false));

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) {
    // User pressed Esc or exited some other way
    document.body.classList.remove("presentation-mode");
    setTimeout(() => {
      if (panZoomInstance) {
        panZoomInstance.resize();
      }
    }, 100);
  }
});
