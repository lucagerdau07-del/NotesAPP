/**
 * Math Renderer for Casio ClassWiz fx-991DEX
 * Generates high-DPI visual 2D math cards (PNG dataUrl) with authentic
 * mathematical formatting (stacked fractions, square root radical hooks & overbars,
 * superscripts, integrals, and results) for inserting and pasting into documents.
 */

const FONT_FAMILY = '"Cambria Math", "STIX Two Math", "KaTeX_Main", "Segoe UI", -apple-system, sans-serif';

/**
 * Recursive layout node builder for 2D math expressions.
 * Each node returns { width, height, ascent, descent, draw(ctx, x, baselineY) }
 */
export function layoutMathNode(ctx, item, fontSize = 22) {
  if (typeof item === 'string') {
    let text = item;
    // Map operators to typographic unicode symbols
    if (text === '-') text = '−';
    else if (text === '×') text = '×';
    else if (text === '÷') text = '÷';
    else if (text === 'π') text = 'π';
    else if (text === '²') text = '²';
    else if (text === '³') text = '³';
    else if (text === '⁻¹') text = '⁻¹';

    const isOperator = ['+', '−', '×', '÷', '='].includes(text);
    const pad = isOperator ? fontSize * 0.28 : 0;

    ctx.font = `600 ${fontSize}px ${FONT_FAMILY}`;
    const metrics = (ctx && typeof ctx.measureText === 'function')
      ? ctx.measureText(text)
      : { width: text.length * fontSize * 0.58 };
    const charWidth = metrics.width;
    const width = charWidth + pad * 2;
    const ascent = fontSize * 0.82;
    const descent = fontSize * 0.22;
    const height = ascent + descent;

    return {
      width,
      height,
      ascent,
      descent,
      draw: (drawCtx, x, baselineY, color = '#0f172a') => {
        drawCtx.save();
        drawCtx.font = `600 ${fontSize}px ${FONT_FAMILY}`;
        drawCtx.fillStyle = color;
        drawCtx.textAlign = 'left';
        drawCtx.textBaseline = 'alphabetic';
        drawCtx.fillText(text, x + pad, baselineY);
        drawCtx.restore();
      },
    };
  }

  if (!item || typeof item !== 'object') {
    return { width: 0, height: 0, ascent: 0, descent: 0, draw: () => {} };
  }

  // 1. Stacked 2D Fraction: num / den
  if (item.type === 'frac') {
    const subFontSize = Math.max(12, Math.round(fontSize * 0.82));
    const numLayout = layoutMathSequence(ctx, item.num && item.num.length ? item.num : ['0'], subFontSize);
    const denLayout = layoutMathSequence(ctx, item.den && item.den.length ? item.den : ['1'], subFontSize);

    const pad = Math.max(4, Math.round(fontSize * 0.22));
    const width = Math.max(numLayout.width, denLayout.width) + pad * 2;
    const barThickness = Math.max(1.6, fontSize * 0.075);
    const gap = Math.max(3, Math.round(fontSize * 0.14));
    const mathAxis = fontSize * 0.3; // Math axis height above baseline

    const ascent = mathAxis + gap + barThickness / 2 + numLayout.height;
    const descent = denLayout.height + gap + barThickness / 2 - mathAxis;
    const height = ascent + descent;

    return {
      width,
      height,
      ascent,
      descent,
      draw: (drawCtx, x, baselineY, color = '#0f172a') => {
        const barY = baselineY - mathAxis;

        // Draw horizontal fraction line
        drawCtx.save();
        drawCtx.strokeStyle = color;
        drawCtx.lineWidth = barThickness;
        drawCtx.lineCap = 'round';
        drawCtx.beginPath();
        drawCtx.moveTo(x + 1, barY);
        drawCtx.lineTo(x + width - 1, barY);
        drawCtx.stroke();
        drawCtx.restore();

        // Numerator centered above bar
        const numX = x + (width - numLayout.width) / 2;
        const numBaseline = barY - gap - barThickness / 2 - numLayout.descent;
        numLayout.draw(drawCtx, numX, numBaseline, color);

        // Denominator centered below bar
        const denX = x + (width - denLayout.width) / 2;
        const denBaseline = barY + gap + barThickness / 2 + denLayout.ascent;
        denLayout.draw(drawCtx, denX, denBaseline, color);
      },
    };
  }

  // 2. Square Root: √content
  if (item.type === 'sqrt') {
    const contentLayout = layoutMathSequence(
      ctx,
      item.content && item.content.length ? item.content : ['0'],
      fontSize,
    );

    const hookWidth = Math.max(11, Math.round(fontSize * 0.52));
    const overbarPad = Math.max(3, Math.round(fontSize * 0.14));
    const width = hookWidth + contentLayout.width + overbarPad;
    const barThickness = Math.max(1.5, fontSize * 0.07);
    const ascent = contentLayout.ascent + barThickness + 3;
    const descent = contentLayout.descent + 1;
    const height = ascent + descent;

    return {
      width,
      height,
      ascent,
      descent,
      draw: (drawCtx, x, baselineY, color = '#0f172a') => {
        const topY = baselineY - ascent + barThickness / 2;
        const bottomY = baselineY + descent - 1;
        const midY = baselineY - fontSize * 0.25;

        // Draw radical symbol & overbar
        drawCtx.save();
        drawCtx.strokeStyle = color;
        drawCtx.lineWidth = barThickness;
        drawCtx.lineCap = 'square';
        drawCtx.lineJoin = 'miter';
        drawCtx.beginPath();
        drawCtx.moveTo(x + 1, midY);
        drawCtx.lineTo(x + hookWidth * 0.28, midY - fontSize * 0.1);
        drawCtx.lineTo(x + hookWidth * 0.52, bottomY);
        drawCtx.lineTo(x + hookWidth * 0.9, topY);
        drawCtx.lineTo(x + width, topY);
        drawCtx.stroke();
        drawCtx.restore();

        // Draw content under overbar
        contentLayout.draw(drawCtx, x + hookWidth + 1, baselineY, color);
      },
    };
  }

  // 3. Power: base^exp
  if (item.type === 'pow') {
    const baseLayout = layoutMathSequence(
      ctx,
      item.base && item.base.length ? item.base : ['0'],
      fontSize,
    );
    const expFontSize = Math.max(11, Math.round(fontSize * 0.72));
    const expLayout = layoutMathSequence(
      ctx,
      item.exp && item.exp.length ? item.exp : ['0'],
      expFontSize,
    );

    const shiftUp = baseLayout.ascent * 0.65;
    const width = baseLayout.width + expLayout.width + 1;
    const ascent = Math.max(baseLayout.ascent, expLayout.ascent + shiftUp);
    const descent = baseLayout.descent;
    const height = ascent + descent;

    return {
      width,
      height,
      ascent,
      descent,
      draw: (drawCtx, x, baselineY, color = '#0f172a') => {
        baseLayout.draw(drawCtx, x, baselineY, color);
        expLayout.draw(drawCtx, x + baseLayout.width + 1, baselineY - shiftUp, color);
      },
    };
  }

  // 4. Integral
  if (item.type === 'integral') {
    const subFontSize = Math.max(10, Math.round(fontSize * 0.68));
    const upperLayout = layoutMathSequence(ctx, item.upper && item.upper.length ? item.upper : ['0'], subFontSize);
    const lowerLayout = layoutMathSequence(ctx, item.lower && item.lower.length ? item.lower : ['0'], subFontSize);
    const bodyLayout = layoutMathSequence(ctx, item.integrand && item.integrand.length ? item.integrand : ['x'], fontSize);
    const dxLayout = layoutMathNode(ctx, ' dx', fontSize);

    ctx.font = `400 ${fontSize * 1.5}px ${FONT_FAMILY}`;
    const intSymbolWidth = (ctx && typeof ctx.measureText === 'function')
      ? ctx.measureText('∫').width
      : fontSize * 0.7;
    const limitsWidth = Math.max(upperLayout.width, lowerLayout.width);
    const width = intSymbolWidth + limitsWidth + bodyLayout.width + dxLayout.width + 4;

    const ascent = Math.max(fontSize * 1.2, upperLayout.height + fontSize * 0.6);
    const descent = Math.max(fontSize * 0.6, lowerLayout.height + fontSize * 0.3);
    const height = ascent + descent;

    return {
      width,
      height,
      ascent,
      descent,
      draw: (drawCtx, x, baselineY, color = '#0f172a') => {
        drawCtx.save();
        drawCtx.font = `400 ${fontSize * 1.5}px ${FONT_FAMILY}`;
        drawCtx.fillStyle = color;
        drawCtx.textBaseline = 'alphabetic';
        drawCtx.fillText('∫', x, baselineY + fontSize * 0.2);
        drawCtx.restore();

        const limitsX = x + intSymbolWidth + 1;
        upperLayout.draw(drawCtx, limitsX, baselineY - ascent + upperLayout.ascent, color);
        lowerLayout.draw(drawCtx, limitsX, baselineY + descent - lowerLayout.descent, color);

        const bodyX = limitsX + limitsWidth + 2;
        bodyLayout.draw(drawCtx, bodyX, baselineY, color);
        dxLayout.draw(drawCtx, bodyX + bodyLayout.width, baselineY, color);
      },
    };
  }

  return { width: 0, height: 0, ascent: 0, descent: 0, draw: () => {} };
}

