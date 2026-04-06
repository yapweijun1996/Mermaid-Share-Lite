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
 * 自动给含有特殊符号的 flowchart 节点标签和边标签加双引号
 * 节点: A[text (note)] -> A["text (note)"]
 * 边: A -->|label (note)| B -> A -->|"label (note)"| B
 * 
 * 策略：逐行扫描，找到节点定义和边标签，用括号配对算法提取标签
 */
function autoFixNodeLabels(code) {
  // 只处理 flowchart 类型
  if (!code.trim().startsWith("flowchart")) return code;

  const lines = code.split('\n');
  const fixedLines = lines.map(line => {
    // 跳过空行和注释
    if (!line.trim() || line.trim().startsWith('%%')) return line;

    let result = line;

    // === 1. 处理节点标签 NodeID[label] ===
    const nodeStartPattern = /(\w+)([\[\(\{])/g;
    let match;
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
      const hasParentheses = /[\(\)]/.test(label);

      if (hasParentheses) {
        // 构建修复后的节点定义
        const originalNode = line.substring(match.index, endPos + 1);
        const fixedNode = `${nodeId}${openBracket}"${label}"${closeBracket}`;

        // 替换（只替换第一个匹配，避免重复）
        result = result.replace(originalNode, fixedNode);
      }
    }

    // === 2. 处理边标签 -->|label| 或 -.->|label| 等 ===
    // 边语法：-->, -.>, ==>, --xxx--> 等，后跟 |label|
    const edgeLabelPattern = /([-=\.]+>?\|)([^|]+)(\|)/g;
    edgeLabelPattern.lastIndex = 0;

    while ((match = edgeLabelPattern.exec(result)) !== null) {
      const prefix = match[1];  // 例如 -->|
      const label = match[2];
      const suffix = match[3];  // |

      // 如果已经用双引号包裹，跳过
      if (label.trim().startsWith('"') && label.trim().endsWith('"')) {
        continue;
      }

      // 检查是否含有特殊符号（括号）
      const hasParentheses = /[\(\)]/.test(label);

      if (hasParentheses) {
        const originalEdgeLabel = match[0];
        const fixedEdgeLabel = `${prefix}"${label}"${suffix}`;
        result = result.replace(originalEdgeLabel, fixedEdgeLabel);
      }
    }

    return result;
  });

  return fixedLines.join('\n');
}

/**** AMENDMENT [start] "动态箭头 Hover 效果函数" ****/
/**
 * 为所有箭头/边添加动态 hover 效果（仅在演示模式下生效）
 * @param {SVGElement} svgElement - 渲染后的 SVG 根元素
 */
function addArrowHoverEffects(svgElement) {
  // 选择所有可能的箭头/边路径
  const edgeSelectors = [
    '.edgePath path',
    '.flowchart-link',
    'path.transition', // State diagrams
    'line.messageLine', // Sequence diagrams
    '.relation' // ER diagrams
  ];

  edgeSelectors.forEach(selector => {
    const edges = svgElement.querySelectorAll(selector);
    edges.forEach(edge => {
      // 保存原始样式
      const originalStroke = edge.getAttribute('stroke') || edge.style.stroke;
      const originalStrokeWidth = edge.getAttribute('stroke-width') || edge.style.strokeWidth;
      const originalOpacity = edge.getAttribute('opacity') || edge.style.opacity || '1';

      edge.addEventListener('mouseenter', () => {
        // 只在演示模式下生效
        if (document.body.classList.contains('presentation-mode')) {
          edge.setAttribute('stroke', '#ef4444'); // var(--danger) 的实际值
          edge.setAttribute('stroke-width', '5');
          edge.setAttribute('opacity', '1');
          edge.style.filter = 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.8))';
        }
      });

      edge.addEventListener('mouseleave', () => {
        // 恢复原始样式
        if (originalStroke) edge.setAttribute('stroke', originalStroke);
        if (originalStrokeWidth) edge.setAttribute('stroke-width', originalStrokeWidth);
        if (originalOpacity) edge.setAttribute('opacity', originalOpacity);
        edge.style.filter = '';
      });
    });
  });
}
/**** AMENDMENT [end  ] "动态箭头 Hover 效果函数" ****/

