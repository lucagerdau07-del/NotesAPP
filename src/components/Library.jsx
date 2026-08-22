import React, { useState, useRef } from 'react';
import { 
  LayoutGrid, Rows3, ArrowUpDown, Search, PenLine, 
  Clock, Star, Tag, Sparkles, Globe, ScanText, Check, 
  ArrowUp, Settings, Download, ZoomIn, Code2, Quote, 
  X, ArrowLeft, BookOpen, Layers, Sparkle, Plus, Mic, 
  SlidersHorizontal, Sparkles as SparklesIcon
} from 'lucide-react';

const SUBJECTS = [
  { id: 'mathe', name: 'Mathe', count: 24, themeColor: 'oklch(0.62 0.075 255)' },
  { id: 'chemie', name: 'Chemie', count: 17, themeColor: 'oklch(0.64 0.06 158)' },
  { id: 'kunst', name: 'Kunst', count: 31, themeColor: 'oklch(0.6 0.07 320)' },
  { id: 'pgw', name: 'PGW', count: 12, themeColor: 'oklch(0.58 0.075 320)' },
  { id: 'philosophie', name: 'Philosophie', count: 9, themeColor: 'oklch(0.7 0.035 78)' },
  { id: 'englisch', name: 'Englisch', count: 21, themeColor: 'oklch(0.68 0.09 26)' },
  { id: 'spanisch', name: 'Spanisch', count: 14, themeColor: 'oklch(0.65 0.08 52)' },
];

const RECENT = [
  // MATHE
  { 
    id: 1, 
    type: 'math',
    title: 'Ableitungsregeln', 
    subject: 'Mathe', 
    dot: 'oklch(0.62 0.075 255)', 
    when: 'gestern',
    body: 'Produktregel: (u·v)\' = u\'v + uv\' — Kettenregel: äußere × innere Ableitung', 
    tag: 'Klausur 14.09.' 
  },
  {
    id: 2,
    type: 'math',
    title: 'Integralrechnung & Stammfunktionen',
    subject: 'Mathe',
    dot: 'oklch(0.62 0.075 255)',
    when: 'vor 2 Tagen',
    body: 'Hauptsatz: ∫ f(x)dx = F(b) - F(a). Partielle Integration: ∫ u·v\' = u·v - ∫ u\'·v',
    tag: 'Analysis'
  },
  {
    id: 3,
    type: 'math',
    title: 'Vektorgeometrie & Skalarprodukt',
    subject: 'Mathe',
    dot: 'oklch(0.62 0.075 255)',
    when: 'Mo',
    body: 'Orthogonalität: a ⊥ b ⇔ a·b = 0. Ebenengleichung: E: x = p + r·u + s·v',
    tag: 'Lineare Algebra'
  },
  {
    id: 4,
    type: 'math',
    title: 'Kurvendiskussion Extrema & Wendepunkte',
    subject: 'Mathe',
    dot: 'oklch(0.62 0.075 255)',
    when: 'letzte Woche',
    body: 'Notwendige Bedingung: f\'(x0) = 0. Hinreichende Bedingung: f\'\'(x0) ≠ 0.',
    tag: 'Übungsblatt 4'
  },

  // CHEMIE
  { 
    id: 5, 
    type: 'inspect',
    title: 'Titrationskurve & Tafelbild', 
    subject: 'Chemie', 
    dot: 'oklch(0.64 0.06 158)', 
    when: 'Mo', 
    body: 'Äquivalenzpunkt bei pH 7.0 (starke Säure / starke Base). Wendepunktanalyse.'
  },
  { 
    id: 6, 
    type: 'math',
    title: 'Redoxreaktionen & Oxidationszahlen', 
    subject: 'Chemie', 
    dot: 'oklch(0.64 0.06 158)', 
    when: 'heute',
    body: 'Oxidation = Elektronenabgabe, Reduktion = Aufnahme. Merksatz: OMA / RIG.' 
  },
  { 
    id: 7, 
    type: 'editorial',
    title: 'Galvanische Zelle & Daniell-Element', 
    subject: 'Chemie', 
    dot: 'oklch(0.64 0.06 158)', 
    when: 'vor 3 Tagen',
    subtitle: 'Zink-Kupfer-Element',
    body: 'Anode (Oxidation): Zn → Zn²⁺ + 2e⁻. Kathode (Reduktion): Cu²⁺ + 2e⁻ → Cu.',
    body2: 'Standardpotential: ΔE° = E°(Kathode) - E°(Anode) = +0.34V - (-0.76V) = 1.10V.',
    tag: 'Elektrochemie',
    source: 'Laborprotokoll Nr. 3'
  },
  { 
    id: 8, 
    type: 'math',
    title: 'Organische Chemie: Esterbildung', 
    subject: 'Chemie', 
    dot: 'oklch(0.64 0.06 158)', 
    when: 'letzte Woche',
    body: 'Carbonsäure + Alkohol ⇌ Carbonsäureester + Wasser (Säurekatalysiert)',
    tag: 'Organik'
  },

  // KUNST
  { 
    id: 9, 
    type: 'banner',
    title: 'The Renaissance Edition', 
    subject: 'Kunst', 
    dot: 'oklch(0.6 0.07 320)', 
    when: '11:42',
    tag: 'Shopify Editions | Winter \'26' 
  },
  { 
    id: 10, 
    type: 'gallery',
    title: 'Fotostudie & Perspektive',
    subject: 'Kunst',
    dot: 'oklch(0.6 0.07 320)',
    when: 'Mo',
    tag: '4 Fotos'
  },
  { 
    id: 11, 
    type: 'figma',
    title: 'Figma Draw & Vektoren', 
    subject: 'Kunst', 
    dot: '#D8615B', 
    when: 'Di',
    tag: 'Figma Draw'
  },
  { 
    id: 12, 
    type: 'editorial',
    title: 'Designing with Clarity', 
    subject: 'Kunst', 
    dot: '#0a84ff', 
    when: 'heute',
    subtitle: 'Structuring Ideas Before Execution',
    body: 'Designing with clarity means making intentional choices that help users understand what to do and where to go.',
    body2: 'Before jumping into visuals, organize ideas and define structure for maximum aesthetic harmony.',
    tag: 'Farblehre & Komposition',
    source: 'New York Times – Designing with Clarity'
  },

  // PGW
  { 
    id: 13, 
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
    id: 14, 
    type: 'editorial',
    title: 'Wahlsysteme im Vergleich: BRD vs. USA', 
    subject: 'PGW', 
    dot: 'oklch(0.58 0.075 320)', 
    when: 'gestern',
    subtitle: 'Personalisiertes Verhältniswahlrecht vs. Mehrheitswahl',
    body: 'BRD: Erststimme (Direktmandat) & Zweitstimme (Parteianteil mit 5%-Hürde).',
    body2: 'USA: Winner-takes-all Prinzip im Electoral College mit 538 Wahlleuten.',
    tag: 'Demokratie & Wahlen',
    source: 'Bundeszentrale für politische Bildung'
  },
  { 
    id: 15, 
    type: 'vehicle',
    title: '2025 LAND CRUISER', 
    subject: 'PGW', 
    dot: '#E27D48', 
    when: 'vor 2 Tagen',
    tag: 'Toyota Land Cruiser 250 - Overview'
  },

  // PHILOSOPHIE
  { 
    id: 16, 
    type: 'serif',
    title: 'Höhlengleichnis', 
    subject: 'Philosophie', 
    dot: 'oklch(0.7 0.035 78)', 
    when: 'Mi', 
    body: 'Schatten = Sinneswahrnehmung, Feuer = Sonne des Guten. Aufstieg = Erkenntnisstufen.', 
    question: 'Frage: Ist Bildung Zwang?' 
  },
  { 
    id: 17, 
    type: 'serif',
    title: 'Kategorischer Imperativ', 
    subject: 'Philosophie', 
    dot: 'oklch(0.7 0.035 78)', 
    when: 'Do', 
    body: 'Handle nur nach derjenigen Maxime, durch die du zugleich wollen kannst, dass sie ein allgemeines Gesetz werde.', 
    question: 'Kant: Pflichtethik vs. Utilitarismus' 
  },
  { 
    id: 18, 
    type: 'quote',
    title: 'CLOSED Bar Branding',
    subject: 'Philosophie',
    dot: 'oklch(0.7 0.035 78)',
    when: '14:20',
    platform: 'X',
    body: 'In crafting a rich, evocative identity for CLOSED bar, how by why serves a lesson in worldbuilding →'
  },

  // ENGLISCH
  { 
    id: 19, 
    type: 'editorial',
    title: 'Shakespeare: Macbeth Character Analysis', 
    subject: 'Englisch', 
    dot: 'oklch(0.68 0.09 26)', 
    when: 'heute',
    subtitle: 'Ambition, Guilt and the Supernatural',
    body: 'Macbeth\'s fatal flaw (hamartia) is unchecked ambition driven by the witches\' prophecies and Lady Macbeth\'s manipulation.',
    body2: 'Key motif: "Fair is foul, and foul is fair" — appearance versus reality.',
    tag: 'Drama Analysis',
    source: 'Oxford Literature Guides'
  },
  { 
    id: 20, 
    type: 'code',
    title: 'CopilotForXcode',
    repo: 'github / CopilotForXcode',
    subject: 'Englisch', 
    dot: '#4FA66B', 
    when: 'vor 5 Min',
    body: 'AI coding assistant for Xcode — Technical Documentation Analysis', 
    lang: 'Swift',
    stars: '5,512'
  },
  { 
    id: 21, 
    type: 'math',
    title: 'Rhetorical Devices & Connectors', 
    subject: 'Englisch', 
    dot: 'oklch(0.68 0.09 26)', 
    when: 'gestern',
    body: 'Metaphor, Alliteration, Oxymoron, Hyperbole. Transitions: Furthermore, Conversely, In light of this.',
    tag: 'Essay Writing'
  },

  // SPANISCH
  { 
    id: 22, 
    type: 'editorial',
    title: 'Subjuntivo vs. Indicativo: Regla WEIRDO', 
    subject: 'Spanisch', 
    dot: 'oklch(0.65 0.08 52)', 
    when: 'heute',
    subtitle: 'Wishes, Emotions, Impersonal, Recommendations, Doubt, Ojalá',
    body: 'El subjuntivo se utiliza para expresar deseos, dudas y valoraciones personales.',
    body2: 'Ejemplo: "Espero que tengas un buen día" / "Dudo que sea verdad".',
    tag: 'Gramática C1',
    source: 'Real Academia Española'
  },
  { 
    id: 23, 
    type: 'math',
    title: 'Vocabulario: Medio Ambiente y Clima', 
    subject: 'Spanisch', 
    dot: 'oklch(0.65 0.08 52)', 
    when: 'Mo', 
    body: 'el cambio climático, las energías renovables, la deforestación, la huella de carbono', 
    tag: 'Klausurvorbereitung' 
  },
  { 
    id: 24, 
    type: 'serif',
    title: 'El Siglo de Oro & Don Quijote', 
    subject: 'Spanisch', 
    dot: 'oklch(0.65 0.08 52)', 
    when: 'vor 4 Tagen', 
    body: 'Miguel de Cervantes Saavedra (1605). La parodia de los libros de caballerías y el idealismo quijotesco.', 
    question: 'Pregunta: ¿Quién es el verdadero loco?' 
  }
];

