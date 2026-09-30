import React, { useEffect, useRef, useState } from "react";
import { ArrowBigUp, ChevronDown, ChevronLeft, ChevronRight, ClipboardPaste, CornerDownLeft, Delete } from "lucide-react";
import { useChemKeyboardEnabled } from "./chemKeyboard/chemKeyboardState.js";
import { ALTERNATES, LETTER_ROWS, SYMBOL_ROWS, typedChar } from "./chemKeyboard/chemKeyboardLogic.js";
import { learn, learnFromStorage, predict, setGlossary } from "./chemKeyboard/wordSuggest.js";
import { browserKnowledgeRepository } from "../knowledge/knowledgeRepository.js";
import "../styles/chemKeyboard.css";

const isPageField = (el) => Boolean(el?.isContentEditable);

function charBeforeCaret() {
  const selection = globalThis.getSelection?.();
  if (!selection?.isCollapsed || !selection.anchorNode) return "";
  let node = selection.anchorNode;
  let offset = selection.anchorOffset;
  // The app parks the caret on the element itself (offset = child count), not
  // inside a text node: step into the child just before it.
  if (node.nodeType !== 3) {
    node = node.childNodes[offset - 1];
    while (node?.lastChild) node = node.lastChild;
    offset = node?.data?.length ?? 0;
  }
  return node?.nodeType === 3 ? node.data.slice(Math.max(0, offset - 1), offset) : "";
}


// Keys fire on pointerdown (not click): the wrapper cancels touchstart so a long
// press cannot hand focus to the button (which would close the keyboard), and
// that also suppresses the click. repeat: keeps firing while held.
// alts: fires on release instead; holding ~0.35s opens a popup of variants
// (ä, ß, ₂ ...) and releasing over one types it.
const altAt = (event) => document.elementFromPoint(event.clientX, event.clientY)?.dataset?.alt;

const Key = ({ label, onPress, className = "", grow, title, hint, repeat, alts, onPick }) => {
  const timer = useRef(null);
  const popupOpen = useRef(false);
  const [popup, setPopup] = useState(false);
  const [hover, setHover] = useState(null);
  const stop = () => {
    clearTimeout(timer.current);
    clearInterval(timer.current);
  };
  // The key can vanish mid-hold (keyboard hides on blur): never leave the timer running.
  useEffect(() => stop, []);
  const start = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (alts) {
      timer.current = setTimeout(() => {
        popupOpen.current = true;
        setPopup(true);
      }, 350);
      return;
    }
    onPress();
    if (repeat)
      timer.current = setTimeout(() => {
        timer.current = setInterval(onPress, 55);
      }, 380);
  };
  const end = (event) => {
    stop();
    if (!alts) return;
    if (popupOpen.current) {
      const alt = altAt(event);
      if (alt && event.type === "pointerup") onPick(alt);
    } else if (event.type === "pointerup") onPress();
    popupOpen.current = false;
    setPopup(false);
    setHover(null);
  };
  return (
    <button
      type="button"
      tabIndex={-1}
      title={title}
      className={`chem-key ${className}`}
      style={grow ? { flexGrow: grow } : undefined}
      onMouseDown={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={start}
      onPointerMove={popup ? (event) => setHover(altAt(event) ?? null) : undefined}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={alts ? undefined : stop}
    >
      {hint && <span className="chem-hint">{hint}</span>}
      {label}
      {popup && (
        <span className="chem-alts">
          {alts.map((alt) => (
            <span key={alt} data-alt={alt} className={hover === alt ? "hover" : ""}>
              {alt}
            </span>
          ))}
        </span>
      )}
    </button>
  );
};

// Text of a cloned range as the user sees it: line breaks and block boundaries
// become a newline (Range.toString() would glue the lines together).
function flatten(node, out = { text: "" }) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) out.text += child.data;
    else if (child.nodeName === "BR") out.text += "\n";
    else {
      if (/^(DIV|P|LI|TR|TD)$/.test(child.nodeName) && out.text && !out.text.endsWith("\n")) out.text += "\n";
      flatten(child, out);
    }
  }
  return out.text;
}

