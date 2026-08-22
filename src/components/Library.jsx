import React, { useState, useRef } from 'react';
import { 
  LayoutGrid, Rows3, ArrowUpDown, Search, PenLine, 
  Clock, Star, Tag, Sparkles, Globe, ScanText, Check, 
  ArrowUp, Settings, Download, ZoomIn, Code2, Quote, FileText
} from 'lucide-react';

const SUBJECTS = [
  { id: 'mathe', name: 'Mathe', count: 24 },
  { id: 'chemie', name: 'Chemie', count: 17 },
  { id: 'kunst', name: 'Kunst', count: 31 },
  { id: 'pgw', name: 'PGW', count: 12 },
  { id: 'philosophie', name: 'Philosophie', count: 9 },
  { id: 'englisch', name: 'Englisch', count: 21 },
  { id: 'spanisch', name: 'Spanisch', count: 14 },
];

const RECENT = [
  { 
    id: 1, 
    type: 'code',
    title: 'CopilotForXcode',
    repo: 'github / CopilotForXcode',
    subject: 'Informatik', 
    dot: '#4FA66B', 
    when: 'vor 5 Min',
    body: 'AI coding assistant for Xcode', 
    lang: 'Swift',
    stars: '5,512'
  },
  { 
    id: 2, 
    type: 'banner',
    title: 'The Renaissance Edition', 
    subject: 'Kunst', 
    dot: 'oklch(0.6 0.07 320)', 
    when: '11:42',
    tag: 'Shopify Editions | Winter \'26' 
  },
  { 
    id: 3, 
    type: 'quote',
    title: 'CLOSED Bar Branding',
    subject: 'Design',
    dot: 'oklch(0.7 0.035 78)',
    when: '14:20',
    platform: 'X',
    body: 'In crafting a rich, evocative identity for CLOSED bar, how by why serves a lesson in worldbuilding →'
  },
  { 
    id: 4, 
    type: 'inspect',
    title: 'Titrationskurve & Tafelbild', 
    subject: 'Chemie', 
    dot: 'oklch(0.64 0.06 158)', 
    when: 'Mo', 
    body: 'Äquivalenzpunkt bei pH 7.0 (starke Säure / starke Base). Wendepunktanalyse.'
  },
  { 
    id: 5, 
    type: 'editorial',
    title: 'Designing with Clarity', 
    subject: 'Design', 
    dot: '#0a84ff', 
    when: 'heute',
    subtitle: 'Structuring Ideas Before Execution',
    body: 'Designing with clarity means making intentional choices that help users understand what to do and where to go. Every visual decision should reduce friction and guide attention, creating an experience that feels effortless rather than overwhelming.',
    body2: 'Before jumping into visuals, it\'s important to organize ideas and define structure. A well-thought-out foundation makes the design process smoother and helps prevent unnecessary rework later on.',
    tag: 'Small Details, Big Impact',
    source: 'New York Times – Designing with Clarity'
  },
  { 
    id: 6, 
    type: 'math',
    title: 'Ableitungsregeln', 
    subject: 'Mathe', 
    dot: 'oklch(0.62 0.075 255)', 
    when: 'gestern',
    body: 'Produktregel: (u·v)\' = u\'v + uv\' — Kettenregel: äußere × innere Ableitung', 
    tag: 'Klausur 14.09.' 
  },
  { 
    id: 7, 
    type: 'gallery',
    title: 'Fotostudie & Perspektive',
    subject: 'Kunst',
    dot: 'oklch(0.6 0.07 320)',
    when: 'Mo',
    tag: '4 Fotos'
  },
  { 
    id: 8, 
    type: 'agent',
    title: 'Ursachen der Französischen Revolution', 
    subject: 'PGW', 
    dot: 'oklch(0.58 0.075 320)', 
    when: '14:02',
    agent: true, 
    sources: 6,
    body: 'Ständegesellschaft, Staatsbankrott 1788, Aufklärung als Legitimationsbruch — mit Zeitleiste und Quellenliste.' 
  },
  { 
    id: 9, 
    type: 'figma',
    title: 'Figma Draw & Vektoren', 
    subject: 'Kunst', 
    dot: '#D8615B', 
    when: 'Di',
    tag: 'Figma Draw'
  },
  { 
    id: 10, 
    type: 'vehicle',
    title: '2025 LAND CRUISER', 
    subject: 'PGW', 
    dot: '#E27D48', 
    when: 'vor 2 Tagen',
    tag: 'Toyota Land Cruiser 250 - Overview'
  },
  { 
    id: 11, 
    type: 'serif',
    title: 'Höhlengleichnis', 
    subject: 'Philosophie', 
    dot: 'oklch(0.7 0.035 78)', 
    when: 'Mi', 
    body: 'Schatten = Sinneswahrnehmung, Feuer = Sonne des Guten. Aufstieg = Erkenntnisstufen.', 
    question: 'Frage: Ist Bildung Zwang?' 
  },
  { 
    id: 12, 
    type: 'math',
    title: 'Redoxreaktionen', 
    subject: 'Chemie', 
    dot: 'oklch(0.64 0.06 158)', 
    when: 'heute',
    body: 'Oxidation = Elektronenabgabe, Reduktion = Aufnahme. Merksatz: OMA / RIG.' 
  }
];

