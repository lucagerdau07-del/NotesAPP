// Rich text for text objects. Editing is a plain contentEditable driven by
// document.execCommand: bold, lists, headings, alignment and undo are all
// native, so there is no editor model to keep in sync with the DOM. What it
// produces is stored as HTML in object.html, next to the plain-text mirror in
// object.text that search, the agent, previews and the knowledge index keep
// reading.
//
// Stored HTML comes back from sync, the clipboard and older app versions, so
// it is untrusted: everything that turns it into DOM goes through
// sanitizeRichHtml first.

const KEEP = new Set([
  "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "SUB", "SUP", "SPAN", "FONT",
  "P", "DIV", "BR", "H1", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE", "A", "CODE", "PRE",
]);
// Removed with their content. Any other unknown tag is unwrapped instead, so
// its text survives (a pasted <table> keeps its cell text).
const DROP = new Set([
  "SCRIPT", "STYLE", "TEMPLATE", "IFRAME", "FRAME", "OBJECT", "EMBED", "SVG", "MATH",
  "NOSCRIPT", "HEAD", "TITLE", "META", "LINK", "BASE", "IMG", "PICTURE", "VIDEO", "AUDIO",
  "CANVAS", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "FORM",
]);
const STYLES = ["color", "background-color", "text-align", "font-weight", "font-style", "text-decoration-line"];
const COLOR_STYLES = new Set(["color", "background-color"]);
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i;
const SAFE_HREF = /^(https?:|mailto:)/i;

function clean(parent, colors) {
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) continue;
    const tag = node.nodeType === Node.ELEMENT_NODE ? node.tagName.toUpperCase() : "";
    if (!tag || DROP.has(tag)) {
      node.remove();
      continue;
    }
    clean(node, colors);
    if (!KEEP.has(tag)) {
      node.replaceWith(...node.childNodes);
      continue;
    }
    // The browser's own CSS parser vets the values; only these properties
    // survive, none of which can carry a url().
    const style = STYLES.filter((name) => colors || !COLOR_STYLES.has(name))
      .map((name) => [name, node.style.getPropertyValue(name)])
      .filter(([, value]) => value)
      .map(([name, value]) => `${name}: ${value}`)
      .join("; ");
    const color = node.getAttribute("color");
    const href = node.getAttribute("href")?.trim();
    const checked = node.getAttribute("data-checked") === "true";
    const checklist = node.hasAttribute("data-check");
    const caret = node.hasAttribute("data-caret");
    for (const { name } of [...node.attributes]) node.removeAttribute(name);
    if (style) node.setAttribute("style", style);
    if (tag === "FONT" && colors && color && SAFE_COLOR.test(color)) node.setAttribute("color", color);
    if (tag === "A" && href && SAFE_HREF.test(href)) node.setAttribute("href", href);
    if (tag === "LI" && checked) node.setAttribute("data-checked", "true");
    if (tag === "UL" && checklist) node.setAttribute("data-check", "");
    if (tag === "SPAN" && caret) node.setAttribute("data-caret", "");
    // Chromium leaves attribute-less style spans behind when blocks merge.
    if ((tag === "SPAN" || tag === "FONT") && node.attributes.length === 0) node.replaceWith(...node.childNodes);
  }
}

// colors: false also strips text and highlight colors — for pasted web
// content, whose black-on-white would vanish on dark paper.
export function sanitizeRichHtml(html, { colors = true } = {}) {
  if (!html || typeof DOMParser === "undefined") return "";
  // DOMParser builds an inert document: nothing in it loads or runs, unlike
  // innerHTML on a live element, where an <img onerror> fires even detached.
  const { body } = new DOMParser().parseFromString(String(html), "text/html");
  clean(body, colors);
  return body.innerHTML;
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export const escapeHtml = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ESCAPES[c]);

// The agent writes markdown into plain text (rendered by Markdown.jsx's
// renderInline, same precedence as this pattern). Opening such a box as rich
// text turns the markers into real formatting; $math$ stays as typed, since
// KaTeX's output isn't something to edit.
const MARKDOWN =
  /(\$[^$\n]+\$)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|~~([^~]+)~~|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

export function markdownToHtml(text) {
  return escapeHtml(text).replace(MARKDOWN, (match, math, b1, b2, i1, i2, code, strike, label, href) => {
    if (math) return math;
    if (b1 || b2) return `<b>${b1 || b2}</b>`;
    if (i1 || i2) return `<i>${i1 || i2}</i>`;
    if (code) return `<code>${code}</code>`;
    if (strike) return `<s>${strike}</s>`;
    return `<a href="${href}">${label}</a>`;
  });
}

// What a text object shows as HTML, rich or not. The editor is white-space:
// pre-wrap, so plain text only needs escaping to keep its line breaks.
export function richHtmlOf(object) {
  if (object?.html) return sanitizeRichHtml(object.html);
  return object?.aiGenerated ? markdownToHtml(object?.text) : escapeHtml(object?.text);
}

