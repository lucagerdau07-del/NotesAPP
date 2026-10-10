import React, { useEffect, useRef } from 'react';
import { CASIO_SCREEN_COORDS } from './casioKeyMap.js';

export default function CasioScreen({
  items = [],
  cursorTarget = { nodeId: null, slot: null, index: 0 },
  resultText = null,
  error = null,
  shift = false,
  alpha = false,
  angleMode = 'DEG',
  hasHistory = false,
  isFractionMode = false,
  fractionResult = null,
}) {
  const exprRef = useRef(null);

  useEffect(() => {
    if (exprRef.current) {
      exprRef.current.scrollLeft = exprRef.current.scrollWidth;
    }
  }, [items, cursorTarget]);

  // Helper to render a slot (e.g. numerator, denominator, root content, power base/exp)
  const renderSlot = (slotItems = [], nodeId, slotName) => {
    const isSlotActive =
      cursorTarget.nodeId === nodeId && cursorTarget.slot === slotName;

    if (slotItems.length === 0) {
      return (
        <span className={`casio-placeholder-box ${isSlotActive ? 'active' : ''}`}>
          {isSlotActive && <span className="casio-lcd-cursor" />}
        </span>
      );
    }

    return (
      <span className="casio-slot-contents">
        {slotItems.map((item, idx) => (
          <React.Fragment key={idx}>
            {isSlotActive && cursorTarget.index === idx && (
              <span className="casio-lcd-cursor" />
            )}
            {renderItem(item)}
          </React.Fragment>
        ))}
        {isSlotActive && cursorTarget.index === slotItems.length && (
          <span className="casio-lcd-cursor" />
        )}
      </span>
    );
  };

  // Helper to render an item (either string or 2D template node)
  const renderItem = (item, idx) => {
    if (typeof item === 'string') {
      return <span className="casio-token" key={idx}>{item}</span>;
    }

    if (!item || typeof item !== 'object') return null;

    if (item.type === 'frac') {
      return (
        <span className="casio-natural-fraction" key={item.id}>
          <span className="casio-frac-num">
            {renderSlot(item.num, item.id, 'num')}
          </span>
          <span className="casio-frac-bar" />
          <span className="casio-frac-den">
            {renderSlot(item.den, item.id, 'den')}
          </span>
        </span>
      );
    }

    if (item.type === 'sqrt') {
      return (
        <span className="casio-natural-sqrt" key={item.id}>
          <svg
            className="casio-sqrt-hook"
            viewBox="0 0 10 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M 1 9.5 L 2.8 7.5 L 4.8 18 L 8.5 1.5 L 10 1.5"
              stroke="#1a271e"
              strokeWidth="1.3"
              strokeLinecap="square"
              strokeLinejoin="miter"
            />
          </svg>
          <span className="casio-sqrt-content">
            {renderSlot(item.content, item.id, 'content')}
          </span>
        </span>
      );
    }

    if (item.type === 'pow') {
      return (
        <span className="casio-natural-pow" key={item.id}>
          <span className="casio-pow-base">
            {renderSlot(item.base, item.id, 'base')}
          </span>
          <span className="casio-pow-exp">
            {renderSlot(item.exp, item.id, 'exp')}
          </span>
        </span>
      );
    }

    if (item.type === 'integral') {
      return (
        <span className="casio-natural-integral" key={item.id}>
          <span className="casio-int-symbol">∫</span>
          <span className="casio-int-limits">
            <span className="casio-int-upper">
              {renderSlot(item.upper, item.id, 'upper')}
            </span>
            <span className="casio-int-lower">
              {renderSlot(item.lower, item.id, 'lower')}
            </span>
          </span>
          <span className="casio-int-body">
            {renderSlot(item.integrand, item.id, 'integrand')}
            <span className="casio-int-dx">dx</span>
          </span>
        </span>
      );
    }

    return null;
  };

  const isRootActive = cursorTarget.nodeId === null;

  return (
    <div
      className="casio-screen-overlay"
      style={{
        left: `${CASIO_SCREEN_COORDS.left}%`,
        top: `${CASIO_SCREEN_COORDS.top}%`,
        width: `${CASIO_SCREEN_COORDS.width}%`,
        height: `${CASIO_SCREEN_COORDS.height}%`,
      }}
    >
      {/* Authentic Casio Top LCD Status Bar with ghost LCD segments */}
      <div className="casio-lcd-header">
        <div className="casio-indicators">
          <span className={`casio-ind ${shift ? 'active' : 'ghost'}`}>S</span>
          <span className={`casio-ind ${alpha ? 'active' : 'ghost'}`}>A</span>
          <span className="casio-ind active">M</span>
          <span className="casio-ind active casio-natural-icon" title="Natural V.P.A.M.">
            <svg width="13" height="9" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 5.5l2 3 2.5-7h8" />
              <path d="M9.5 4l1.8 3M11.3 4l-1.8 3" strokeWidth="1.1" />
            </svg>
          </span>
          <span className="casio-ind active casio-angle-box">
            {angleMode === 'DEG' ? 'D' : 'R'}
          </span>
          <span className="casio-ind ghost">i</span>
          <span className="casio-ind ghost">FIX</span>
          <span className="casio-ind ghost">SCI</span>
          {hasHistory && <span className="casio-ind active casio-history-arrow">▲▼</span>}
        </div>
        <div className="casio-header-right">
          <span className="casio-ind active casio-solar-dot">●</span>
        </div>
      </div>

      {/* Main Natural V.P.A.M. Expression Line with Block Cursor */}
      <div className="casio-lcd-expression" ref={exprRef}>
        {error ? (
          <span className="casio-lcd-error">{error}</span>
        ) : items.length === 0 ? (
          <span className="casio-lcd-cursor" />
        ) : (
          <>
            {items.map((item, idx) => (
              <React.Fragment key={item?.id || idx}>
                {isRootActive && cursorTarget.index === idx && (
                  <span className="casio-lcd-cursor" />
                )}
                {renderItem(item, idx)}
              </React.Fragment>
            ))}
            {isRootActive && cursorTarget.index === items.length && (
              <span className="casio-lcd-cursor" />
            )}
          </>
        )}
      </div>

      {/* Result Line (Right aligned) */}
      <div className="casio-lcd-result">
        {resultText !== null && !error && (
          isFractionMode && fractionResult && fractionResult.d !== 1 ? (
            <div className="casio-result-fraction-wrapper">
              {fractionResult.n < 0 && (
                <span className="casio-result-fraction-minus">−</span>
              )}
              <span className="casio-natural-fraction casio-result-fraction">
                <span className="casio-frac-num">{Math.abs(fractionResult.n)}</span>
                <span className="casio-frac-bar" />
                <span className="casio-frac-den">{fractionResult.d}</span>
              </span>
            </div>
          ) : (
            <span className="casio-result-value">{resultText}</span>
          )
        )}
      </div>
    </div>
  );
}