function TileWrap({ onOpen, w, h, bg, boxShadow, children }) {
  return (
    <div
      onClick={onOpen}
      className="lib-tile"
      style={{ position: 'relative', flex: 'none', width: w, height: h, borderRadius: 24, overflow: 'hidden', background: bg, boxShadow, cursor: 'pointer' }}
    >
      {children}
    </div>
  );
}

function SubjectTile({ s, onOpen }) {
  const shadow = '0 20px 42px -22px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.07) inset';

  if (s.id === 'mathe') {
    return (
      <TileWrap onOpen={onOpen} w={220} h={148} bg="linear-gradient(155deg,oklch(0.31 0.045 258),oklch(0.21 0.03 262))" boxShadow={shadow}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(233,230,223,.075) 1px,transparent 1px),linear-gradient(90deg,rgba(233,230,223,.075) 1px,transparent 1px)', backgroundSize: '18px 18px' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 34, height: 58, background: 'linear-gradient(72deg,transparent 12%,oklch(0.72 0.075 250/.75) 12%,oklch(0.72 0.075 250/.75) 13.4%,transparent 13.4%)', transform: 'skewY(-16deg)' }} />
        <div style={{ position: 'absolute', right: 18, top: 14, font: 'italic 20px "Instrument Serif",serif', color: 'rgba(233,230,223,.42)' }}>f(x)</div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 44, height: 1, background: 'rgba(233,230,223,.28)' }} />
        <div style={{ position: 'absolute', left: 20, bottom: 22, width: 1, height: 16, background: 'rgba(233,230,223,.28)' }} />
        <div style={{ position: 'absolute', right: 18, bottom: 24, font: '500 9.5px ui-monospace,monospace', letterSpacing: '.1em', color: 'rgba(233,230,223,.42)' }}>{s.count} NOTIZEN</div>
        <div style={{ position: 'absolute', left: 18, bottom: 44, font: '800 40px/.9 "Bricolage Grotesque",sans-serif', letterSpacing: '-.04em', color: '#F1EEE7' }}>Mathe</div>
      </TileWrap>
    );
  }

  if (s.id === 'chemie') {
    return (
      <TileWrap onOpen={onOpen} w={150} h={164} bg="linear-gradient(155deg,oklch(0.32 0.04 160),oklch(0.21 0.028 165))" boxShadow={shadow}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(233,230,223,.1) 1.3px,transparent 1.4px)', backgroundSize: '15px 15px' }} />
        <div style={{ position: 'absolute', right: -16, top: 22, width: 76, height: 76, borderRadius: '50%', border: '2px solid oklch(0.72 0.06 158/.6)' }} />
        <div style={{ position: 'absolute', right: 8, top: 74, width: 44, height: 44, borderRadius: '50%', border: '1.5px solid oklch(0.72 0.06 158/.34)' }} />
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 34, background: 'rgba(0,0,0,.24)', borderRight: '1px solid rgba(233,230,223,.1)' }} />
        <div style={{ position: 'absolute', left: 0, top: 14, width: 34, display: 'flex', justifyContent: 'center' }}>
          <span style={{ writingMode: 'vertical-rl', font: '700 13px "Bricolage Grotesque",sans-serif', letterSpacing: '.22em', color: '#F1EEE7' }}>CHEMIE</span>
        </div>
        <div style={{ position: 'absolute', left: 0, bottom: 14, width: 34, display: 'flex', justifyContent: 'center' }}>
          <span style={{ writingMode: 'vertical-rl', font: '500 9px ui-monospace,monospace', letterSpacing: '.14em', color: 'rgba(233,230,223,.45)' }}>{s.count}</span>
        </div>
      </TileWrap>
    );
  }

  if (s.id === 'kunst') {
    return (
      <TileWrap onOpen={onOpen} w={140} h={148} bg="#1B1A1E" boxShadow={shadow}>
        <div style={{ position: 'absolute', left: -14, top: -10, width: 160, height: 30, background: 'oklch(0.6 0.09 42)', transform: 'rotate(-11deg)' }} />
        <div style={{ position: 'absolute', left: -14, top: 20, width: 160, height: 24, background: 'oklch(0.68 0.075 82)' }} />
        <div style={{ position: 'absolute', left: -14, top: 44, width: 160, height: 26, background: 'oklch(0.5 0.06 215)', transform: 'rotate(-11deg)' }} />
        <div style={{ position: 'absolute', left: -14, top: 70, width: 160, height: 20, background: 'oklch(0.36 0.05 315)', transform: 'rotate(-11deg)' }} />
        <div style={{ position: 'absolute', left: -10, right: -10, bottom: 26, height: 30, background: '#EEEAE1', transform: 'rotate(-7deg)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ font: '700 15px "Bricolage Grotesque",sans-serif', letterSpacing: '-.01em', color: '#17161A' }}>Kunst</span>
          <span style={{ font: '500 8.5px ui-monospace,monospace', color: 'rgba(233,230,223,.5)' }}>{s.count}</span>
        </div>
      </TileWrap>
    );
  }

  if (s.id === 'pgw') {
    return (
      <TileWrap onOpen={onOpen} w={150} h={132} bg="linear-gradient(155deg,oklch(0.29 0.045 320),oklch(0.2 0.03 318))" boxShadow={shadow}>
        <div style={{ position: 'absolute', left: 16, bottom: 38, display: 'flex', alignItems: 'flex-end', gap: 6, height: 58 }}>
          <div style={{ width: 11, height: 22, background: 'oklch(0.6 0.07 320/.45)' }} />
          <div style={{ width: 11, height: 40, background: 'oklch(0.6 0.07 320/.6)' }} />
          <div style={{ width: 11, height: 30, background: 'oklch(0.6 0.07 320/.4)' }} />
          <div style={{ width: 11, height: 56, background: '#EEEAE1' }} />
          <div style={{ width: 11, height: 18, background: 'oklch(0.6 0.07 320/.3)' }} />
        </div>
        <div style={{ position: 'absolute', left: 75, bottom: 100, font: '500 9px ui-monospace,monospace', color: 'rgba(233,230,223,.55)' }}>{s.count}</div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 36, height: 1, background: 'rgba(233,230,223,.3)' }} />
        <div style={{ position: 'absolute', left: 16, bottom: 11, font: '800 22px/1 "Bricolage Grotesque",sans-serif', letterSpacing: '.1em', color: '#F1EEE7' }}>PGW</div>
      </TileWrap>
    );
  }

  if (s.id === 'philosophie') {
    return (
      <TileWrap onOpen={onOpen} w={190} h={156} bg="linear-gradient(155deg,oklch(0.35 0.028 78),oklch(0.23 0.02 72))" boxShadow={shadow}>
        <div style={{ position: 'absolute', right: -8, top: -14, font: 'italic 110px/1 "Instrument Serif",serif', color: 'rgba(233,230,223,.06)' }}>Φ</div>
        <div style={{ position: 'absolute', left: 18, top: 18, right: 16, font: 'italic 31px/1.02 "Instrument Serif",serif', color: '#F2EFE8' }}>Philo­sophie</div>
        <div style={{ position: 'absolute', left: 18, top: 96, width: 40, height: 1, background: 'rgba(233,230,223,.3)' }} />
        <div style={{ position: 'absolute', left: 18, top: 108, right: 16, font: '400 11px/1.45 Manrope,sans-serif', color: 'rgba(233,230,223,.5)' }}>Sartre, Platon, Kant · {s.count} Notizen</div>
      </TileWrap>
    );
  }

  if (s.id === 'englisch') {
    return (
      <TileWrap onOpen={onOpen} w={136} h={144} bg="linear-gradient(155deg,oklch(0.3 0.05 26),oklch(0.2 0.035 22))" boxShadow={shadow}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(to bottom,transparent calc(100% - 1px),rgba(233,230,223,.1) calc(100% - 1px))', backgroundSize: '100% 24px' }} />
        <div style={{ position: 'absolute', left: 22, top: 0, bottom: 0, width: 1, background: 'oklch(0.68 0.09 26/.4)' }} />
        <div style={{ position: 'absolute', right: 10, top: 4, font: '400 54px/1 "Instrument Serif",serif', color: 'rgba(233,230,223,.1)' }}>Aa</div>
        <div style={{ position: 'absolute', left: 28, top: 56, font: '600 34px/1 Caveat,cursive', color: '#F1EEE7' }}>Englisch</div>
        <div style={{ position: 'absolute', left: 6, top: 60, font: '500 8.5px ui-monospace,monospace', color: 'rgba(233,230,223,.4)' }}>{s.count}</div>
      </TileWrap>
    );
  }

  // spanisch
  return (
    <TileWrap onOpen={onOpen} w={150} h={132} bg="oklch(0.3 0.05 56)" boxShadow={shadow}>
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(118deg,transparent 0 12px,oklch(0.58 0.08 52/.5) 12px 22px)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 24, height: 34, background: '#EEEAE1', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 7 }}>
        <span style={{ font: '700 15px "Bricolage Grotesque",sans-serif', color: '#17161A' }}>Spanisch</span>
        <span style={{ marginLeft: 'auto', font: '500 8.5px ui-monospace,monospace', color: 'rgba(23,22,26,.5)' }}>{s.count}</span>
      </div>
    </TileWrap>
  );
}

