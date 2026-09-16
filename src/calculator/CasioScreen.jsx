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
          <span className="casio-sqrt-symbol">√</span>
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
      {/* LCD Status Header Bar */}
      <div className="casio-lcd-status">
        <div className="casio-status-badges">
          {shift && <span className="casio-badge active">S</span>}
          {alpha && <span className="casio-badge active">A</span>}
          <span className="casio-badge active">{angleMode === 'DEG' ? 'D' : 'R'}</span>
          <span className="casio-badge active">Math</span>
          {hasHistory && <span className="casio-badge history">▲▼</span>}
        </div>
      </div>

      {/* Main Natural V.P.A.M. Expression Line */}
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
          <span className="casio-result-value">{resultText}</span>
        )}
      </div>
    </div>
  );
}