// --- Rendering ---
let currentTheme = "default";
let panZoomInstance = null; // Store the instance

function initPanZoom(svgElement) {
  if (panZoomInstance) {
    try { panZoomInstance.destroy(); } catch (_) {}
    panZoomInstance = null;
  }
  panZoomInstance = svgPanZoom(svgElement, {
    zoomEnabled: true,
    controlIconsEnabled: true,
    fit: true,
    center: true,
    minZoom: 0.1,
    maxZoom: 50,
    viewportSelector: null,
    dblClickZoomEnabled: false
  });
  panZoomInstance.resize();
  panZoomInstance.fit();
  panZoomInstance.center();
}

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
    try { panZoomInstance.destroy(); } catch (_) {}
    panZoomInstance = null;
  }

  currentTheme = $theme.value;
  mermaid.initialize({ startOnLoad: false, theme: currentTheme, securityLevel: "strict" });

  /**** AMENDMENT [start] "自动修复 Mermaid 节点标签语法" ****/
  // 预处理：自动给含特殊符号的节点加双引号
  code = autoFixNodeLabels(code);
  /**** AMENDMENT [end  ] "自动修复 Mermaid 节点标签语法" ****/

  /**** AMENDMENT [start] "添加箭头 hover 效果的 JS 控制" ****/
  try {
    await mermaid.parse(code);
    $err.textContent = "";
    $err.classList.remove("active");
    const id = "mermaid-" + Math.random().toString(36).slice(2);
    const { svg } = await mermaid.render(id, code);
    $preview.innerHTML = svg;

    // Initialize Pan Zoom (skip if preview is hidden on mobile)
    const svgElement = $preview.querySelector("svg");
    if (svgElement) {
      // 1. Reset Mermaid styles to allow full expansion
      svgElement.removeAttribute("style");
      svgElement.setAttribute("width", "100%");
      svgElement.setAttribute("height", "100%");

      // 2. Only init pan-zoom if the preview panel is visible
      const previewVisible = $preview.offsetWidth > 0 && $preview.offsetHeight > 0;
      if (previewVisible) {
        initPanZoom(svgElement);
      }

      // 3. Add dynamic hover effects for arrows in Presentation Mode
      addArrowHoverEffects(svgElement);
    }
    /**** AMENDMENT [end  ] "添加箭头 hover 效果的 JS 控制" ****/

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

// --- Mobile Tab Switching ---
const isMobile = () => window.innerWidth <= 768;

function setMobileTab(tab) {
  document.body.classList.remove("mobile-tab-code", "mobile-tab-preview");
  document.body.classList.add(`mobile-tab-${tab}`);

  document.querySelectorAll(".mobile-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  // Refresh CodeMirror when switching to code tab (fixes rendering)
  if (tab === "code") {
    setTimeout(() => editor.refresh(), 50);
  }

  // Init or refresh pan-zoom when switching to preview
  if (tab === "preview") {
    setTimeout(() => {
      const svgElement = $preview.querySelector("svg");
      if (svgElement) {
        initPanZoom(svgElement);
      }
    }, 50);
  }
}

// Initialize mobile state
if (isMobile()) {
  setMobileTab("code");
}

// Listen for tab clicks
document.querySelectorAll(".mobile-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    setMobileTab(btn.dataset.tab);
  });
});

// Handle resize (switching between mobile/desktop)
window.addEventListener("resize", () => {
  if (!isMobile()) {
    document.body.classList.remove("mobile-tab-code", "mobile-tab-preview");
  } else if (!document.body.classList.contains("mobile-tab-code") &&
             !document.body.classList.contains("mobile-tab-preview")) {
    setMobileTab("code");
  }
});

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
  // Allow layout to settle then reinit panZoom
  setTimeout(() => {
    const svgElement = $preview.querySelector("svg");
    if (svgElement) {
      initPanZoom(svgElement);
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
      const svgElement = $preview.querySelector("svg");
      if (svgElement) initPanZoom(svgElement);
    }, 100);
  }
});

// --- Laser Pointer Logic ---
const $laser = document.getElementById("laser-pointer");

document.addEventListener("mousemove", (e) => {
  // Only update if in presentation mode (optimization)
  if (document.body.classList.contains("presentation-mode")) {
    $laser.style.top = `${e.clientY}px`;
    $laser.style.left = `${e.clientX}px`;
  }
});