// innerText turns blocks into line breaks only with layout, so the element is
// attached offscreen for the read (jsdom has no innerText: textContent). The
// HTML is sanitized first: this is a live-document element.
export function plainTextOf(html) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;white-space:pre-wrap;";
  host.innerHTML = sanitizeRichHtml(html);
  document.body.appendChild(host);
  const text = host.innerText ?? host.textContent;
  host.remove();
  return text;
}

const elementOf = (node) => (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement);

function selectionList(root) {
  const list = elementOf(globalThis.getSelection?.()?.anchorNode)?.closest?.("ul, ol");
  return list && root.contains(list) ? list : null;
}

// Moves the selected items of the list around the caret into a list of
// their own, ticked boxes or bullets. Chromium merges a new list into the
// list right next to it, so without this a checklist started under a bullet
// list turned that whole list into checkboxes. Moving nodes drops the
// selection; its nodes move along unchanged, so it is put back on them.
function splitList(root, checklist) {
  const selection = globalThis.getSelection?.();
  const list = selectionList(root);
  if (!list || !selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const all = [...list.children];
  const items = all.filter((item) => range.intersectsNode(item));
  if (!items.length) return;
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
  const own = list.cloneNode(false);
  if (checklist) own.setAttribute("data-check", "");
  else own.removeAttribute("data-check");
  const rest = list.cloneNode(false);
  rest.append(...all.slice(all.indexOf(items[items.length - 1]) + 1));
  own.append(...items);
  list.after(own, ...(rest.children.length ? [rest] : []));
  if (!list.children.length) list.remove();
  selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
}

const PARAGRAPH_STYLES = new Set(["p", "h1", "h2", "h3"]);

// One entry point for the toolbar, the keyboard shortcuts and autoformat. It
// is all execCommand, so every step lands on the browser's own undo stack.
export function runRichCommand(command, root, value) {
  if (PARAGRAPH_STYLES.has(command)) {
    // Picking the heading a paragraph already is turns it back into text.
    const current = document.queryCommandValue?.("formatBlock");
    return document.execCommand("formatBlock", false, command === "p" || current === command ? "div" : command);
  }
  const list = selectionList(root);
  if (command === "checklist") {
    if (list?.hasAttribute("data-check")) return document.execCommand("insertUnorderedList");
    if (list?.tagName !== "UL") document.execCommand("insertUnorderedList");
    splitList(root, true);
    return true;
  }
  // Bullets on a checklist trade the boxes for bullets instead of dropping
  // the list, which is what execCommand alone would do.
  if (command === "insertUnorderedList" && list?.hasAttribute("data-check")) {
    splitList(root, false);
    return true;
  }
  return document.execCommand(command, false, value);
}

// Asks for a URL and links the selection. A native prompt is the one input
// that does not take focus (and the selection) away from the editor.
export function promptLink(root) {
  const selection = globalThis.getSelection?.();
  const saved = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  const answer = globalThis.prompt?.("Link-Adresse", "https://")?.trim();
  if (!saved || !answer || answer === "https://") return false;
  const href = /^[a-z][a-z\d+.-]*:/i.test(answer) ? answer : `https://${answer}`;
  if (!SAFE_HREF.test(href)) return false;
  root.focus();
  selection.removeAllRanges();
  selection.addRange(saved);
  if (saved.collapsed) {
    document.execCommand("insertHTML", false, `<a href="${escapeHtml(href)}">${escapeHtml(answer)}</a>`);
    return true;
  }
  return document.execCommand("createLink", false, href);
}

// Typed at the very start of a paragraph and followed by a space, these
// turn it into a list or heading, like Google Docs' autoformat.
const AUTOFORMAT = [
  [/^[-*•]$/, "insertUnorderedList"],
  [/^1[.)]$/, "insertOrderedList"],
  [/^\[ ?\]$/, "checklist"],
  [/^#$/, "h1"],
  [/^##$/, "h2"],
  [/^###$/, "h3"],
];
const BLOCKS = new Set(["P", "DIV", "H1", "H2", "H3", "LI", "BLOCKQUOTE", "PRE"]);

function blockOf(node, root) {
  for (let el = node; el && el !== root; el = el.parentNode) {
    if (el.nodeType === Node.ELEMENT_NODE && BLOCKS.has(el.tagName)) return el;
  }
  return root;
}

// Call right after a space was typed. True when it formatted something.
export function applyAutoformat(root) {
  const selection = globalThis.getSelection?.();
  if (!selection?.rangeCount || !selection.isCollapsed) return false;
  const head = document.createRange();
  head.setStart(blockOf(selection.anchorNode, root), 0);
  head.setEnd(selection.anchorNode, selection.anchorOffset);
  const typed = head.toString();
  const rule = AUTOFORMAT.find(([pattern]) => pattern.test(typed.replace(/\s$/, "")));
  if (!rule || !/\s$/.test(typed) || selectionList(root)) return false;
  selection.removeAllRanges();
  selection.addRange(head);
  document.execCommand("delete");
  runRichCommand(rule[1], root);
  return true;
}

// Enter on a ticked item clones its attributes, tick included; a new empty
// item starts unticked.
export function untickNewItem() {
  const item = elementOf(globalThis.getSelection?.()?.anchorNode)?.closest?.("li[data-checked]");
  if (item && !item.textContent) item.removeAttribute("data-checked");
}

// The checklist item whose box (drawn in the item's left padding) is under
// the pointer, or null.
export function checkboxAt(event, root) {
  const item = event.target?.closest?.("ul[data-check] > li");
  if (!item || !root.contains(item)) return null;
  const rect = item.getBoundingClientRect();
  const scale = item.offsetWidth ? rect.width / item.offsetWidth : 1;
  const pad = parseFloat(globalThis.getComputedStyle(item).paddingLeft) || 0;
  return event.clientX - rect.left <= pad * scale ? item : null;
}

export function toggleCheckbox(item) {
  if (item.getAttribute("data-checked") === "true") item.removeAttribute("data-checked");
  else item.setAttribute("data-checked", "true");
}

// Google Docs' own shortcuts, so muscle memory carries over. Ctrl+B/I/U and
// undo/redo are native to contentEditable already. Codes, not keys: Shift+7
// is "/" on a German layout. AltGr reads as Ctrl+Alt on Windows and types ²
// and ³, so it never counts as a shortcut.
export function shortcutCommand(event) {
  const mod = event.ctrlKey || event.metaKey;
  const code = event.code || "";
  const key = (event.key || "").toLowerCase();
  if (event.getModifierState?.("AltGraph")) return null;
  if (mod && event.altKey && !event.shiftKey) {
    return { Digit0: "p", Digit1: "h1", Digit2: "h2", Digit3: "h3" }[code] || null;
  }
  if (mod && event.shiftKey && !event.altKey) {
    return (
      { Digit7: "insertOrderedList", Digit8: "insertUnorderedList", Digit9: "checklist" }[code] ||
      { l: "justifyLeft", e: "justifyCenter", r: "justifyRight", j: "justifyFull" }[key] ||
      null
    );
  }
  if (!mod && event.altKey && event.shiftKey && code === "Digit5") return "strikeThrough";
  if (mod && !event.shiftKey && !event.altKey) {
    return { ".": "superscript", ",": "subscript", "\\": "removeFormat", k: "link" }[key] || null;
  }
  return null;
}

// Drops an empty marker element at the caret, so the caret can find its way
// back after the text around it moved into another box (a page-width box
// continuing on the next page). The sanitizer lets it through for that trip.
export function markCaret(root) {
  const selection = globalThis.getSelection?.();
  if (!selection?.rangeCount || !root.contains(selection.focusNode)) return null;
  const marker = document.createElement("span");
  marker.setAttribute("data-caret", "");
  const range = document.createRange();
  range.setStart(selection.focusNode, selection.focusOffset);
  range.insertNode(marker);
  return marker;
}

// Puts the caret on the marker markCaret left in root (removing it), or at
// the end of root when there is none.
export function placeCaret(root) {
  const selection = globalThis.getSelection?.();
  if (!selection) return;
  const marker = root.querySelector("[data-caret]");
  const range = document.createRange();
  if (marker) range.setStartBefore(marker);
  else range.selectNodeContents(root);
  range.collapse(Boolean(marker));
  selection.removeAllRanges();
  selection.addRange(range);
  marker?.remove();
}

export function placeCaretAtPoint(root, x, y) {
  const hit = document.caretRangeFromPoint?.(x, y);
  if (!hit || !root.contains(hit.startContainer)) return false;
  const selection = globalThis.getSelection?.();
  selection?.removeAllRanges();
  selection?.addRange(hit);
  return true;
}

// The first spot in root whose line reaches below limitY (client px): where a
// page-width box has to break so its first part fits the page. Line breaks
// count too, so a run of empty lines moves along. Null when everything fits.
export function splitPointBelow(root, limitY) {
  const range = document.createRange();
  const bottomOf = (node, offset) => {
    range.setStart(node, offset);
    range.setEnd(node, offset + 1);
    return range.getBoundingClientRect().bottom;
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName !== "BR") continue;
      range.selectNode(node);
      if (range.getBoundingClientRect().bottom > limitY) {
        return { node: node.parentNode, offset: [...node.parentNode.childNodes].indexOf(node) };
      }
      continue;
    }
    const length = node.data.length;
    if (!length || bottomOf(node, length - 1) <= limitY) continue;
    let low = 0;
    let high = length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (bottomOf(node, mid) > limitY) high = mid;
      else low = mid + 1;
    }
    return { node, offset: low };
  }
  return null;
}

// Cuts everything from the start of `from` (a live range, so edits made
// since it was set have moved it along) to the end of root, as HTML. Empty
// shells left at the end of root (a paragraph cut at its start) and a line
// break opening the cut part are dropped.
export function cutFrom(root, from) {
  from.setEnd(root, root.childNodes.length);
  const holder = document.createElement("div");
  holder.appendChild(from.extractContents());
  while (root.lastChild && !root.lastChild.textContent.trim()) root.lastChild.remove();
  while (holder.firstChild?.nodeName === "BR") holder.firstChild.remove();
  return holder.innerHTML;
}