/**
 * Layout a sequence of items horizontally
 */
export function layoutMathSequence(ctx, items = [], fontSize = 22) {
  if (!items || items.length === 0) {
    return { width: 0, height: 0, ascent: 0, descent: 0, draw: () => {} };
  }

  const nodes = items.map((it) => layoutMathNode(ctx, it, fontSize));
  let width = 0;
  let maxAscent = fontSize * 0.8;
  let maxDescent = fontSize * 0.2;

  for (const node of nodes) {
    width += node.width;
    if (node.ascent > maxAscent) maxAscent = node.ascent;
    if (node.descent > maxDescent) maxDescent = node.descent;
  }

  const height = maxAscent + maxDescent;

  return {
    width,
    height,
    ascent: maxAscent,
    descent: maxDescent,
    draw: (drawCtx, startX, baselineY, color = '#0f172a') => {
      let curX = startX;
      for (const node of nodes) {
        node.draw(drawCtx, curX, baselineY, color);
        curX += node.width;
      }
    },
  };
}

/**
 * Render the complete calculation (Expression = Result) into a PNG data URL.
 * Produces crisp high-DPI (scale 3x) images suitable for digital notebook pages.
 */
export function renderMathCard({
  items = [],
  resultText = null,
  numericResult = null,
  fractionResult = null,
  isFractionMode = false,
  theme = 'card', // 'card' | 'transparent'
  scale = 3,
  fontSize = 24,
}) {
  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Build formula layout
  const hasItems = Array.isArray(items) && items.length > 0;
  const exprLayout = hasItems ? layoutMathSequence(ctx, items, fontSize) : null;

  // Build result layout
  let resLayout = null;
  if (resultText !== null || numericResult !== null || fractionResult !== null) {
    if (isFractionMode && fractionResult && fractionResult.d !== 1) {
      const isNeg = fractionResult.n < 0;
      const fracItems = [
        ...(isNeg ? ['-'] : []),
        {
          type: 'frac',
          num: [String(Math.abs(fractionResult.n))],
          den: [String(fractionResult.d)],
        },
      ];
      resLayout = layoutMathSequence(ctx, fracItems, fontSize);
    } else {
      const valStr = resultText || String(numericResult ?? '');
      resLayout = layoutMathNode(ctx, valStr, fontSize);
    }
  }

  // Equals sign layout
  const eqLayout = exprLayout && resLayout ? layoutMathNode(ctx, ' = ', fontSize) : null;

  // Compute content dimensions
  let contentWidth = 0;
  let maxAscent = fontSize * 0.8;
  let maxDescent = fontSize * 0.2;

  if (exprLayout) {
    contentWidth += exprLayout.width;
    if (exprLayout.ascent > maxAscent) maxAscent = exprLayout.ascent;
    if (exprLayout.descent > maxDescent) maxDescent = exprLayout.descent;
  }

  if (eqLayout) {
    contentWidth += eqLayout.width;
    if (eqLayout.ascent > maxAscent) maxAscent = eqLayout.ascent;
    if (eqLayout.descent > maxDescent) maxDescent = eqLayout.descent;
  }

  if (resLayout) {
    contentWidth += resLayout.width;
    if (resLayout.ascent > maxAscent) maxAscent = resLayout.ascent;
    if (resLayout.descent > maxDescent) maxDescent = resLayout.descent;
  }

  if (contentWidth === 0) return null;

  // Padding
  const padX = theme === 'card' ? 18 : 8;
  const padY = theme === 'card' ? 14 : 6;
  const cardWidth = Math.round(contentWidth + padX * 2);
  const cardHeight = Math.round(maxAscent + maxDescent + padY * 2);

  // Set high-DPI canvas dimensions
  canvas.width = Math.round(cardWidth * scale);
  canvas.height = Math.round(cardHeight * scale);
  ctx.scale(scale, scale);

  // Background
  if (theme === 'card') {
    const r = 10;
    ctx.save();
    // Soft card shadow
    ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;

    // White rounded rectangle
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.roundRect(1.5, 1.5, cardWidth - 3, cardHeight - 3, r);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();
    ctx.restore();
  }

  // Draw equation
  const baselineY = padY + maxAscent;
  let curX = padX;
  const textColor = '#0f172a';

  if (exprLayout) {
    exprLayout.draw(ctx, curX, baselineY, textColor);
    curX += exprLayout.width;
  }

  if (eqLayout) {
    eqLayout.draw(ctx, curX, baselineY, '#475569');
    curX += eqLayout.width;
  }

  if (resLayout) {
    resLayout.draw(ctx, curX, baselineY, '#0f172a');
  }

  let dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  try {
    if (typeof canvas.toDataURL === 'function') {
      dataUrl = canvas.toDataURL('image/png');
    }
  } catch {
    // fallback in non-browser environments
  }

  return {
    dataUrl,
    width: cardWidth,
    height: cardHeight,
  };
}