// ============================================================
// Context Menu — Visual Node Editing (Flowchart)
// ============================================================

const $ctxMenu = document.getElementById("ctx-menu");
const $ctxItems = $ctxMenu.querySelector(".ctx-menu-items");
const $nodeDialog = document.getElementById("node-dialog");
const $nodeDialogLabel = document.getElementById("node-dialog-label");
const $nodeDialogOk = document.getElementById("node-dialog-ok");
const $nodeDialogCancel = document.getElementById("node-dialog-cancel");

// --- Helpers ---

function isFlowchart() {
  return editor.getValue().trim().startsWith("flowchart");
}

/** Walk up the DOM tree, crossing foreignObject boundaries, to find an ancestor matching selector */
function closestSvgAncestor(el, selector) {
  let current = el;
  while (current && current !== document.body && current !== document) {
    // Check if current element matches the selector
    try {
      if (current.matches && current.matches(selector)) return current;
    } catch (_) {}
    // Move up — if parent is foreignObject, jump to its SVG parent
    const parent = current.parentElement || current.parentNode;
    if (!parent) return null;
    current = parent;
  }
  return null;
}

function getNodeIdFromElement(el) {
  const nodeGroup = closestSvgAncestor(el, ".node");
  if (!nodeGroup) return null;
  const id = nodeGroup.id || "";
  // Mermaid v11 format: "mermaid-{renderId}-flowchart-{nodeId}-{index}"
  // or without trailing index: "mermaid-{renderId}-flowchart-{nodeId}"
  const m = id.match(/flowchart-([A-Za-z_]\w*)(?:-\d+)?$/);
  if (m) return m[1];
  return null;
}

function getNodeLabelFromElement(el) {
  const nodeGroup = closestSvgAncestor(el, ".node");
  if (!nodeGroup) return "";
  return nodeGroup.textContent.trim();
}

function isEdgeElement(el) {
  return !!closestSvgAncestor(el, ".edgePath") || !!closestSvgAncestor(el, ".flowchart-link");
}

function getNextNodeId() {
  const code = editor.getValue();
  const ids = new Set();
  const reserved = new Set(["flowchart", "subgraph", "end", "style", "class", "click", "linkStyle", "classDef", "direction"]);
  let m;
  const p1 = /\b([A-Za-z_]\w*)\s*[\[\(\{]/g;
  while ((m = p1.exec(code)) !== null) {
    if (!reserved.has(m[1])) ids.add(m[1]);
  }
  const p2 = /-->\s*([A-Za-z_]\w*)/g;
  while ((m = p2.exec(code)) !== null) {
    if (!reserved.has(m[1])) ids.add(m[1]);
  }
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c);
    if (!ids.has(letter)) return letter;
  }
  let i = 1;
  while (ids.has(`N${i}`)) i++;
  return `N${i}`;
}

function shapeWrap(label, shape) {
  const map = {
    rect: ["[", "]"],
    round: ["(", ")"],
    diamond: ["{", "}"],
    circle: ["((", "))"],
    stadium: ["([", "])"]
  };
  const [open, close] = map[shape] || map.rect;
  return `${open}${label}${close}`;
}

function detectNodeShape(nodeId) {
  const code = editor.getValue();
  const patterns = [
    { shape: "circle", re: new RegExp(`\\b${nodeId}\\s*\\(\\(`) },
    { shape: "stadium", re: new RegExp(`\\b${nodeId}\\s*\\(\\[`) },
    { shape: "round", re: new RegExp(`\\b${nodeId}\\s*\\((?!\\()(?!\\[)`) },
    { shape: "diamond", re: new RegExp(`\\b${nodeId}\\s*\\{`) },
    { shape: "rect", re: new RegExp(`\\b${nodeId}\\s*\\[(?!\\[)`) },
  ];
  for (const { shape, re } of patterns) {
    if (re.test(code)) return shape;
  }
  return "rect";
}

// --- Context Menu Show/Hide ---

function showCtxMenu(x, y, items) {
  $ctxItems.innerHTML = "";
  items.forEach(item => {
    if (item === "sep") {
      const sep = document.createElement("div");
      sep.className = "ctx-sep";
      $ctxItems.appendChild(sep);
      return;
    }
    if (item.label) {
      const lbl = document.createElement("div");
      lbl.className = "ctx-label";
      lbl.textContent = item.label;
      $ctxItems.appendChild(lbl);
      return;
    }
    const btn = document.createElement("button");
    btn.className = "ctx-item" + (item.danger ? " danger" : "");
    btn.innerHTML = `${item.icon || ""}${item.text}`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      hideCtxMenu();
      item.action();
    });
    $ctxItems.appendChild(btn);
  });

  $ctxMenu.style.display = "block";
  $ctxMenu.style.left = `${x}px`;
  $ctxMenu.style.top = `${y}px`;

  requestAnimationFrame(() => {
    const rect = $ctxMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) $ctxMenu.style.left = `${x - rect.width}px`;
    if (rect.bottom > window.innerHeight) $ctxMenu.style.top = `${y - rect.height}px`;
  });
}

