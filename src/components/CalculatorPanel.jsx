import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Calculator, X, RotateCcw, Copy, Check, ArrowDownToLine } from 'lucide-react';
import casioImage from '../assets/casio-fx991dex.png';
import { CASIO_KEYS } from '../calculator/casioKeyMap.js';
import { createCasioState, handleCasioKeyPress } from '../calculator/casioEngine.js';
import { renderMathCard, formatMathToText } from '../calculator/mathRenderer.js';
import CasioScreen from '../calculator/CasioScreen.jsx';

export default function CalculatorPanel({
  active = false,
  isActive = true,
  onClose,
  onInsertToDocument,
}) {
  const [state, setState] = useState(createCasioState);
  const [activeKeyId, setActiveKeyId] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [insertSuccess, setInsertSuccess] = useState(false);
  const keyFeedbackTimerRef = useRef(null);

  const pressKey = useCallback((keyId) => {
    setState((prev) => handleCasioKeyPress(prev, keyId));
    setActiveKeyId(keyId);
    clearTimeout(keyFeedbackTimerRef.current);
    keyFeedbackTimerRef.current = setTimeout(() => {
      setActiveKeyId(null);
    }, 150);
  }, []);

  const handleReset = useCallback(() => {
    setState(createCasioState());
  }, []);

  const hasContentToExport =
    (state.items && state.items.length > 0) ||
    state.resultText !== null ||
    state.numericResult !== null;

  const handleCopy = useCallback(async () => {
    const text = formatMathToText({
      items: state.items,
      resultText: state.resultText,
      numericResult: state.numericResult,
      fractionResult: state.fractionResult,
      isFractionMode: state.isFractionMode,
    });

    const card = renderMathCard({
      items: state.items,
      resultText: state.resultText,
      numericResult: state.numericResult,
      fractionResult: state.fractionResult,
      isFractionMode: state.isFractionMode,
      theme: 'card',
      scale: 3,
    });

    let copied = false;

    if (card?.dataUrl && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      try {
        const res = await fetch(card.dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob,
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ]);
        copied = true;
      } catch (err) {
        // Fallback to text
      }
    }

    if (!copied && text && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        // ignore
      }
    }

    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 1600);
  }, [state]);

  const handleInsertToDocument = useCallback(() => {
    const card = renderMathCard({
      items: state.items,
      resultText: state.resultText,
      numericResult: state.numericResult,
      fractionResult: state.fractionResult,
      isFractionMode: state.isFractionMode,
      theme: 'card',
      scale: 3,
    });

    if (!card) return;

    const text = formatMathToText({
      items: state.items,
      resultText: state.resultText,
      numericResult: state.numericResult,
      fractionResult: state.fractionResult,
      isFractionMode: state.isFractionMode,
    });

    onInsertToDocument?.({
      dataUrl: card.dataUrl,
      width: card.width,
      height: card.height,
      text,
    });

    setInsertSuccess(true);
    setTimeout(() => setInsertSuccess(false), 1600);
  }, [state, onInsertToDocument]);

  // Keyboard shortcut listener when calculator is active
  useEffect(() => {
    if (!active || !isActive) return undefined;

    const handleKeyDown = (event) => {
      // Don't intercept if user is typing in an input, textarea or contenteditable element
      const target = event.target;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const key = event.key;
      let mapped = null;

      if (key >= '0' && key <= '9') {
        mapped = `NUM_${key}`;
      } else if (key === '+') {
        mapped = 'PLUS';
      } else if (key === '-') {
        mapped = 'MINUS';
      } else if (key === '*') {
        mapped = 'MUL';
      } else if (key === '/') {
        mapped = 'DIV';
      } else if (key === '=' || key === 'Enter') {
        mapped = 'EQUALS';
      } else if (key === 'Backspace') {
        mapped = 'DEL';
      } else if (key === 'Escape') {
        mapped = 'AC';
      } else if (key === '.' || key === ',') {
        mapped = 'DOT';
      } else if (key === '(') {
        mapped = 'LPAREN';
      } else if (key === ')') {
        mapped = 'RPAREN';
      } else if (key === '^') {
        mapped = 'POW';
      }

      if (mapped) {
        event.preventDefault();
        pressKey(mapped);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, isActive, pressKey]);

  return (
    <section
      className="rail-calculator"
      data-testid="calculator-panel"
      hidden={!active}
      aria-hidden={!active}
    >
      <header className="calculator-panel-header">
        <span className="calculator-panel-title">
          <Calculator size={16} /> CASIO fx-991DEX
        </span>
        <div className="calculator-panel-actions">
          <button
            type="button"
            className={`calculator-insert-pill ${insertSuccess ? 'success' : ''}`}
            onClick={handleInsertToDocument}
            title="Rechnung formatiert in Notiz einfügen"
            disabled={!hasContentToExport}
          >
            {insertSuccess ? <Check size={13} /> : <ArrowDownToLine size={13} />}
            <span>{insertSuccess ? 'Eingefügt!' : 'In Notiz'}</span>
          </button>
          <button
            type="button"
            className="editor-popover-icon-btn"
            onClick={handleCopy}
            title="Rechnung kopieren (Bild & Text)"
            disabled={!hasContentToExport}
          >
            {copySuccess ? <Check size={13} color="#22c55e" /> : <Copy size={13} />}
          </button>
          <button
            type="button"
            className="editor-popover-icon-btn"
            onClick={handleReset}
            title="Rechner zurücksetzen"
          >
            <RotateCcw size={13} />
          </button>
          <button
            type="button"
            className="editor-popover-close"
            onClick={onClose}
            title="Schließen"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="calculator-viewport">
        <div className="casio-device-container">
          {/* Transparent Casio Image */}
          <img
            src={casioImage}
            alt="CASIO fx-991DEX ClassWiz"
            className="casio-base-image"
            draggable={false}
          />

          {/* LCD Screen Overlay */}
          <CasioScreen
            items={state.items}
            cursorTarget={state.cursorTarget}
            resultText={state.resultText}
            error={state.error}
            shift={state.shift}
            alpha={state.alpha}
            angleMode={state.angleMode}
            hasHistory={state.history.length > 0}
            isFractionMode={state.isFractionMode}
            fractionResult={state.fractionResult}
          />

          {/* Invisible Hitbox Buttons */}
          <div className="casio-hitbox-grid">
            {CASIO_KEYS.map((k) => {
              const isPressed = activeKeyId === k.id;
              return (
                <button
                  key={k.id}
                  className={`casio-hitbox casio-shape-${k.shape} ${isPressed ? 'pressed' : ''}`}
                  style={{
                    left: `${k.left}%`,
                    top: `${k.top}%`,
                    width: `${k.width}%`,
                    height: `${k.height}%`,
                  }}
                  onClick={() => pressKey(k.id)}
                  title={k.name}
                  aria-label={k.name}
                  type="button"
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