/**
 * Convert math tree to clean plain text (e.g. for text/plain clipboard fallback).
 */
export function formatMathToText({
  items = [],
  resultText = null,
  numericResult = null,
  fractionResult = null,
  isFractionMode = false,
}) {
  const treeToText = (subItems) => {
    let parts = [];
    for (const it of subItems) {
      if (typeof it === 'string') {
        const isOp = ['+', '-', '×', '÷', '='].includes(it);
        parts.push(isOp ? ` ${it} ` : it);
      } else if (it && typeof it === 'object') {
        if (it.type === 'frac') {
          parts.push(`(${treeToText(it.num)}/${treeToText(it.den)})`);
        } else if (it.type === 'sqrt') {
          parts.push(`√(${treeToText(it.content)})`);
        } else if (it.type === 'pow') {
          parts.push(`(${treeToText(it.base)})^(${treeToText(it.exp)})`);
        } else if (it.type === 'integral') {
          parts.push(`∫_${treeToText(it.lower)}^${treeToText(it.upper)} (${treeToText(it.integrand)}) dx`);
        }
      }
    }
    return parts.join('').replace(/\s+/g, ' ').trim();
  };

  const exprText = treeToText(items);

  let resText = '';
  if (isFractionMode && fractionResult && fractionResult.d !== 1) {
    resText = `${fractionResult.n}/${fractionResult.d}`;
  } else if (resultText !== null) {
    resText = resultText;
  } else if (numericResult !== null) {
    resText = String(numericResult);
  }

  if (exprText && resText) {
    return `${exprText} = ${resText}`;
  }
  return exprText || resText || '';
}