function TileWrap({ onOpen, w, h, bg, boxShadow, className = '', testId, children }) {
  return (
    <div
      onClick={onOpen}
      className={`lib-tile ${className}`}
      data-testid={testId}
      style={{ position: 'relative', flex: 'none', width: w, height: h, borderRadius: 24, overflow: 'hidden', background: bg, boxShadow, cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      {children}
    </div>
  );
}

function SubjectTile({ s, isSelected, isOtherSelected, onToggle }) {
  const shadow = isSelected 
    ? '0 24px 50px -16px rgba(10,132,255,.6), 0 0 0 2.5px #0a84ff' 
    : '0 20px 42px -22px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.12) inset';

  const tileClass = isSelected ? 'active' : isOtherSelected ? 'lib-tile-inactive' : '';
  const testId = `subject-tile-${s.id}`;

  if (s.id === 'mathe') {
    return (
      <TileWrap onOpen={onToggle} w={220} h={148} bg="linear-gradient(155deg,oklch(0.26 0.05 258),#0B0A0F)" boxShadow={shadow} className={tileClass} testId={testId}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.1) 1px,transparent 1px)', backgroundSize: '18px 18px' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 34, height: 58, background: 'linear-gradient(72deg,transparent 12%,oklch(0.72 0.075 250/.75) 12%,oklch(0.72 0.075 250/.75) 13.4%,transparent 13.4%)', transform: 'skewY(-16deg)' }} />
        <div style={{ position: 'absolute', right: 18, top: 14, font: 'italic 20px "Instrument Serif",serif', color: '#FFFFFF' }}>f(x)</div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 44, height: 1, background: 'rgba(255,255,255,.35)' }} />
        <div style={{ position: 'absolute', left: 20, bottom: 22, width: 1, height: 16, background: 'rgba(255,255,255,.35)' }} />
        <div style={{ position: 'absolute', right: 18, bottom: 24, font: '600 9.5px ui-monospace,monospace', letterSpacing: '.1em', color: '#FFFFFF' }}>{s.count} NOTIZEN</div>
        <div style={{ position: 'absolute', left: 18, bottom: 44, font: '800 40px/.9 "Bricolage Grotesque",sans-serif', letterSpacing: '-.04em', color: '#FFFFFF' }}>Mathe</div>
      </TileWrap>
    );
  }

  if (s.id === 'chemie') {
    return (
      <TileWrap onOpen={onToggle} w={150} h={164} bg="linear-gradient(155deg,oklch(0.26 0.045 160),#080E0A)" boxShadow={shadow} className={tileClass} testId={testId}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.14) 1.3px,transparent 1.4px)', backgroundSize: '15px 15px' }} />
        <div style={{ position: 'absolute', right: -16, top: 22, width: 76, height: 76, borderRadius: '50%', border: '2px solid oklch(0.72 0.06 158/.7)' }} />
        <div style={{ position: 'absolute', right: 8, top: 74, width: 44, height: 44, borderRadius: '50%', border: '1.5px solid oklch(0.72 0.06 158/.45)' }} />
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 34, background: 'rgba(0,0,0,.35)', borderRight: '1px solid rgba(255,255,255,.12)' }} />
        <div style={{ position: 'absolute', left: 0, top: 14, width: 34, display: 'flex', justifyContent: 'center' }}>
          <span style={{ writingMode: 'vertical-rl', font: '700 13px "Bricolage Grotesque",sans-serif', letterSpacing: '.22em', color: '#FFFFFF' }}>CHEMIE</span>
        </div>
        <div style={{ position: 'absolute', left: 0, bottom: 14, width: 34, display: 'flex', justifyContent: 'center' }}>
          <span style={{ writingMode: 'vertical-rl', font: '600 9px ui-monospace,monospace', letterSpacing: '.14em', color: '#FFFFFF' }}>{s.count}</span>
        </div>
      </TileWrap>
    );
  }

  if (s.id === 'kunst') {
    return (
      <TileWrap onOpen={onToggle} w={140} h={148} bg="#0D0B10" boxShadow={shadow} className={tileClass} testId={testId}>
        <div style={{ position: 'absolute', left: -14, top: -10, width: 160, height: 30, background: 'oklch(0.6 0.09 42)', transform: 'rotate(-11deg)' }} />
        <div style={{ position: 'absolute', left: -14, top: 20, width: 160, height: 24, background: 'oklch(0.68 0.075 82)' }} />
        <div style={{ position: 'absolute', left: -14, top: 44, width: 160, height: 26, background: 'oklch(0.5 0.06 215)', transform: 'rotate(-11deg)' }} />
        <div style={{ position: 'absolute', left: -14, top: 70, width: 160, height: 20, background: 'oklch(0.36 0.05 315)', transform: 'rotate(-11deg)' }} />
        <div style={{ position: 'absolute', left: -10, right: -10, bottom: 26, height: 30, background: '#FFFFFF', transform: 'rotate(-7deg)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ font: '700 15px "Bricolage Grotesque",sans-serif', letterSpacing: '-.01em', color: '#08080A' }}>Kunst</span>
          <span style={{ font: '700 8.5px ui-monospace,monospace', color: 'rgba(0,0,0,.6)' }}>{s.count}</span>
        </div>
      </TileWrap>
    );
  }

  if (s.id === 'pgw') {
    return (
      <TileWrap onOpen={onToggle} w={150} h={132} bg="linear-gradient(155deg,oklch(0.24 0.05 320),#0D0A12)" boxShadow={shadow} className={tileClass} testId={testId}>
        <div style={{ position: 'absolute', left: 16, bottom: 38, display: 'flex', alignItems: 'flex-end', gap: 6, height: 58 }}>
          <div style={{ width: 11, height: 22, background: 'oklch(0.6 0.07 320/.55)' }} />
          <div style={{ width: 11, height: 40, background: 'oklch(0.6 0.07 320/.7)' }} />
          <div style={{ width: 11, height: 30, background: 'oklch(0.6 0.07 320/.5)' }} />
          <div style={{ width: 11, height: 56, background: '#FFFFFF' }} />
          <div style={{ width: 11, height: 18, background: 'oklch(0.6 0.07 320/.4)' }} />
        </div>
        <div style={{ position: 'absolute', left: 75, bottom: 100, font: '600 9px ui-monospace,monospace', color: '#FFFFFF' }}>{s.count}</div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 36, height: 1, background: 'rgba(255,255,255,.35)' }} />
        <div style={{ position: 'absolute', left: 16, bottom: 11, font: '800 22px/1 "Bricolage Grotesque",sans-serif', letterSpacing: '.1em', color: '#FFFFFF' }}>PGW</div>
      </TileWrap>
    );
  }

  if (s.id === 'philosophie') {
    return (
      <TileWrap onOpen={onToggle} w={190} h={156} bg="linear-gradient(155deg,oklch(0.25 0.03 78),#0E0B08)" boxShadow={shadow} className={tileClass} testId={testId}>
        <div style={{ position: 'absolute', right: -8, top: -14, font: 'italic 110px/1 "Instrument Serif",serif', color: 'rgba(255,255,255,.1)' }}>Φ</div>
        <div style={{ position: 'absolute', left: 18, top: 18, right: 16, font: 'italic 31px/1.02 "Instrument Serif",serif', color: '#FFFFFF' }}>Philo­sophie</div>
        <div style={{ position: 'absolute', left: 18, top: 96, width: 40, height: 1, background: 'rgba(255,255,255,.4)' }} />
        <div style={{ position: 'absolute', left: 18, top: 108, right: 16, font: '400 11px/1.45 Manrope,sans-serif', color: '#FFFFFF' }}>Sartre, Platon, Kant · {s.count} Notizen</div>
      </TileWrap>
    );
  }

  if (s.id === 'englisch') {
    return (
      <TileWrap onOpen={onToggle} w={136} h={144} bg="linear-gradient(155deg,oklch(0.24 0.05 26),#0E0A0C)" boxShadow={shadow} className={tileClass} testId={testId}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(to bottom,transparent calc(100% - 1px),rgba(255,255,255,.15) calc(100% - 1px))', backgroundSize: '100% 24px' }} />
        <div style={{ position: 'absolute', left: 22, top: 0, bottom: 0, width: 1, background: 'oklch(0.68 0.09 26/.5)' }} />
        <div style={{ position: 'absolute', right: 10, top: 4, font: '400 54px/1 "Instrument Serif",serif', color: 'rgba(255,255,255,.15)' }}>Aa</div>
        <div style={{ position: 'absolute', left: 28, top: 56, font: '600 34px/1 Caveat,cursive', color: '#FFFFFF' }}>Englisch</div>
        <div style={{ position: 'absolute', left: 6, top: 60, font: '600 8.5px ui-monospace,monospace', color: '#FFFFFF' }}>{s.count}</div>
      </TileWrap>
    );
  }

  // spanisch
  return (
    <TileWrap onOpen={onToggle} w={150} h={132} bg="oklch(0.24 0.05 56)" boxShadow={shadow} className={tileClass} testId={testId}>
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(118deg,transparent 0 12px,oklch(0.58 0.08 52/.5) 12px 22px)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 24, height: 34, background: '#FFFFFF', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 7 }}>
        <span style={{ font: '700 15px "Bricolage Grotesque",sans-serif', color: '#08080A' }}>Spanisch</span>
        <span style={{ marginLeft: 'auto', font: '700 8.5px ui-monospace,monospace', color: 'rgba(0,0,0,.6)' }}>{s.count}</span>
      </div>
    </TileWrap>
  );
}

