import React, { useEffect, useRef } from 'react';
import { CASIO_SCREEN_COORDS } from './casioKeyMap.js';

export default function CasioScreen({
  tokens = [],
  cursor = 0,
  resultText = null,
  error = null,
  shift = false,
  alpha = false,
  angleMode = 'DEG',
  hasHistory = false,
}) {
  const exprRef = useRef(null);

  useEffect(() => {
    // Keep cursor in view when typing long formulas
    if (exprRef.current) {
      exprRef.current.scrollLeft = exprRef.current.scrollWidth;
    }
  }, [tokens, cursor]);

  const beforeCursor = tokens.slice(0, cursor).join('');
  const afterCursor = tokens.slice(cursor).join('');

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

      {/* Main Formula / Expression Line */}
      <div className="casio-lcd-expression" ref={exprRef}>
        {error ? (
          <span className="casio-lcd-error">{error}</span>
        ) : (
          <>
            <span>{beforeCursor}</span>
            <span className="casio-lcd-cursor"></span>
            <span>{afterCursor}</span>
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