// Everything in the focused field left of a collapsed caret ("" otherwise).
function textBeforeCaret() {
  const selection = globalThis.getSelection?.();
  const field = document.activeElement;
  if (!selection?.rangeCount || !selection.isCollapsed || !field?.isContentEditable || !field.contains(selection.anchorNode))
    return "";
  const head = document.createRange();
  head.selectNodeContents(field);
  head.setEnd(selection.anchorNode, selection.anchorOffset);
  return flatten(head.cloneContents());
}

const syncGlossary = () => {
  try {
    setGlossary((browserKnowledgeRepository.read().terms ?? []).map((t) => t.term).filter(Boolean));
  } catch {
    // no glossary yet
  }
};

const blockTouch = (event) => event.preventDefault();

const upper = (ch) => (ch === "ß" ? ch : ch.toUpperCase());

const move = (direction, granularity) => globalThis.getSelection?.()?.modify("move", direction, granularity);

// Floats over the page like the iOS keyboard (the page is not pushed up).
// Replaces the native keyboard inside page text fields (text objects, table
// cells): those get inputmode="none" while it is on (PageObjectLayer), so this
// panel is the only thing that shows. Keys never take focus (mousedown is
// cancelled), so the field keeps its caret and its blur-commit does not fire.
export default function ChemKeyboard() {
  const enabled = useChemKeyboardEnabled();
  const [fieldFocused, setFieldFocused] = useState(false);
  const [layer, setLayer] = useState("abc");
  const [script, setScript] = useState("normal");
  const [formula, setFormula] = useState(false);
  const [shift, setShift] = useState(false);
  const [before, setBefore] = useState("");
  const visible = enabled && fieldFocused;

  useEffect(() => {
    // focusout fires before focus lands elsewhere; wait a tick so moving from
    // one table cell to the next does not flicker the panel away.
    const update = () => setTimeout(() => setFieldFocused(isPageField(document.activeElement)), 0);
    const focusedIn = () => {
      syncGlossary();
      update();
    };
    const focusedOut = (event) => {
      if (isPageField(event.target)) learn(event.target.innerText ?? "");
      update();
    };
    update();
    const track = () => setBefore(textBeforeCaret());
    document.addEventListener("selectionchange", track);
    document.addEventListener("input", track);
    document.addEventListener("focusin", focusedIn);
    document.addEventListener("focusout", focusedOut);
    return () => {
      document.removeEventListener("selectionchange", track);
      document.removeEventListener("input", track);
      document.removeEventListener("focusin", focusedIn);
      document.removeEventListener("focusout", focusedOut);
    };
  }, []);

  // Once per session (after the keyboard is first switched on): the words from
  // your stored notes become vocabulary. The tick re-renders the suggestions.
  const [, setVocabTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    syncGlossary();
    learnFromStorage().then(() => setVocabTick((n) => n + 1));
  }, [enabled]);

  if (!visible) return null;

  const type = (ch) => {
    const out = typedChar(shift ? upper(ch) : ch, { script, formula, before: charBeforeCaret() });
    document.execCommand("insertText", false, out);
    setShift(false);
  };

  const prefix = before.match(/\p{L}+$/u)?.[0] ?? "";
  const head = before.slice(0, before.length - prefix.length);
  const suggestions = predict({
    prefix,
    previous: head.match(/(\p{L}+)\s+$/u)?.[1]?.toLowerCase() ?? "",
    sentenceStart: !head.trim() || /[.!?:]\s*$/.test(head) || /\n\s*$/.test(head),
    extraWords: head.match(/\p{L}{4,}/gu) ?? [],
  });
  const accept = (word) => {
    const selection = globalThis.getSelection?.();
    for (let i = 0; i < prefix.length; i++) selection?.modify("extend", "backward", "character");
    document.execCommand("insertText", false, `${word} `);
  };
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) document.execCommand("insertText", false, text);
    } catch {
      // clipboard read blocked by the WebView: nothing to paste
    }
  };

  const rows = layer === "abc" ? LETTER_ROWS : SYMBOL_ROWS;
  const scriptKey = (id, label) => (
    <Key
      label={label}
      className={script === id ? "on" : ""}
      onPress={() => setScript(script === id ? "normal" : id)}
    />
  );
  const shiftKey = (
    <Key
      label={<ArrowBigUp size={24} />}
      grow={2}
      className={shift ? "on" : ""}
      onPress={() => setShift(!shift)}
    />
  );

  return (
    <div
      className="chem-kb-wrap"
      data-testid="chem-keyboard"
      ref={(el) => el?.addEventListener("touchstart", blockTouch, { passive: false })}
    >
      <div className="chem-kb">
        <div className="chem-kb-bar">
          <Key
            label="H₂O"
            title="Formelmodus: Ziffern nach Buchstaben tiefstellen"
            className={formula ? "on" : ""}
            onPress={() => setFormula(!formula)}
          />
          <Key label={<ClipboardPaste size={20} />} title="Einfügen" onPress={paste} />
          <div className="chem-suggest" data-testid="chem-suggest">
            {suggestions.map((word, slot) => (
              <Key key={slot} label={word} className="suggest" onPress={() => accept(word)} />
            ))}
          </div>
          <Key label="⇤" title="Zeilenanfang" onPress={() => move("backward", "lineboundary")} />
          <Key label="⇥" title="Zeilenende" onPress={() => move("forward", "lineboundary")} />
        </div>
        {rows.map((row, index) => (
          <div className="chem-kb-row" key={`${layer}${index}`}>
            {layer === "abc" && index === 3 && shiftKey}
            {row.map((ch, col) => (
              <Key
                key={ch}
                label={shift ? upper(ch) : ch}
                hint={layer === "abc" && index === 0 ? "!@#$%^&*()"[col] : undefined}
                alts={layer === "abc" ? ALTERNATES[ch]?.map((alt) => (shift ? upper(alt) : alt)) : undefined}
                onPick={type}
                onPress={() => type(ch)}
              />
            ))}
            {layer === "abc" && index === 3 && shiftKey}
            {index === 0 && <Key repeat label="Del" grow={1.5} onPress={() => document.execCommand("forwardDelete")} />}
            {index === 1 && (
              <Key repeat label={<Delete size={24} />} grow={2} onPress={() => document.execCommand("delete")} />
            )}
            {index === 2 && (
              <Key
                label={<CornerDownLeft size={24} />}
                grow={2}
                onPress={() => document.execCommand("insertParagraph")}
              />
            )}
          </div>
        ))}
        <div className="chem-kb-row">
          <Key label={layer === "abc" ? "!#1" : "ABC"} grow={1.4} onPress={() => setLayer(layer === "abc" ? "sym" : "abc")} />
          {scriptKey("sub", "aₙ")}
          {scriptKey("sup", "aⁿ")}
          {scriptKey("normal", "n")}
          <Key label="Deutsch" className="space" grow={6} onPress={() => type(" ")} />
          <Key label="+" grow={1} alts={ALTERNATES["+"]} onPick={type} onPress={() => type("+")} />
          <Key label="-" grow={1} alts={ALTERNATES["-"]} onPick={type} onPress={() => type("-")} />
          <Key repeat label={<ChevronLeft size={26} />} grow={1.2} onPress={() => move("backward", "character")} />
          <Key repeat label={<ChevronRight size={26} />} grow={1.2} onPress={() => move("forward", "character")} />
          <Key
            label={<ChevronDown size={26} />}
            grow={1.2}
            title="Tastatur ausblenden"
            onPress={() => document.activeElement?.blur?.()}
          />
        </div>
      </div>
    </div>
  );
}