function ThematicSubjectHeader({ subject, onClearFilter, onNewNote }) {
  if (subject.id === 'mathe') {
    return (
      <div className="lib-thematic-banner" style={{ background: 'linear-gradient(135deg, oklch(0.22 0.065 258) 0%, #0A090F 100%)' }} data-testid="thematic-banner-mathe">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ font: '700 10.5px ui-monospace,monospace', letterSpacing: '.12em', color: '#90c4ff', textTransform: 'uppercase' }}>FACHÜBERSICHT · MATHEMATIK</span>
              <button className="lib-filter-pill" onClick={onClearFilter} title="Alle Fächer anzeigen">
                <X size={12} /> Alle Fächer
              </button>
            </div>
            <h1 style={{ margin: '4px 0 0', font: '800 36px/1 "Bricolage Grotesque",sans-serif', color: '#FFFFFF', letterSpacing: '-0.025em' }}>
              Mathematik & Analysis
            </h1>
            <p style={{ margin: '6px 0 0', color: '#FFFFFF', font: '400 13px Manrope,sans-serif' }}>
              Differential- und Integralrechnung, Vektorräume, Stochastik & Klausurvorbereitung
            </p>
          </div>
          <button 
            onClick={onNewNote}
            className="lib-filter-pill" 
            style={{ background: '#0a84ff', border: 'none', color: '#FFFFFF', padding: '8px 18px', fontWeight: 700 }}
          >
            <PenLine size={14} /> Neue Mathe-Notiz
          </button>
        </div>

        {/* Thematic Floating Formula Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(10,132,255,0.22)', border: '1px solid rgba(10,132,255,0.4)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
            f'(x) = lim (f(x+h)-f(x))/h
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
            ∫ f(x)dx = F(b) - F(a)
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
            a ⊥ b ⇔ a·b = 0
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(255,200,100,0.2)', border: '1px solid rgba(255,200,100,0.35)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
            Klausur: 14. September
          </span>
        </div>
      </div>
    );
  }

  if (subject.id === 'chemie') {
    return (
      <div className="lib-thematic-banner" style={{ background: 'linear-gradient(135deg, oklch(0.22 0.05 160) 0%, #080D0A 100%)' }} data-testid="thematic-banner-chemie">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ font: '700 10.5px ui-monospace,monospace', letterSpacing: '.12em', color: '#86efac', textTransform: 'uppercase' }}>FACHÜBERSICHT · CHEMIE</span>
              <button className="lib-filter-pill" onClick={onClearFilter} title="Alle Fächer anzeigen">
                <X size={12} /> Alle Fächer
              </button>
            </div>
            <h1 style={{ margin: '4px 0 0', font: '800 36px/1 "Bricolage Grotesque",sans-serif', color: '#FFFFFF', letterSpacing: '-0.025em' }}>
              Chemie & Laborprotokolle
            </h1>
            <p style={{ margin: '6px 0 0', color: '#FFFFFF', font: '400 13px Manrope,sans-serif' }}>
              Organische Synthese, Redox-Gleichgewichte, Säure-Base-Titrationen & Energetik
            </p>
          </div>
          <button 
            onClick={onNewNote}
            className="lib-filter-pill" 
            style={{ background: '#30d158', border: 'none', color: '#08140B', padding: '8px 18px', fontWeight: 700 }}
          >
            <PenLine size={14} /> Neue Chemie-Notiz
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(48,209,88,0.22)', border: '1px solid rgba(48,209,88,0.4)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
            pH = -lg[H3O+] = 7.0 (Äquivalenzpunkt)
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
            Zn → Zn²⁺ + 2e⁻ (ΔE° = 1.10V)
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
            R-COOH + R'-OH ⇌ Ester + H2O
          </span>
        </div>
      </div>
    );
  }

  if (subject.id === 'kunst') {
    return (
      <div className="lib-thematic-banner" style={{ background: 'linear-gradient(135deg, #261421 0%, #0E0B12 100%)' }} data-testid="thematic-banner-kunst">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ font: '700 10.5px ui-monospace,monospace', letterSpacing: '.12em', color: '#ff94d2', textTransform: 'uppercase' }}>FACHÜBERSICHT · BILDENDE KUNST</span>
              <button className="lib-filter-pill" onClick={onClearFilter} title="Alle Fächer anzeigen">
                <X size={12} /> Alle Fächer
              </button>
            </div>
            <h1 style={{ margin: '4px 0 0', font: '800 36px/1 "Bricolage Grotesque",sans-serif', color: '#FFFFFF', letterSpacing: '-0.025em' }}>
              Kunst, Zeichnung & Design
            </h1>
            <p style={{ margin: '6px 0 0', color: '#FFFFFF', font: '400 13px Manrope,sans-serif' }}>
              Zweipunktperspektive, Farbtheorie nach Itten, Renaissance-Studien & Vektorkunst
            </p>
          </div>
          <button 
            onClick={onNewNote}
            className="lib-filter-pill" 
            style={{ background: 'linear-gradient(140deg, #ff4081, #d500f9)', border: 'none', color: '#FFFFFF', padding: '8px 18px', fontWeight: 700 }}
          >
            <PenLine size={14} /> Neue Kunst-Skizze
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(255,64,129,0.22)', border: '1px solid rgba(255,64,129,0.4)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
            Goldener Schnitt: Φ ≈ 1.618
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
            Itten-Farbkreis & Komplementärkontrast
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
            Fluchtpunkt & Horizontlinie
          </span>
        </div>
      </div>
    );
  }

  if (subject.id === 'pgw') {
    return (
      <div className="lib-thematic-banner" style={{ background: 'linear-gradient(135deg, oklch(0.22 0.05 320) 0%, #0E0A14 100%)' }} data-testid="thematic-banner-pgw">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ font: '700 10.5px ui-monospace,monospace', letterSpacing: '.12em', color: '#d8b4fe', textTransform: 'uppercase' }}>FACHÜBERSICHT · PGW</span>
              <button className="lib-filter-pill" onClick={onClearFilter} title="Alle Fächer anzeigen">
                <X size={12} /> Alle Fächer
              </button>
            </div>
            <h1 style={{ margin: '4px 0 0', font: '800 36px/1 "Bricolage Grotesque",sans-serif', color: '#FFFFFF', letterSpacing: '-0.025em' }}>
              Politik, Gesellschaft, Wirtschaft
            </h1>
            <p style={{ margin: '6px 0 0', color: '#FFFFFF', font: '400 13px Manrope,sans-serif' }}>
              Wahlsysteme, Verfassungsrecht, Internationale Konflikte & Wirtschaftsordnung
            </p>
          </div>
          <button 
            onClick={onNewNote}
            className="lib-filter-pill" 
            style={{ background: '#a855f7', border: 'none', color: '#FFFFFF', padding: '8px 18px', fontWeight: 700 }}
          >
            <PenLine size={14} /> Neue PGW-Notiz
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(168,85,247,0.22)', border: '1px solid rgba(168,85,247,0.4)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
            Grundgesetz Art. 1-20 (Ewigkeitsklausel)
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
            Bundestag & Bundesrat (Gewaltenteilung)
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
            Soziale Marktwirtschaft
          </span>
        </div>
      </div>
    );
  }

  if (subject.id === 'philosophie') {
    return (
      <div className="lib-thematic-banner" style={{ background: 'linear-gradient(135deg, oklch(0.22 0.035 78) 0%, #0E0C09 100%)' }} data-testid="thematic-banner-philosophie">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ font: '700 10.5px ui-monospace,monospace', letterSpacing: '.12em', color: '#fde047', textTransform: 'uppercase' }}>FACHÜBERSICHT · PHILOSOPHIE</span>
              <button className="lib-filter-pill" onClick={onClearFilter} title="Alle Fächer anzeigen">
                <X size={12} /> Alle Fächer
              </button>
            </div>
            <h1 style={{ margin: '4px 0 0', font: 'italic 40px/1 "Instrument Serif",serif', color: '#FFFFFF' }}>
              Philosophie & Erkenntnistheorie
            </h1>
            <p style={{ margin: '6px 0 0', color: '#FFFFFF', font: '400 13px Manrope,sans-serif' }}>
              Ethik, Anthropologie, Existenzialismus und antike Staatsphilosophie
            </p>
          </div>
          <button 
            onClick={onNewNote}
            className="lib-filter-pill" 
            style={{ background: '#eab308', border: 'none', color: '#0E0C09', padding: '8px 18px', fontWeight: 700 }}
          >
            <PenLine size={14} /> Neue Philosophie-Notiz
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(250,204,21,0.22)', border: '1px solid rgba(250,204,21,0.4)', color: '#FFFFFF', font: 'italic 12px "Instrument Serif",serif' }}>
            „Sapere aude! Habe Mut, dich deines eigenen Verstandes zu bedienen." — Kant
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#FFFFFF', font: 'italic 12px "Instrument Serif",serif' }}>
            „Die Existenz geht der Essenz voraus." — Sartre
          </span>
        </div>
      </div>
    );
  }

  if (subject.id === 'englisch') {
    return (
      <div className="lib-thematic-banner" style={{ background: 'linear-gradient(135deg, oklch(0.22 0.05 26) 0%, #0E090B 100%)' }} data-testid="thematic-banner-englisch">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ font: '700 10.5px ui-monospace,monospace', letterSpacing: '.12em', color: '#fda4af', textTransform: 'uppercase' }}>SUBJECT OVERVIEW · ENGLISH</span>
              <button className="lib-filter-pill" onClick={onClearFilter} title="Alle Fächer anzeigen">
                <X size={12} /> All Subjects
              </button>
            </div>
            <h1 style={{ margin: '4px 0 0', font: '800 36px/1 "Bricolage Grotesque",sans-serif', color: '#FFFFFF', letterSpacing: '-0.025em' }}>
              English Language & Literature
            </h1>
            <p style={{ margin: '6px 0 0', color: '#FFFFFF', font: '400 13px Manrope,sans-serif' }}>
              Literary analysis, stylistic devices, Shakespearean drama & essay composition
            </p>
          </div>
          <button 
            onClick={onNewNote}
            className="lib-filter-pill" 
            style={{ background: '#f43f5e', border: 'none', color: '#FFFFFF', padding: '8px 18px', fontWeight: 700 }}
          >
            <PenLine size={14} /> New English Note
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(244,63,94,0.22)', border: '1px solid rgba(244,63,94,0.4)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
            Macbeth: "Fair is foul, and foul is fair"
          </span>
          <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
            Connectors: Furthermore, In consequence, Conversely
          </span>
        </div>
      </div>
    );
  }

  // SPANISCH
  return (
    <div className="lib-thematic-banner" style={{ background: 'linear-gradient(135deg, oklch(0.22 0.05 56) 0%, #0F0A07 100%)' }} data-testid="thematic-banner-spanisch">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ font: '700 10.5px ui-monospace,monospace', letterSpacing: '.12em', color: '#fdba74', textTransform: 'uppercase' }}>RESUMEN DE LA ASIGNATURA · ESPAÑOL</span>
            <button className="lib-filter-pill" onClick={onClearFilter} title="Alle Fächer anzeigen">
              <X size={12} /> Todas las materias
            </button>
          </div>
          <h1 style={{ margin: '4px 0 0', font: '800 36px/1 "Bricolage Grotesque",sans-serif', color: '#FFFFFF', letterSpacing: '-0.025em' }}>
            Lengua y Literatura Española
          </h1>
          <p style={{ margin: '6px 0 0', color: '#FFFFFF', font: '400 13px Manrope,sans-serif' }}>
            Gramática avanzada, el subjuntivo, vocabulario temático y literatura clásica
          </p>
        </div>
        <button 
          onClick={onNewNote}
          className="lib-filter-pill" 
          style={{ background: '#f97316', border: 'none', color: '#0F0A07', padding: '8px 18px', fontWeight: 700 }}
        >
          <PenLine size={14} /> Nueva Nota
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(249,115,22,0.22)', border: '1px solid rgba(249,115,22,0.4)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
          Subjuntivo: Deseos, Dudas, Emociones (WEIRDO)
        </span>
        <span style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#FFFFFF', font: '600 11px ui-monospace,monospace' }}>
          Don Quijote de la Mancha — Cervantes
        </span>
      </div>
    </div>
  );
}

function RecentCard({ n, onOpen }) {
  return (
    <div onClick={onOpen} className="lib-card" style={{
      borderRadius: 20, overflow: 'hidden', cursor: 'pointer',
      background: n.agent ? 'linear-gradient(165deg,oklch(0.24 0.055 318),#0E0D13 58%)' : '#0E0D13',
      border: '1px solid rgba(255,255,255,.1)',
      boxShadow: n.agent
        ? '0 22px 46px -24px rgba(0,0,0,.95),0 0 0 1px oklch(0.6 0.07 320/.3)'
        : '0 22px 46px -24px rgba(0,0,0,.95)'
    }}>
      {/* 1. Code Card */}
      {n.type === 'code' && (
        <div style={{ padding: '14px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <Code2 size={13} color="#4FA66B" />
            <span style={{ font: '700 11px ui-monospace,monospace', color: '#FFFFFF' }}>{n.repo}</span>
          </div>
          <div style={{ font: '400 12px/1.4 Manrope,sans-serif', color: '#FFFFFF', marginBottom: 10 }}>{n.body}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: '600 10px ui-monospace,monospace' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#4FA66B' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4FA66B' }} /> {n.lang}
            </span>
            <span style={{ color: '#FFFFFF' }}>★ {n.stars}</span>
          </div>
        </div>
      )}

      {/* 2. Banner Art Exhibition Card */}
      {n.type === 'banner' && (
        <div>
          <div style={{ height: 130, background: 'linear-gradient(135deg,#5e2a2b 0%,#2c1e28 50%,#182830 100%)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 75% 30%, rgba(255,200,120,.35), transparent 50%)' }} />
            <div style={{ position: 'absolute', left: 16, bottom: 14, right: 16 }}>
              <span style={{ font: '400 italic 20px/1 "Instrument Serif",serif', color: '#FFFFFF' }}>The Renaissance</span>
              <div style={{ font: '700 10px ui-monospace,monospace', letterSpacing: '.12em', color: '#FFFFFF' }}>EDITION</div>
            </div>
          </div>
          <div style={{ padding: '9px 14px', background: 'rgba(0,0,0,.45)', font: '600 10px ui-monospace,monospace', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🛍️</span> {n.tag}
          </div>
        </div>
      )}

      {/* 3. Quote Card */}
      {n.type === 'quote' && (
        <div style={{ padding: '16px 18px 14px', background: '#121118' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Quote size={12} color="#D4A937" />
            <span style={{ font: '700 11px ui-monospace,monospace', color: '#D4A937' }}>{n.platform}</span>
          </div>
          <div style={{ font: '400 13px/1.55 Manrope,sans-serif', color: '#FFFFFF' }}>{n.body}</div>
        </div>
      )}

      {/* 4. Inspect Image Photo Card with Center Action Buttons */}
      {n.type === 'inspect' && (
        <div>
          <div style={{ height: 136, background: 'repeating-linear-gradient(45deg,#1f1c24 0 10px,#17151c 10px 20px)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="lib-inspect-action-btn" title="Download"><Download size={14} /></div>
              <div className="lib-inspect-action-btn" title="Zoom & Vorschau"><ZoomIn size={14} /></div>
            </div>
            <span style={{ position: 'absolute', left: 12, bottom: 10, font: '600 9.5px ui-monospace,monospace', color: '#FFFFFF' }}>Tafelbild · 2400×1600</span>
          </div>
          <div style={{ padding: '12px 16px 10px' }}>
            <div style={{ font: '700 14px "Bricolage Grotesque",sans-serif', color: '#FFFFFF' }}>{n.title}</div>
            <div style={{ marginTop: 4, font: '400 11px/1.4 Manrope,sans-serif', color: '#FFFFFF' }}>{n.body}</div>
          </div>
        </div>
      )}

      {/* 5. Editorial Typography Card */}
      {n.type === 'editorial' && (
        <div style={{ padding: '16px 18px 15px', background: '#131218' }}>
          <div style={{ font: '800 18px/1.15 "Bricolage Grotesque",sans-serif', letterSpacing: '-.02em', color: '#FFFFFF', marginBottom: 8 }}>{n.title}</div>
          <div style={{ font: '400 11.5px/1.55 Manrope,sans-serif', color: '#FFFFFF', marginBottom: 10 }}>{n.body}</div>
          <div style={{ font: '700 12px "Bricolage Grotesque",sans-serif', color: '#FFFFFF', marginBottom: 4 }}>{n.subtitle}</div>
          <div style={{ font: '400 11.5px/1.55 Manrope,sans-serif', color: '#FFFFFF', marginBottom: 10 }}>{n.body2}</div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: 8, font: '600 9.5px ui-monospace,monospace', color: '#FFFFFF' }}>📰 {n.source}</div>
        </div>
      )}

      {/* 6. Gallery 4-Grid Photo Card */}
      {n.type === 'gallery' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, height: 110, background: '#08080A', padding: 2 }}>
            <div style={{ background: '#25232c' }} />
            <div style={{ background: '#1c1a22' }} />
            <div style={{ background: '#15141b' }} />
            <div style={{ background: '#2b2834' }} />
          </div>
          <div style={{ padding: '11px 16px', font: '700 14px "Bricolage Grotesque",sans-serif', color: '#FFFFFF' }}>{n.title}</div>
        </div>
      )}

      {/* 7. Figma Card */}
      {n.type === 'figma' && (
        <div style={{ padding: '16px 18px 14px', background: '#121017' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ font: '800 20px/1 "Bricolage Grotesque",sans-serif', color: '#FFFFFF' }}>Figma</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F24E1E' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#A259FF' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#1ABCFE' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#0ACF83' }} />
            </div>
          </div>
          <div style={{ height: 44, borderRadius: 10, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', font: 'italic 12px sans-serif' }}>
            Vector Canvas · Presets
          </div>
        </div>
      )}

      {/* 8. Vehicle Overview Card */}
      {n.type === 'vehicle' && (
        <div>
          <div style={{ height: 110, background: 'linear-gradient(135deg,#242b23,#101410)', position: 'relative', display: 'flex', alignItems: 'flex-end', padding: 14 }}>
            <span style={{ font: '800 16px/1 "Bricolage Grotesque",sans-serif', color: '#FFFFFF', letterSpacing: '.05em' }}>{n.title}</span>
          </div>
          <div style={{ padding: '9px 14px', background: 'rgba(0,0,0,.45)', font: '600 10px ui-monospace,monospace', color: '#FFFFFF' }}>
            🚗 {n.tag}
          </div>
        </div>
      )}

      {/* 9. Agent Card */}
      {n.type === 'agent' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 15px 0' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 999, background: 'oklch(0.6 0.07 320/.25)', font: '600 9.5px ui-monospace,monospace', letterSpacing: '.05em', color: '#FFFFFF' }}>
              <Sparkles size={11} />AGENT
            </span>
            <span style={{ font: '600 10px ui-monospace,monospace', color: '#FFFFFF' }}>{n.sources} Quellen</span>
          </div>
          <div style={{ padding: '9px 16px 15px' }}>
            <div style={{ font: '700 17px/1.22 "Bricolage Grotesque",sans-serif', letterSpacing: '-.025em', color: '#FFFFFF' }}>{n.title}</div>
            <div style={{ marginTop: 8, font: '400 11.5px/1.6 Manrope,sans-serif', color: '#FFFFFF' }}>{n.body}</div>
          </div>
        </div>
      )}

      {/* 10. Math Handwriting Card */}
      {n.type === 'math' && (
        <div style={{ padding: '15px 17px', backgroundImage: 'linear-gradient(to bottom,transparent calc(100% - 1px),rgba(255,255,255,.08) calc(100% - 1px))', backgroundSize: '100% 22px' }}>
          <div style={{ font: '600 20px/1.15 Caveat,cursive', color: '#FFFFFF', borderBottom: `1.5px solid ${n.dot}b0`, display: 'inline-block' }}>{n.title}</div>
          <div style={{ marginTop: 9, font: '400 16px/22px Caveat,cursive', color: '#FFFFFF' }}>{n.body}</div>
          {n.tag && <div style={{ marginTop: 4, display: 'inline-block', padding: '1px 5px', background: 'oklch(0.7 0.09 92/.25)', font: '400 16px/22px Caveat,cursive', color: '#FFFFFF' }}>{n.tag}</div>}
        </div>
      )}

      {/* 11. Serif Dialogue Card */}
      {n.type === 'serif' && (
        <div style={{ padding: '18px 20px 16px' }}>
          <div style={{ font: '400 italic 26px/1.15 "Instrument Serif",serif', color: '#FFFFFF' }}>{n.title}</div>
          <div style={{ marginTop: 11, font: '400 16px/22px Caveat,cursive', color: '#FFFFFF' }}>{n.body}</div>
          <div style={{ marginTop: 13, height: 1, background: 'rgba(255,255,255,.15)' }} />
          <div style={{ marginTop: 9, font: '400 16px/22px Caveat,cursive', color: '#FFFFFF' }}>{n.question}</div>
        </div>
      )}

      {/* Card Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 15px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: n.dot }} />
        <span style={{ font: '600 12px Manrope,sans-serif', color: '#FFFFFF' }}>{n.subject}</span>
        <span style={{ marginLeft: 'auto', font: '600 10px ui-monospace,monospace', color: '#FFFFFF' }}>{n.when}</span>
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
      <span style={{ font: '600 10px ui-monospace,monospace', color: '#FFFFFF', flexShrink: 0 }}>{n.when}</span>
    </div>
  );
}

export default function Library({ onOpenNote, onOpenSettings }) {
  const [selectedSubject, setSelectedSubject] = useState(null); // null = all subjects
  const [viewMode, setViewMode] = useState('masonry'); // 'masonry' | 'list'
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'title' | 'subject'
  const [searchQuery, setSearchQuery] = useState('');
  const [isMicActive, setIsMicActive] = useState(false);
  const [sortToast, setSortToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  const showToast = (msg) => {
    setSortToast(msg);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setSortToast(null), 1600);
  };

  const handleToggleSubject = (subject) => {
    if (selectedSubject?.id === subject.id) {
      setSelectedSubject(null);
      showToast('Alle Fächer werden angezeigt');
    } else {
      setSelectedSubject(subject);
      showToast(`Fach ausgewählt: ${subject.name}`);
    }
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

  // Filter notes by selected subject and search query
  const filteredNotes = RECENT.filter(n => {
    const matchesSubject = !selectedSubject || (
      n.subject.toLowerCase() === selectedSubject.name.toLowerCase() || 
      n.subject.toLowerCase() === selectedSubject.id.toLowerCase()
    );
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || (
      n.title.toLowerCase().includes(q) ||
      (n.body && n.body.toLowerCase().includes(q)) ||
      (n.tag && n.tag.toLowerCase().includes(q)) ||
      n.subject.toLowerCase().includes(q)
    );
    return matchesSubject && matchesSearch;
  });

  const sortedRecent = [...filteredNotes].sort((a, b) => {
    if (sortBy === 'title') return a.title.localeCompare(b.title);
    if (sortBy === 'subject') return a.subject.localeCompare(b.subject);
    return a.id - b.id;
  });

  // Dynamic Background Gradient depending on selected subject - Deep almost-black tones with reeded glass
  const bgGradient = selectedSubject?.id === 'mathe' 
    ? 'radial-gradient(820px 480px at 15% -4%,oklch(0.35 0.08 258/.45),transparent 68%),radial-gradient(640px 480px at 90% 12%,oklch(0.28 0.06 240/.3),transparent 65%)'
    : selectedSubject?.id === 'chemie'
    ? 'radial-gradient(820px 480px at 15% -4%,oklch(0.35 0.07 160/.45),transparent 68%),radial-gradient(640px 480px at 90% 12%,oklch(0.28 0.05 180/.3),transparent 65%)'
    : selectedSubject?.id === 'kunst'
    ? 'radial-gradient(820px 480px at 15% -4%,oklch(0.35 0.085 330/.45),transparent 68%),radial-gradient(640px 480px at 90% 12%,oklch(0.28 0.07 280/.3),transparent 65%)'
    : selectedSubject?.id === 'pgw'
    ? 'radial-gradient(820px 480px at 15% -4%,oklch(0.32 0.075 320/.45),transparent 68%),radial-gradient(640px 480px at 90% 12%,oklch(0.28 0.06 300/.3),transparent 65%)'
    : selectedSubject?.id === 'philosophie'
    ? 'radial-gradient(820px 480px at 15% -4%,oklch(0.32 0.05 78/.4),transparent 68%),radial-gradient(640px 480px at 90% 12%,oklch(0.26 0.04 60/.3),transparent 65%)'
    : selectedSubject?.id === 'englisch'
    ? 'radial-gradient(820px 480px at 15% -4%,oklch(0.32 0.07 26/.45),transparent 68%),radial-gradient(640px 480px at 90% 12%,oklch(0.26 0.05 10/.3),transparent 65%)'
    : selectedSubject?.id === 'spanisch'
    ? 'radial-gradient(820px 480px at 15% -4%,oklch(0.33 0.08 55/.45),transparent 68%),radial-gradient(640px 480px at 90% 12%,oklch(0.26 0.06 40/.3),transparent 65%)'
    : 'radial-gradient(720px 420px at 10% -6%,oklch(0.32 0.055 260/.35),transparent 66%),radial-gradient(620px 460px at 94% 6%,oklch(0.3 0.045 200/.25),transparent 64%)';

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#060608', fontFamily: 'Manrope,sans-serif', color: '#FFFFFF' }}>
      {/* 1. Fluted Reeded Glass Textured Dark Background Layer (Image 1 reference) */}
      <div className="liquid-fluted-bg" />

      {/* 2. Dynamic Thematic Ambient Lighting overlay */}
      <div style={{ position: 'absolute', inset: 0, background: bgGradient, transition: 'background 0.4s ease', pointerEvents: 'none' }} />

      {/* sidebar rail */}
      <div className="lib-glass" style={{ position: 'absolute', left: 20, top: 20, bottom: 20, width: 72, borderRadius: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 6, zIndex: 20 }}>
        <div style={{ width: 34, height: 34, borderRadius: 12, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#08080A', font: '800 15px "Bricolage Grotesque",sans-serif', marginBottom: 10 }}>N</div>
        <div style={{ width: 44, height: 44, borderRadius: 15, background: 'rgba(255,255,255,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.4)' }}><LayoutGrid size={19} /></div>
        <div style={{ width: 44, height: 44, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', cursor: 'pointer' }}><Clock size={19} /></div>
        <div style={{ width: 44, height: 44, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', cursor: 'pointer' }}><Star size={19} /></div>
        <div style={{ width: 44, height: 44, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', cursor: 'pointer' }}><Tag size={19} /></div>
        <button 
          onClick={onOpenSettings} 
          style={{ marginTop: 'auto', width: 44, height: 44, borderRadius: 15, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', cursor: 'pointer', transition: 'all 0.15s' }}
          className="lib-settings-btn"
          title="Einstellungen"
          data-testid="settings-nav-btn"
        >
          <Settings size={20} />
        </button>
      </div>

      {/* Liquid Glass Search & AI Capsule + Standalone Circle Button (Exact Image 1 Style) */}
      <div style={{ position: 'absolute', left: 106, top: 20, display: 'flex', alignItems: 'center', gap: 10, zIndex: 30 }}>
        {/* Main Liquid Glass Pill */}
        <div 
          className="liquid-glass-pill" 
          style={{ 
            height: 52, 
            width: 440, 
            padding: '0 20px 0 16px', 
            gap: 12, 
            cursor: 'text' 
          }}
        >
          <button 
            onClick={() => onOpenNote?.({ title: selectedSubject ? `Neue ${selectedSubject.name}-Notiz` : 'Neue Notiz', subject: selectedSubject ? selectedSubject.name : '' })}
            style={{ background: 'none', border: 'none', color: '#FFFFFF', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            title="Neue Notiz erstellen"
          >
            <Plus size={20} strokeWidth={2.4} />
          </button>

          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={selectedSubject ? `Ask AI zu ${selectedSubject.name}…` : 'Ask AI'}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#FFFFFF',
              font: '500 15px/1 Manrope, -apple-system, sans-serif',
              letterSpacing: '-0.01em',
              caretColor: '#0a84ff'
            }}
          />

          {/* Microphone Icon */}
          <button 
            onClick={() => {
              const nextState = !isMicActive;
              setIsMicActive(nextState);
              showToast(nextState ? 'Sprachassistent aktiv — Sprich jetzt…' : 'Spracheingabe beendet');
            }}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: isMicActive ? '#30d158' : '#FFFFFF', 
              padding: 4, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
            title="Spracheingabe"
          >
            <Mic size={18} strokeWidth={2} />
          </button>

          {/* Live Audio Waveform Indicator (Image 1) */}
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '0 2px', height: 20 }}
            title="Audio-Wellenform"
          >
            <span className="liquid-wave-bar" />
            <span className="liquid-wave-bar" />
            <span className="liquid-wave-bar" />
            <span className="liquid-wave-bar" />
            <span className="liquid-wave-bar" />
          </div>
        </div>

        {/* Standalone Liquid Glass Circle Button (Image 1 Close / Reset Pod) */}
        <button 
          className="liquid-glass-circle"
          onClick={() => { 
            setSearchQuery(''); 
            if (selectedSubject) setSelectedSubject(null);
            showToast('Filter & Suche zurückgesetzt');
          }}
          title="Schließen / Filter leeren"
        >
          <X size={19} strokeWidth={2.4} />
        </button>
      </div>

      {/* view toggle + new note (right aligned) */}
      <div style={{ position: 'absolute', right: 300, top: 20, display: 'flex', alignItems: 'center', gap: 12, zIndex: 15 }}>
        <div className="liquid-glass-pill" style={{ height: 52, padding: '0 6px', gap: 2 }}>
          <button 
            className={`lib-view-btn ${viewMode === 'masonry' ? 'active' : ''}`} 
            style={{ width: 40, height: 40, borderRadius: 20, background: viewMode === 'masonry' ? 'rgba(255,255,255,.24)' : 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', cursor: 'pointer', transition: 'all 0.15s' }} 
            onClick={() => setViewMode('masonry')}
            title="Masonry-Rasteransicht"
            data-testid="view-masonry-btn"
          >
            <LayoutGrid size={17} />
          </button>
          <button 
            className={`lib-view-btn ${viewMode === 'list' ? 'active' : ''}`} 
            style={{ width: 40, height: 40, borderRadius: 20, background: viewMode === 'list' ? 'rgba(255,255,255,.24)' : 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', cursor: 'pointer', transition: 'all 0.15s' }} 
            onClick={() => setViewMode('list')}
            title="Listenansicht"
            data-testid="view-list-btn"
          >
            <Rows3 size={17} />
          </button>
          <button 
            className="lib-view-btn" 
            style={{ width: 40, height: 40, borderRadius: 20, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', cursor: 'pointer', transition: 'all 0.15s' }} 
            onClick={cycleSort}
            title="Sortieren"
            data-testid="view-sort-btn"
          >
            <ArrowUpDown size={17} />
          </button>
        </div>

        <div 
          onClick={() => onOpenNote?.({ title: selectedSubject ? `Neue ${selectedSubject.name}-Notiz` : 'Neue Notiz', subject: selectedSubject ? selectedSubject.name : '' })} 
          className="liquid-glass-pill lib-newnote" 
          style={{ height: 52, padding: '0 22px 0 18px', gap: 10, background: '#FFFFFF', color: '#08080A', cursor: 'pointer', border: 'none', boxShadow: '0 20px 48px -12px rgba(0,0,0,0.95)' }}
          data-testid="new-note-btn"
        >
          <PenLine size={17} />
          <span style={{ font: '700 13px "Bricolage Grotesque",sans-serif', whiteSpace: 'nowrap' }}>
            {selectedSubject ? `Neue ${selectedSubject.name}-Notiz` : 'Neue Notiz'}
          </span>
        </div>
      </div>

      {/* Sort Toast */}
      {sortToast && (
        <div className="liquid-glass-pill" style={{ position: 'fixed', top: 84, right: 300, padding: '8px 18px', color: '#FFFFFF', font: '600 12px Manrope,sans-serif', display: 'flex', alignItems: 'center', gap: 8, zIndex: 1000 }} data-testid="sort-toast">
          <ArrowUpDown size={14} color="#0a84ff" />
          <span>{sortToast}</span>
        </div>
      )}

      {/* main content */}
      <div className="lib-scroll" style={{ position: 'absolute', left: 106, top: 92, right: 300, bottom: 26, overflow: 'auto', paddingRight: 10 }}>
        {/* Header or Thematic Subject Decor */}
        {selectedSubject ? (
          <ThematicSubjectHeader 
            subject={selectedSubject} 
            onClearFilter={() => { setSelectedSubject(null); showToast('Alle Fächer werden angezeigt'); }}
            onNewNote={() => onOpenNote?.({ title: `Neue ${selectedSubject.name}-Notiz`, subject: selectedSubject.name })}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 15, margin: '0 0 18px' }}>
            <h2 style={{ margin: 0, font: '800 46px/.92 "Bricolage Grotesque",sans-serif', letterSpacing: '-.035em', color: '#FFFFFF' }}>Bibliothek</h2>
            <span style={{ font: '600 10.5px ui-monospace,monospace', letterSpacing: '.11em', color: '#FFFFFF', paddingBottom: 8 }}>{SUBJECTS.length} FÄCHER · {SUBJECTS.reduce((a, s) => a + s.count, 0)} NOTIZEN</span>
          </div>
        )}

        {/* Subjects horizontal selector row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '0 0 28px' }}>
          {SUBJECTS.map(s => (
            <SubjectTile 
              key={s.id} 
              s={s} 
              isSelected={selectedSubject?.id === s.id}
              isOtherSelected={selectedSubject && selectedSubject.id !== s.id}
              onToggle={() => handleToggleSubject(s)} 
            />
          ))}
        </div>

        {/* Section title & count */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, margin: '0 0 14px' }}>
          <h3 style={{ margin: 0, font: '700 21px/1 "Bricolage Grotesque",sans-serif', letterSpacing: '-.025em', color: '#FFFFFF' }}>
            {selectedSubject ? `${selectedSubject.name} Notizen` : 'Zuletzt bearbeitet'}
          </h3>
          <span style={{ font: '600 9.5px ui-monospace,monospace', letterSpacing: '.11em', color: '#FFFFFF' }}>
            {sortedRecent.length} {sortedRecent.length === 1 ? 'NOTIZ' : 'NOTIZEN'} {selectedSubject ? `IN ${selectedSubject.name.toUpperCase()}` : 'DIESE WOCHE'} · {viewMode === 'masonry' ? 'MOODBOARD-RASTER' : 'LISTENANSICHT'}
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
      <div className="lib-glass" style={{ position: 'absolute', right: 14, top: 14, bottom: 14, width: 274, borderRadius: 30, background: 'rgba(14, 13, 18, 0.85)', backdropFilter: 'blur(34px) saturate(1.4)', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 1px 0 rgba(255,255,255,.2) inset,0 30px 64px -26px rgba(0,0,0,.95)', overflow: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 20 }}>
        <div style={{ padding: '18px 18px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="lib-agent-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.68 0.09 150)' }} />
          <span style={{ font: '700 13.5px "Bricolage Grotesque",sans-serif', letterSpacing: '-.02em', color: '#FFFFFF' }}>Agent</span>
          <span style={{ marginLeft: 'auto', font: '600 9.5px ui-monospace,monospace', letterSpacing: '.06em', color: '#FFFFFF' }}>2 AKTIV</span>
        </div>

        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 11, overflow: 'hidden' }}>
          <div style={{ borderRadius: 18, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.1)', padding: '13px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
              <Globe size={12} color="oklch(0.76 0.06 320)" />
              <span style={{ font: '700 9.5px ui-monospace,monospace', letterSpacing: '.05em', color: '#FFFFFF' }}>RECHERCHIERT</span>
            </div>
            <div style={{ font: '500 12.5px/1.42 Manrope,sans-serif', color: '#FFFFFF' }}>
              {selectedSubject ? `${selectedSubject.name}: Fachbegriffe & Zusammenfassung` : 'Wahlsystem BRD vs. USA — Vergleichstabelle'}
            </div>
            <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.15)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '64%', borderRadius: 2, background: 'linear-gradient(90deg,oklch(0.6 0.075 320),oklch(0.72 0.06 340))' }} />
            </div>
            <div style={{ marginTop: 7, display: 'flex', justifyContent: 'space-between', font: '600 9.5px ui-monospace,monospace', color: '#FFFFFF' }}><span>Quelle 4 von 6</span><span>~2 min</span></div>
          </div>

          <div style={{ borderRadius: 18, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.1)', padding: '13px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
              <ScanText size={12} color="oklch(0.76 0.055 235)" />
              <span style={{ font: '700 9.5px ui-monospace,monospace', letterSpacing: '.05em', color: '#FFFFFF' }}>LIEST HANDSCHRIFT</span>
            </div>
            <div style={{ font: '500 12.5px/1.42 Manrope,sans-serif', color: '#FFFFFF' }}>
              {selectedSubject ? `${selectedSubject.name}-Notizen der Woche → Formelsammlung` : 'Mathe-Notizen der Woche → Formelsammlung'}
            </div>
            <div style={{ marginTop: 9, display: 'flex', gap: 4 }}>
              {[1, 1, 1, 0, 0].map((on, i) => <span key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: on ? 'oklch(0.68 0.055 235)' : 'rgba(255,255,255,.2)' }} />)}
            </div>
          </div>

          <div style={{ marginTop: 4, font: '600 9.5px ui-monospace,monospace', letterSpacing: '.08em', color: '#FFFFFF', paddingLeft: 4 }}>FERTIG · HEUTE</div>

          {['Zusammenfassung „Franz. Revolution" → PGW', 'Vokabeltest Unidad 3 erstellt — 24 Karten'].map((t, i) => (
            <div key={i} className="lib-agent-done" style={{ borderRadius: 18, padding: '12px 14px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Check size={13} color="oklch(0.7 0.08 150)" style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ font: '500 12.5px/1.4 Manrope,sans-serif', color: '#FFFFFF' }}>{t}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', padding: '12px 14px 14px' }}>
          <div style={{ height: 44, borderRadius: 22, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', gap: 9, padding: '0 7px 0 15px' }}>
            <span style={{ flex: 1, font: '400 12.5px Manrope,sans-serif', color: '#FFFFFF' }}>
              {selectedSubject ? `Auftrag für ${selectedSubject.name}…` : 'Auftrag an den Agenten…'}
            </span>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(140deg,oklch(0.6 0.08 320),oklch(0.44 0.09 300))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}><ArrowUp size={15} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