function hideCtxMenu() {
  $ctxMenu.style.display = "none";
}

document.addEventListener("click", hideCtxMenu);

// --- Node Dialog ---

let dialogResolve = null;
let dialogSelectedShape = "rect";

function showNodeDialog(x, y, title, defaultLabel, defaultShape, okLabel) {
  $nodeDialog.querySelector(".node-dialog-title").textContent = title;
  $nodeDialogLabel.value = defaultLabel || "";
  $nodeDialogOk.textContent = okLabel || "Add";
  dialogSelectedShape = defaultShape || "rect";

  $nodeDialog.querySelectorAll(".shape-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.shape === dialogSelectedShape);
  });

  $nodeDialog.style.display = "block";
  $nodeDialog.style.left = `${x}px`;
  $nodeDialog.style.top = `${y}px`;

  requestAnimationFrame(() => {
    const rect = $nodeDialog.getBoundingClientRect();
    if (rect.right > window.innerWidth) $nodeDialog.style.left = `${Math.max(8, x - rect.width)}px`;
    if (rect.bottom > window.innerHeight) $nodeDialog.style.top = `${Math.max(8, y - rect.height)}px`;
    $nodeDialogLabel.focus();
    $nodeDialogLabel.select();
  });

  return new Promise((resolve) => { dialogResolve = resolve; });
}

function hideNodeDialog(result) {
  $nodeDialog.style.display = "none";
  if (dialogResolve) {
    dialogResolve(result);
    dialogResolve = null;
  }
}

$nodeDialog.querySelectorAll(".shape-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    dialogSelectedShape = btn.dataset.shape;
    $nodeDialog.querySelectorAll(".shape-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

$nodeDialogCancel.addEventListener("click", () => hideNodeDialog(null));
$nodeDialogOk.addEventListener("click", () => {
  const label = $nodeDialogLabel.value.trim();
  const labelHidden = $nodeDialogLabel.style.display === "none";
  if (label || labelHidden) hideNodeDialog({ label: label || "", shape: dialogSelectedShape });
});
$nodeDialogLabel.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const label = $nodeDialogLabel.value.trim();
    if (label) hideNodeDialog({ label, shape: dialogSelectedShape });
  }
  if (e.key === "Escape") hideNodeDialog(null);
});

document.addEventListener("mousedown", (e) => {
  if ($nodeDialog.style.display === "block" && !$nodeDialog.contains(e.target)) {
    hideNodeDialog(null);
  }
});

