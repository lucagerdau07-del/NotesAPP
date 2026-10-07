import { useEffect, useLayoutEffect, useReducer, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  RemoveFormatting,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from "lucide-react";
import { promptLink, runRichCommand } from "../../ink/richText.js";

const PARAGRAPHS = [
  ["p", "Text", "Normaler Text (Strg+Alt+0)"],
  ["h1", "H1", "Überschrift 1 (Strg+Alt+1)"],
  ["h2", "H2", "Überschrift 2 (Strg+Alt+2)"],
  ["h3", "H3", "Überschrift 3 (Strg+Alt+3)"],
];
const HEADINGS = new Set(["h1", "h2", "h3"]);

// [command, icon, title], one array per divider-separated group.
const GROUPS = [
  [
    ["bold", Bold, "Fett (Strg+B)"],
    ["italic", Italic, "Kursiv (Strg+I)"],
    ["underline", Underline, "Unterstrichen (Strg+U)"],
    ["strikeThrough", Strikethrough, "Durchgestrichen (Alt+Umschalt+5)"],
    ["superscript", Superscript, "Hochgestellt (Strg+.)"],
    ["subscript", Subscript, "Tiefgestellt (Strg+,)"],
  ],
  [
    ["insertUnorderedList", List, "Aufzählung (Strg+Umschalt+8)"],
    ["insertOrderedList", ListOrdered, "Nummerierung (Strg+Umschalt+7)"],
    ["checklist", ListChecks, "Checkliste (Strg+Umschalt+9)"],
    ["outdent", IndentDecrease, "Einzug verkleinern (Umschalt+Tab)"],
    ["indent", IndentIncrease, "Einzug vergrößern (Tab)"],
  ],
  [
    ["justifyLeft", AlignLeft, "Linksbündig (Strg+Umschalt+L)"],
    ["justifyCenter", AlignCenter, "Zentriert (Strg+Umschalt+E)"],
    ["justifyRight", AlignRight, "Rechtsbündig (Strg+Umschalt+R)"],
    ["justifyFull", AlignJustify, "Blocksatz (Strg+Umschalt+J)"],
  ],
];

const TEXT_COLORS = ["#EFECE4", "#1A1A1A", "#3E7BD8", "#D8615B", "#4FA66B", "#D4A937", "#9B6BD8"];
// See-through, so a marker reads on dark and light paper with the text's
// own color on top.
const MARKERS = [
  "rgba(255, 214, 0, 0.42)",
  "rgba(80, 220, 120, 0.4)",
  "rgba(70, 160, 255, 0.4)",
  "rgba(255, 90, 140, 0.4)",
  "rgba(255, 150, 40, 0.42)",
];

const ALIGNS = { justifyLeft: "left", justifyCenter: "center", justifyRight: "right", justifyFull: "justify" };

const query = (fn, command) => {
  try {
    return document[fn]?.(command);
  } catch {
    return undefined;
  }
};

// Shown while a text box is being edited. Every button acts on the focused
// field through execCommand; pressing one must never take the focus (and
// with it the selection) away from that field, hence the preventDefault.
export default function RichTextToolbar({ objectId, onEdit, onAlign }) {
  const [, refresh] = useReducer((count) => count + 1, 0);
  const [palette, setPalette] = useState(null);
  // Spans the gap between the editor's title pill (left) and actions pill
  // (right), on the pills' own row.
  const [slot, setSlot] = useState(null);

  useLayoutEffect(() => {
    const measure = () => {
      const left = document.querySelector(".editor-title-pill:not(.panel-open)")?.getBoundingClientRect();
      const right = document.querySelector(".editor-actions-pill")?.getBoundingClientRect();
      if (!left || !right || right.left - left.right < 120) return setSlot(null);
      setSlot({ left: left.right + 10, right: window.innerWidth - right.left + 10, top: left.top, height: left.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refresh);
    return () => document.removeEventListener("selectionchange", refresh);
  }, []);

  const run = (command, value) => {
    let field = document.activeElement;
    if (!field?.isContentEditable) {
      // Alignment is a property of the box: set it without opening the keyboard.
      const align = ALIGNS[command];
      if (align && onAlign) return onAlign(objectId, align);
      // Only selected, not editing: start editing and format the whole box.
      onEdit?.(objectId);
      setTimeout(() => {
        field = document.querySelector(`[data-object-id="${objectId}"] .rich-text`);
        if (!field?.isContentEditable) return;
        field.focus();
        document.execCommand("selectAll");
        apply(field, command, value);
      }, 60);
      return;
    }
    apply(field, command, value);
  };
  const apply = (field, command, value) => {
    if (command === "link") promptLink(field);
    else runRichCommand(command, field, value);
    refresh();
  };
  const block = query("queryCommandValue", "formatBlock") || "";

  const button = (command, Icon, title) => (
    <button
      key={command}
      type="button"
      tabIndex={-1}
      title={title}
      aria-label={title}
      className={`rich-tool-btn ${query("queryCommandState", command) === true ? "active" : ""}`}
      onClick={() => run(command)}
    >
      <Icon size={16} />
    </button>
  );
  const paletteButton = (id, Icon, title) => (
    <button
      type="button"
      tabIndex={-1}
      title={title}
      aria-label={title}
      className={`rich-tool-btn ${palette === id ? "active" : ""}`}
      onClick={() => setPalette((open) => (open === id ? null : id))}
    >
      <Icon size={16} />
    </button>
  );

  return createPortal(
    <div
      className="rich-toolbar"
      role="toolbar"
      aria-label="Textformat"
      data-testid="rich-text-toolbar"
      style={
        slot
          ? { top: slot.top, left: slot.left, right: slot.right, transform: "none", maxWidth: "none", minHeight: slot.height, boxSizing: "border-box", justifyContent: "center" }
          : undefined
      }
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="rich-toolbar-row">
        {PARAGRAPHS.map(([id, label, title]) => (
          <button
            key={id}
            type="button"
            tabIndex={-1}
            title={title}
            aria-label={title}
            className={`rich-tool-btn ${block === id || (id === "p" && !HEADINGS.has(block)) ? "active" : ""}`}
            onClick={() => run(id)}
          >
            {label}
          </button>
        ))}
        {GROUPS.map((group, index) => (
          <span key={index} className="rich-toolbar-group">
            <span className="rich-toolbar-divider" />
            {group.map(([command, Icon, title]) => button(command, Icon, title))}
            {index === 0 && paletteButton("color", Baseline, "Textfarbe")}
            {index === 0 && paletteButton("marker", Highlighter, "Markieren")}
          </span>
        ))}
        <span className="rich-toolbar-divider" />
        {button("link", Link2, "Link (Strg+K)")}
        {button("removeFormat", RemoveFormatting, "Formatierung entfernen (Strg+\\)")}
      </div>
      {palette && (
        <div className="rich-toolbar-row" data-testid="rich-text-palette">
          {(palette === "color" ? TEXT_COLORS : ["transparent", ...MARKERS]).map((swatch) => (
            <button
              key={swatch}
              type="button"
              tabIndex={-1}
              title={swatch === "transparent" ? "Keine Markierung" : swatch}
              aria-label={swatch === "transparent" ? "Keine Markierung" : swatch}
              className={`rich-swatch ${swatch === "transparent" ? "rich-swatch-none" : ""}`}
              style={swatch === "transparent" ? undefined : { background: swatch }}
              onClick={() => {
                run(palette === "color" ? "foreColor" : "hiliteColor", swatch);
                setPalette(null);
              }}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