function RecentCard({ n, onOpen }) {
  return (
    <div onClick={onOpen} className="lib-card" style={{
      borderRadius: 20, overflow: 'hidden', cursor: 'pointer',
      background: n.agent ? 'linear-gradient(165deg,oklch(0.28 0.055 318),#1D1B21 58%)' : '#1D1B21',
      boxShadow: n.agent
        ? '0 22px 46px -24px rgba(0,0,0,.9),0 0 0 1px oklch(0.6 0.07 320/.22)'
        : '0 22px 46px -24px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.06)'
    }}>
      {/* 1. Code Card */}
      {n.type === 'code' && (
        <div style={{ padding: '14px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <Code2 size={13} color="#4FA66B" />
            <span style={{ font: '700 11px ui-monospace,monospace', color: '#E9E6DF' }}>{n.repo}</span>
          </div>
          <div style={{ font: '400 12px/1.4 Manrope,sans-serif', color: 'rgba(233,230,223,.6)', marginBottom: 10 }}>{n.body}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: '600 10px ui-monospace,monospace' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#4FA66B' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4FA66B' }} /> {n.lang}
            </span>
            <span style={{ color: 'rgba(233,230,223,.4)' }}>★ {n.stars}</span>
          </div>
        </div>
      )}

      {/* 2. Banner Art Exhibition Card */}
      {n.type === 'banner' && (
        <div>
          <div style={{ height: 130, background: 'linear-gradient(135deg,#5e2a2b 0%,#2c1e28 50%,#182830 100%)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 75% 30%, rgba(255,200,120,.35), transparent 50%)' }} />
            <div style={{ position: 'absolute', left: 16, bottom: 14, right: 16 }}>
              <span style={{ font: '400 italic 20px/1 "Instrument Serif",serif', color: '#FFF' }}>The Renaissance</span>
              <div style={{ font: '700 10px ui-monospace,monospace', letterSpacing: '.12em', color: 'rgba(255,255,255,.7)' }}>EDITION</div>
            </div>
          </div>
          <div style={{ padding: '9px 14px', background: 'rgba(0,0,0,.25)', font: '600 10px ui-monospace,monospace', color: 'rgba(233,230,223,.6)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🛍️</span> {n.tag}
          </div>
        </div>
      )}

      {/* 3. Quote Card */}
      {n.type === 'quote' && (
        <div style={{ padding: '16px 18px 14px', background: 'linear-gradient(145deg,#24222a,#1c1a22)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Quote size={12} color="#D4A937" />
            <span style={{ font: '700 11px ui-monospace,monospace', color: '#D4A937' }}>{n.platform}</span>
          </div>
          <div style={{ font: '400 13px/1.55 Manrope,sans-serif', color: '#E9E6DF' }}>{n.body}</div>
        </div>
      )}

      {/* 4. Inspect Image Photo Card with Center Action Buttons */}
      {n.type === 'inspect' && (
        <div>
          <div style={{ height: 136, background: 'repeating-linear-gradient(45deg,#2c2933 0 10px,#222028 10px 20px)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="lib-inspect-action-btn" title="Download"><Download size={14} /></div>
              <div className="lib-inspect-action-btn" title="Zoom & Vorschau"><ZoomIn size={14} /></div>
            </div>
            <span style={{ position: 'absolute', left: 12, bottom: 10, font: '600 9.5px ui-monospace,monospace', color: 'rgba(233,230,223,.4)' }}>Tafelbild · 2400×1600</span>
          </div>
          <div style={{ padding: '12px 16px 10px' }}>
            <div style={{ font: '700 14px "Bricolage Grotesque",sans-serif', color: '#F1EEE7' }}>{n.title}</div>
            <div style={{ marginTop: 4, font: '400 11px/1.4 Manrope,sans-serif', color: 'rgba(233,230,223,.5)' }}>{n.body}</div>
          </div>
        </div>
      )}

      {/* 5. Editorial Typography Card */}
      {n.type === 'editorial' && (
        <div style={{ padding: '16px 18px 15px', background: '#201E26' }}>
          <div style={{ font: '800 18px/1.15 "Bricolage Grotesque",sans-serif', letterSpacing: '-.02em', color: '#F2EFE8', marginBottom: 8 }}>{n.title}</div>
          <div style={{ font: '400 11.5px/1.55 Manrope,sans-serif', color: 'rgba(233,230,223,.68)', marginBottom: 10 }}>{n.body}</div>
          <div style={{ font: '700 12px "Bricolage Grotesque",sans-serif', color: '#F2EFE8', marginBottom: 4 }}>{n.subtitle}</div>
          <div style={{ font: '400 11.5px/1.55 Manrope,sans-serif', color: 'rgba(233,230,223,.55)', marginBottom: 10 }}>{n.body2}</div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 8, font: '500 9.5px ui-monospace,monospace', color: 'rgba(233,230,223,.4)' }}>📰 {n.source}</div>
        </div>
      )}

      {/* 6. Gallery 4-Grid Photo Card */}
      {n.type === 'gallery' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, height: 110, background: '#17161A', padding: 2 }}>
            <div style={{ background: '#35323e' }} />
            <div style={{ background: '#2a2833' }} />
            <div style={{ background: '#22202a' }} />
            <div style={{ background: '#3c3947' }} />
          </div>
          <div style={{ padding: '11px 16px', font: '600 14px "Bricolage Grotesque",sans-serif', color: '#EFECE4' }}>{n.title}</div>
        </div>
      )}

      {/* 7. Figma Card */}
      {n.type === 'figma' && (
        <div style={{ padding: '16px 18px 14px', background: 'linear-gradient(160deg,#241e24,#1c1a22)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ font: '800 20px/1 "Bricolage Grotesque",sans-serif', color: '#FFF' }}>Figma</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F24E1E' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#A259FF' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#1ABCFE' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#0ACF83' }} />
            </div>
          </div>
          <div style={{ height: 44, borderRadius: 10, background: 'rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.4)', font: 'italic 12px sans-serif' }}>
            Vector Canvas · Presets
          </div>
        </div>
      )}

      {/* 8. Vehicle Overview Card */}
      {n.type === 'vehicle' && (
        <div>
          <div style={{ height: 110, background: 'linear-gradient(135deg,#363d35,#1d221c)', position: 'relative', display: 'flex', alignItems: 'flex-end', padding: 14 }}>
            <span style={{ font: '800 16px/1 "Bricolage Grotesque",sans-serif', color: '#FFF', letterSpacing: '.05em' }}>{n.title}</span>
          </div>
          <div style={{ padding: '9px 14px', background: 'rgba(0,0,0,.25)', font: '600 10px ui-monospace,monospace', color: 'rgba(233,230,223,.6)' }}>
            🚗 {n.tag}
          </div>
        </div>
      )}

      {/* 9. Agent Card */}
      {n.type === 'agent' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 15px 0' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 999, background: 'oklch(0.6 0.07 320/.2)', font: '600 9.5px ui-monospace,monospace', letterSpacing: '.05em', color: 'oklch(0.82 0.055 320)' }}>
              <Sparkles size={11} />AGENT
            </span>
            <span style={{ font: '500 10px ui-monospace,monospace', color: 'rgba(233,230,223,.38)' }}>{n.sources} Quellen</span>
          </div>
          <div style={{ padding: '9px 16px 15px' }}>
            <div style={{ font: '700 17px/1.22 "Bricolage Grotesque",sans-serif', letterSpacing: '-.025em', color: '#F1EEE7' }}>{n.title}</div>
            <div style={{ marginTop: 8, font: '400 11.5px/1.6 Manrope,sans-serif', color: 'rgba(233,230,223,.56)' }}>{n.body}</div>
          </div>
        </div>
      )}

      {/* 10. Math Handwriting Card */}
      {n.type === 'math' && (
        <div style={{ padding: '15px 17px', backgroundImage: 'linear-gradient(to bottom,transparent calc(100% - 1px),rgba(255,255,255,.055) calc(100% - 1px))', backgroundSize: '100% 22px' }}>
          <div style={{ font: '600 20px/1.15 Caveat,cursive', color: '#EFECE4', borderBottom: `1.5px solid ${n.dot}b0`, display: 'inline-block' }}>{n.title}</div>
          <div style={{ marginTop: 9, font: '400 16px/22px Caveat,cursive', color: 'rgba(239,236,228,.78)' }}>{n.body}</div>
          {n.tag && <div style={{ marginTop: 4, display: 'inline-block', padding: '1px 5px', background: 'oklch(0.7 0.09 92/.2)', font: '400 16px/22px Caveat,cursive', color: 'oklch(0.84 0.075 92)' }}>{n.tag}</div>}
        </div>
      )}

      {/* 11. Serif Dialogue Card */}
      {n.type === 'serif' && (
        <div style={{ padding: '18px 20px 16px' }}>
          <div style={{ font: '400 italic 26px/1.15 "Instrument Serif",serif', color: '#F2EFE8' }}>{n.title}</div>
          <div style={{ marginTop: 11, font: '400 16px/22px Caveat,cursive', color: 'rgba(239,236,228,.76)' }}>{n.body}</div>
          <div style={{ marginTop: 13, height: 1, background: 'rgba(255,255,255,.09)' }} />
          <div style={{ marginTop: 9, font: '400 16px/22px Caveat,cursive', color: 'oklch(0.78 0.065 78)' }}>{n.question}</div>
        </div>
      )}

      {/* Card Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 15px', borderTop: '1px solid rgba(255,255,255,.055)' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: n.dot }} />
        <span style={{ font: '600 12px Manrope,sans-serif', color: '#EFECE4' }}>{n.subject}</span>
        <span style={{ marginLeft: 'auto', font: '500 10px ui-monospace,monospace', color: 'rgba(233,230,223,.34)' }}>{n.when}</span>
      </div>
    </div>
  );
}

function RecentListRow({ n, onOpen }) {
  return (
    <div onClick={onOpen} className="lib-list-row" data-testid={`list-row-${n.id}`}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: n.dot, flexShrink: 0 }} />
      <div className="lib-list-title">{n.title}</div>
      <div className="lib-list-body">{n.body || n.tag || n.repo || n.source || ''}</div>
      <span className="lib-list-subject">{n.subject}</span>
      <span style={{ font: '500 10px ui-monospace,monospace', color: 'rgba(233,230,223,.38)', flexShrink: 0 }}>{n.when}</span>
    </div>
  );
}

export default function Library({ onOpenNote, onOpenSettings }) {
  const [viewMode, setViewMode] = useState('masonry'); // 'masonry' | 'list'
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'title' | 'subject'
  const [sortToast, setSortToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  const showToast = (msg) => {
    setSortToast(msg);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setSortToast(null), 1600);
  };

  const cycleSort = () => {
    if (sortBy === 'recent') {
      setSortBy('title');
      showToast('Sortierung: Titel (A–Z)');
    } else if (sortBy === 'title') {
      setSortBy('subject');
      showToast('Sortierung: Nach Fach');
    } else {
      setSortBy('recent');
      showToast('Sortierung: Zuletzt bearbeitet');
    }
  };

  const sortedRecent = [...RECENT].sort((a, b) => {
    if (sortBy === 'title') return a.title.localeCompare(b.title);
    if (sortBy === 'subject') return a.subject.localeCompare(b.subject);
    return a.id - b.id;
  });

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#17161A', fontFamily: 'Manrope,sans-serif', color: '#E9E6DF' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(720px 420px at 10% -6%,oklch(0.42 0.055 260/.85),transparent 66%),radial-gradient(620px 460px at 94% 6%,oklch(0.42 0.045 200/.7),transparent 64%),radial-gradient(780px 520px at 58% 108%,oklch(0.42 0.05 55/.6),transparent 66%),#17161A' }} />

      {/* sidebar rail */}
      <div className="lib-glass" style={{ position: 'absolute', left: 20, top: 20, bottom: 20, width: 72, borderRadius: 30, background: 'linear-gradient(160deg,rgba(255,255,255,.13),rgba(255,255,255,.04))', backdropFilter: 'blur(30px) saturate(1.35)', border: '1px solid rgba(255,255,255,.13)', boxShadow: '0 1px 0 rgba(255,255,255,.22) inset,0 28px 60px -26px rgba(0,0,0,.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 6 }}>
        <div style={{ width: 34, height: 34, borderRadius: 12, background: '#E9E6DF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#17161A', font: '800 15px "Bricolage Grotesque",sans-serif', marginBottom: 10 }}>N</div>
        <div style={{ width: 44, height: 44, borderRadius: 15, background: 'rgba(255,255,255,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F1EEE7' }}><LayoutGrid size={19} /></div>
        <div style={{ width: 44, height: 44, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(233,230,223,.42)' }}><Clock size={19} /></div>
        <div style={{ width: 44, height: 44, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(233,230,223,.42)' }}><Star size={19} /></div>
        <div style={{ width: 44, height: 44, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(233,230,223,.42)' }}><Tag size={19} /></div>
        <button 
          onClick={onOpenSettings} 
          style={{ marginTop: 'auto', width: 44, height: 44, borderRadius: 15, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(233,230,223,.42)', cursor: 'pointer', transition: 'all 0.15s' }}
          className="lib-settings-btn"
          title="Einstellungen"
          data-testid="settings-nav-btn"
        >
          <Settings size={20} />
        </button>
      </div>

      {/* search pill */}
      <div className="lib-glass" style={{ position: 'absolute', left: 108, top: 24, width: 404, height: 50, borderRadius: 25, background: 'linear-gradient(160deg,rgba(255,255,255,.12),rgba(255,255,255,.035))', backdropFilter: 'blur(28px) saturate(1.35)', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 1px 0 rgba(255,255,255,.2) inset,0 20px 40px -22px rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px' }}>
        <Search size={17} color="rgba(233,230,223,.45)" />
        <span style={{ font: '400 13.5px Manrope,sans-serif', color: 'rgba(233,230,223,.4)' }}>Notizen, Fächer, Handschrift durchsuchen</span>
        <span style={{ marginLeft: 'auto', font: '500 10px ui-monospace,monospace', padding: '3px 6px', borderRadius: 6, background: 'rgba(255,255,255,.09)', color: 'rgba(233,230,223,.42)' }}>⌘K</span>
      </div>

      {/* view toggle + new note (right aligned) */}
      <div style={{ position: 'absolute', right: 300, top: 24, display: 'flex', alignItems: 'center', gap: 12, zIndex: 10 }}>
        <div className="lib-glass" style={{ height: 50, borderRadius: 25, background: 'linear-gradient(160deg,rgba(255,255,255,.12),rgba(255,255,255,.035))', backdropFilter: 'blur(28px) saturate(1.35)', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 1px 0 rgba(255,255,255,.2) inset,0 20px 40px -22px rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', padding: '0 6px', gap: 2 }}>
          <button 
            className={`lib-view-btn ${viewMode === 'masonry' ? 'active' : ''}`} 
            style={{ width: 38, height: 38, borderRadius: 19, background: viewMode === 'masonry' ? 'rgba(255,255,255,.16)' : 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: viewMode === 'masonry' ? '#F1EEE7' : 'rgba(233,230,223,.42)', cursor: 'pointer', transition: 'all 0.15s' }} 
            onClick={() => setViewMode('masonry')}
            title="Masonry-Rasteransicht"
            data-testid="view-masonry-btn"
          >
            <LayoutGrid size={17} />
          </button>
          <button 
            className={`lib-view-btn ${viewMode === 'list' ? 'active' : ''}`} 
            style={{ width: 38, height: 38, borderRadius: 19, background: viewMode === 'list' ? 'rgba(255,255,255,.16)' : 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: viewMode === 'list' ? '#F1EEE7' : 'rgba(233,230,223,.42)', cursor: 'pointer', transition: 'all 0.15s' }} 
            onClick={() => setViewMode('list')}
            title="Listenansicht"
            data-testid="view-list-btn"
          >
            <Rows3 size={17} />
          </button>
          <button 
            className="lib-view-btn" 
            style={{ width: 38, height: 38, borderRadius: 19, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(233,230,223,.42)', cursor: 'pointer', transition: 'all 0.15s' }} 
            onClick={cycleSort}
            title="Sortieren"
            data-testid="view-sort-btn"
          >
            <ArrowUpDown size={17} />
          </button>
        </div>
        <div onClick={() => onOpenNote?.({ title: 'Neue Notiz', subject: '' })} className="lib-newnote" style={{ height: 50, borderRadius: 25, padding: '0 20px 0 16px', display: 'flex', alignItems: 'center', gap: 9, background: '#E9E6DF', boxShadow: '0 20px 40px -20px rgba(0,0,0,.9)', color: '#17161A', cursor: 'pointer' }}>
          <PenLine size={17} />
          <span style={{ font: '700 13px "Bricolage Grotesque",sans-serif', whiteSpace: 'nowrap' }}>Neue Notiz</span>
        </div>
      </div>

      {/* Sort Toast */}
      {sortToast && (
        <div style={{ position: 'fixed', top: 84, right: 300, background: 'rgba(26,24,30,0.92)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 14, padding: '8px 16px', color: '#F1EEE7', font: '600 12px Manrope,sans-serif', display: 'flex', alignItems: 'center', gap: 8, zIndex: 1000, boxShadow: '0 12px 28px rgba(0,0,0,0.6)' }} data-testid="sort-toast">
          <ArrowUpDown size={14} color="#0a84ff" />
          <span>{sortToast}</span>
        </div>
      )}

      {/* main content */}
      <div className="lib-scroll" style={{ position: 'absolute', left: 100, top: 92, right: 300, bottom: 26, overflow: 'auto', paddingRight: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 15, margin: '0 0 18px' }}>
          <h2 style={{ margin: 0, font: '800 46px/.92 "Bricolage Grotesque",sans-serif', letterSpacing: '-.035em' }}>Bibliothek</h2>
          <span style={{ font: '500 10.5px ui-monospace,monospace', letterSpacing: '.11em', color: 'rgba(233,230,223,.4)', paddingBottom: 8 }}>{SUBJECTS.length} FÄCHER · {SUBJECTS.reduce((a, s) => a + s.count, 0)} NOTIZEN</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '0 0 28px' }}>
          {SUBJECTS.map(s => <SubjectTile key={s.id} s={s} onOpen={() => onOpenNote?.({ title: `${s.name} — Notiz`, subject: s.name })} />)}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, margin: '0 0 14px' }}>
          <h3 style={{ margin: 0, font: '600 21px/1 "Bricolage Grotesque",sans-serif', letterSpacing: '-.025em' }}>Zuletzt bearbeitet</h3>
          <span style={{ font: '500 9.5px ui-monospace,monospace', letterSpacing: '.11em', color: 'rgba(233,230,223,.3)' }}>
            {viewMode === 'masonry' ? 'MOODBOARD-RASTER' : 'LISTENANSICHT'}
          </span>
        </div>

        {/* Dynamic View: Masonry vs List */}
        {viewMode === 'masonry' ? (
          <div className="lib-masonry-grid" data-testid="masonry-grid">
            {sortedRecent.map(n => <RecentCard key={n.id} n={n} onOpen={() => onOpenNote?.(n)} />)}
          </div>
        ) : (
          <div className="lib-list-view" data-testid="list-view">
            {sortedRecent.map(n => <RecentListRow key={n.id} n={n} onOpen={() => onOpenNote?.(n)} />)}
          </div>
        )}
      </div>

      {/* agent panel */}
      <div className="lib-glass" style={{ position: 'absolute', right: 14, top: 14, bottom: 14, width: 274, borderRadius: 30, background: 'linear-gradient(165deg,rgba(255,255,255,.135),rgba(255,255,255,.045))', backdropFilter: 'blur(34px) saturate(1.4)', border: '1px solid rgba(255,255,255,.14)', boxShadow: '0 1px 0 rgba(255,255,255,.24) inset,0 30px 64px -26px rgba(0,0,0,.9)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 18px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="lib-agent-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.68 0.09 150)' }} />
          <span style={{ font: '700 13.5px "Bricolage Grotesque",sans-serif', letterSpacing: '-.02em' }}>Agent</span>
          <span style={{ marginLeft: 'auto', font: '500 9.5px ui-monospace,monospace', letterSpacing: '.06em', color: 'rgba(233,230,223,.4)' }}>2 AKTIV</span>
        </div>

        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 11, overflow: 'hidden' }}>
          <div style={{ borderRadius: 18, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.07)', padding: '13px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
              <Globe size={12} color="oklch(0.76 0.06 320)" />
              <span style={{ font: '600 9.5px ui-monospace,monospace', letterSpacing: '.05em', color: 'oklch(0.8 0.05 320)' }}>RECHERCHIERT</span>
            </div>
            <div style={{ font: '500 12.5px/1.42 Manrope,sans-serif' }}>Wahlsystem BRD vs. USA — Vergleichstabelle</div>
            <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.11)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '64%', borderRadius: 2, background: 'linear-gradient(90deg,oklch(0.6 0.075 320),oklch(0.72 0.06 340))' }} />
            </div>
            <div style={{ marginTop: 7, display: 'flex', justifyContent: 'space-between', font: '500 9.5px ui-monospace,monospace', color: 'rgba(233,230,223,.4)' }}><span>Quelle 4 von 6</span><span>~2 min</span></div>
          </div>

          <div style={{ borderRadius: 18, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.07)', padding: '13px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
              <ScanText size={12} color="oklch(0.76 0.055 235)" />
              <span style={{ font: '600 9.5px ui-monospace,monospace', letterSpacing: '.05em', color: 'oklch(0.8 0.05 235)' }}>LIEST HANDSCHRIFT</span>
            </div>
            <div style={{ font: '500 12.5px/1.42 Manrope,sans-serif' }}>Mathe-Notizen der Woche → Formelsammlung</div>
            <div style={{ marginTop: 9, display: 'flex', gap: 4 }}>
              {[1, 1, 1, 0, 0].map((on, i) => <span key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: on ? 'oklch(0.68 0.055 235)' : 'rgba(255,255,255,.13)' }} />)}
            </div>
          </div>

          <div style={{ marginTop: 4, font: '500 9.5px ui-monospace,monospace', letterSpacing: '.08em', color: 'rgba(233,230,223,.3)', paddingLeft: 4 }}>FERTIG · HEUTE</div>

          {['Zusammenfassung „Franz. Revolution" → PGW', 'Vokabeltest Unidad 3 erstellt — 24 Karten'].map((t, i) => (
            <div key={i} className="lib-agent-done" style={{ borderRadius: 18, padding: '12px 14px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Check size={13} color="oklch(0.7 0.08 150)" style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ font: '500 12.5px/1.4 Manrope,sans-serif', color: 'rgba(233,230,223,.8)' }}>{t}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', padding: '12px 14px 14px' }}>
          <div style={{ height: 44, borderRadius: 22, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.13)', display: 'flex', alignItems: 'center', gap: 9, padding: '0 7px 0 15px' }}>
            <span style={{ flex: 1, font: '400 12.5px Manrope,sans-serif', color: 'rgba(233,230,223,.42)' }}>Auftrag an den Agenten…</span>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(140deg,oklch(0.6 0.08 320),oklch(0.44 0.09 300))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><ArrowUp size={15} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