// --- SVG Icons for menu ---
const ICONS = {
  addChild: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`,
  branch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
  shape: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`,
  delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  addNode: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/></svg>`,
  connect: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
};

// --- Context Menu Actions ---

async function actionAddChild(parentId, x, y) {
  const result = await showNodeDialog(x, y, "Add Child Node", "New Node", "rect", "Add");
  if (!result) return;
  const newId = getNextNodeId();
  const code = editor.getValue();
  editor.setValue(code + "\n  " + parentId + " --> " + newId + shapeWrap(result.label, result.shape));
  showToast("Added: " + result.label);
}

async function actionAddBranch(parentId) {
  const idYes = getNextNodeId();
  const code1 = editor.getValue();
  editor.setValue(code1 + "\n  " + parentId + " -- Yes --> " + idYes + "[Yes Path]");
  const idNo = getNextNodeId();
  const code2 = editor.getValue();
  editor.setValue(code2 + "\n  " + parentId + " -- No --> " + idNo + "[No Path]");
  showToast("Added Yes/No branch");
}

async function actionAddNewNode(x, y) {
  const result = await showNodeDialog(x, y, "Add New Node", "New Node", "rect", "Add");
  if (!result) return;
  const newId = getNextNodeId();
  const code = editor.getValue();
  editor.setValue(code + "\n  " + newId + shapeWrap(result.label, result.shape));
  showToast("Added: " + result.label);
}

async function actionChangeShape(nodeId, x, y) {
  const currentShape = detectNodeShape(nodeId);
  // Show dialog with label hidden (shape-only mode)
  $nodeDialogLabel.style.display = "none";
  const result = await showNodeDialog(x, y, "Change Shape", "placeholder", currentShape, "Apply");
  $nodeDialogLabel.style.display = "";
  if (!result || result.shape === currentShape) return;

  const code = editor.getValue();
  const lines = code.split("\n");
  const shapePatterns = [
    { re: new RegExp(`(\\b${nodeId}\\s*)\\(\\(([^)]*(?:\\)[^)]*)*?)\\)\\)`) },
    { re: new RegExp(`(\\b${nodeId}\\s*)\\(\\[([^\\]]*?)\\]\\)`) },
    { re: new RegExp(`(\\b${nodeId}\\s*)\\(([^)]*?)\\)(?!\\))`) },
    { re: new RegExp(`(\\b${nodeId}\\s*)\\{([^}]*?)\\}`) },
    { re: new RegExp(`(\\b${nodeId}\\s*)\\[(?!\\[)([^\\]]*?)\\]`) },
  ];

  let changed = false;
  const newLines = lines.map(line => {
    if (changed) return line;
    for (const { re } of shapePatterns) {
      const m = line.match(re);
      if (m) {
        const label = m[2];
        changed = true;
        return line.replace(re, nodeId + shapeWrap(label, result.shape));
      }
    }
    return line;
  });

  if (changed) {
    editor.setValue(newLines.join("\n"));
    showToast("Shape changed");
  }
}

function actionDeleteNode(nodeId) {
  if (!confirm('Delete node "' + nodeId + '" and all its connections?')) return;
  const code = editor.getValue();
  const lines = code.split("\n");
  const regex = new RegExp("\\b" + nodeId + "\\b");
  const filtered = lines.filter(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith("flowchart")) return true;
    if (trimmed.startsWith("subgraph") || trimmed === "end") return true;
    return !regex.test(trimmed);
  });
  editor.setValue(filtered.join("\n"));
  showToast("Deleted node: " + nodeId);
}

function actionDeleteEdge(el) {
  const edgePath = closestSvgAncestor(el, ".edgePath");
  if (!edgePath) return;
  const edgeId = edgePath.id || "";
  // Mermaid v11 edge ID: "L_{renderId}-flowchart-A-{renderId}-flowchart-B-0"
  // Extract the two node IDs between "flowchart-" segments
  const parts = edgeId.match(/flowchart-([A-Za-z_]\w*)/g);
  if (!parts || parts.length < 2) {
    showToast("Could not identify this connection");
    return;
  }
  const fromId = parts[0].replace("flowchart-", "");
  const toId = parts[1].replace("flowchart-", "");
  if (!confirm('Delete connection from "' + fromId + '" to "' + toId + '"?')) return;

  const code = editor.getValue();
  const lines = code.split("\n");
  const fromRe = new RegExp("\\b" + fromId + "\\b");
  const toRe = new RegExp("\\b" + toId + "\\b");
  const filtered = lines.filter(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith("flowchart")) return true;
    const hasBoth = fromRe.test(trimmed) && toRe.test(trimmed);
    const hasArrow = /-->|-.->|==>|--/.test(trimmed);
    return !(hasBoth && hasArrow);
  });
  editor.setValue(filtered.join("\n"));
  showToast("Deleted: " + fromId + " → " + toId);
}

/** Parse all node IDs and their labels from the code */
function getNodeMap() {
  const code = editor.getValue();
  const map = {};
  const reserved = new Set(["flowchart", "subgraph", "end", "style", "class", "click", "linkStyle", "classDef", "direction"]);
  // Match: NodeId[label], NodeId(label), NodeId{label}, NodeId((label)), NodeId([label])
  const patterns = [
    /\b([A-Za-z_]\w*)\s*\(\(([^)]*(?:\)[^)]*)*?)\)\)/g,  // (( ))
    /\b([A-Za-z_]\w*)\s*\(\[([^\]]*?)\]\)/g,              // ([ ])
    /\b([A-Za-z_]\w*)\s*\[([^\]]*?)\]/g,                  // [ ]
    /\b([A-Za-z_]\w*)\s*\(([^)]*?)\)(?!\))/g,             // ( )
    /\b([A-Za-z_]\w*)\s*\{([^}]*?)\}/g,                   // { }
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(code)) !== null) {
      const id = m[1];
      const label = m[2].replace(/"/g, "");
      if (!reserved.has(id) && !map[id]) {
        map[id] = label || id;
      }
    }
  }
  return map;
}

function actionConnectTo(fromId, x, y) {
  const nodeMap = getNodeMap();
  delete nodeMap[fromId];
  const ids = Object.keys(nodeMap);
  if (ids.length === 0) { showToast("No other nodes to connect to"); return; }

  const items = [{ label: "Connect to..." }];
  ids.forEach(id => {
    items.push({
      text: id + " — " + nodeMap[id],
      icon: ICONS.connect,
      action: () => {
        const c = editor.getValue();
        editor.setValue(c + "\n  " + fromId + " --> " + id);
        showToast("Connected: " + fromId + " → " + nodeMap[id]);
      }
    });
  });
  showCtxMenu(x, y, items);
}

// --- Right-Click Handler ---

$preview.addEventListener("contextmenu", (e) => {
  // Skip in presentation mode
  if (document.body.classList.contains("presentation-mode")) return;

  // Skip pan-zoom control buttons
  const onControls = closestSvgAncestor(e.target, "#svg-pan-zoom-controls") ||
    (e.target.id && e.target.id.startsWith("svg-pan-zoom"));
  if (onControls) return;

  // Must be inside the SVG area
  const svgEl = $preview.querySelector("svg");
  if (!svgEl) return;

  e.preventDefault();
  e.stopPropagation();
  hideNodeDialog(null);

  const mx = e.clientX;
  const my = e.clientY;
  const flowchart = isFlowchart();

  if (flowchart) {
    const nodeId = getNodeIdFromElement(e.target);
    const onEdge = isEdgeElement(e.target);

    if (nodeId) {
      const nodeMap = getNodeMap();
      const nodeLabel = nodeMap[nodeId] || nodeId;
      showCtxMenu(mx, my, [
        { label: nodeLabel },
        { text: "Add Child Node", icon: ICONS.addChild, action: () => actionAddChild(nodeId, mx, my) },
        { text: "Add Yes / No Branch", icon: ICONS.branch, action: () => actionAddBranch(nodeId) },
        { text: "Connect To...", icon: ICONS.connect, action: () => actionConnectTo(nodeId, mx, my) },
        "sep",
        { text: "Change Shape", icon: ICONS.shape, action: () => actionChangeShape(nodeId, mx, my) },
        "sep",
        { text: "Delete Node", icon: ICONS.delete, danger: true, action: () => actionDeleteNode(nodeId) }
      ]);
    } else if (onEdge) {
      showCtxMenu(mx, my, [
        { text: "Delete Connection", icon: ICONS.delete, danger: true, action: () => actionDeleteEdge(e.target) }
      ]);
    } else {
      showCtxMenu(mx, my, [
        { text: "Add New Node", icon: ICONS.addNode, action: () => actionAddNewNode(mx, my) }
      ]);
    }
  } else {
    // Non-flowchart: show basic empty-space menu
    showCtxMenu(mx, my, [
      { label: "Visual editing: Flowchart only" },
      {
        text: "Switch to Flowchart",
        icon: ICONS.addNode,
        action: () => {
          if (confirm("Replace current code with Flowchart template?")) {
            editor.setValue(TEMPLATES.flowchart);
          }
        }
      }
    ]);
  }
});
