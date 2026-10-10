# Handoff: Tablet-Notizen-App Redesign (Schule, iOS/Liquid-Glass, AI-Agent)

## Overview
Redesign der UI einer tablet-basierten Notizen-App für die Schule (aktueller Code: React/Vite unter `NotesAPP/`, Zielgerät Galaxy Tab A7, 2000×1200, Querformat). Ersetzt den bisherigen starren 75/25-Split (Dokument links / Handschrift-Spalte rechts) durch eine vollwertige Bibliotheks-Ansicht (Fächer + Notizen) und einen Vollseiten-Editor, beide im iOS-artigen Liquid-Glass-Stil mit einem integrierten AI-Agent-Panel.

## Wichtig: warum beim Export nur die Startseite ankam
Die Datei `Notizen Neu.dc.html` ist **eine einzige Seite** mit clientseitigem State (React-artiges Komponentenmodell). Bibliothek und Editor sind **keine zwei Routen/URLs**, sondern zwei bedingt gerenderte Zustände (`openA`/`openB`) derselben Komponente — der Editor erscheint erst, nachdem man im Browser eine Notizkarte anklickt. Ein statischer HTML-Export (z. B. „Share & Export" in eurem Design-Tool) rendert nur den initialen Zustand beim Laden und kann den nach einem Klick erscheinenden Zustand nicht mit einfangen — daher fehlte die Datei-/Editor-Ansicht im Export.
**Konsequenz für die Umsetzung:** Bibliothek und Editor sind hier als zwei getrennte Screens dokumentiert (siehe unten); im Zielcode sollten es wahrscheinlich zwei echte Views/Routen sein (z. B. `/library` und `/editor/:noteId`), keine einzige Komponente mit verstecktem Zustand.

## Über die Design-Dateien
Die beigelegte HTML-Datei ist ein **Design-Referenz-Prototyp**, keine produktionsreife Codebasis. Sie wurde mit inline-Styles und einem eigenen Template-System gebaut, das es in Standard-React/Vite nicht gibt (`sc-if`, `onClick="{{ }}"` u. ä. sind NICHT gültiges JSX). Die Aufgabe ist, dieses Design **im bestehenden Stack der App** (React + Vite, wie in `NotesAPP/src/`) nachzubauen — mit echten Komponenten, echtem Router/State statt inline-Handlern, und den bestehenden Libraries (`lucide-react` ist schon eine Dependency der App).

## Fidelity
**High-fidelity.** Farben, Typografie, Radien, Schatten und Layout sind final gemeint und sollten pixelgenau übernommen werden. Textinhalte (Notiztitel, Fächernamen) sind exemplarisch für eine 10.–12.-Klasse-Fächerkombination und können durch echte Daten ersetzt werden.

## Screens / Views

### 1. Bibliothek (`Notizen Neu.dc.html`, Option `1a` bzw. `2a`)
**Zweck:** Einstiegspunkt der App. Übersicht über Fächer und zuletzt bearbeitete Notizen; AI-Agent sichtbar und ansprechbar.

**Layout (Tablet-Canvas 1280×768 innerhalb eines Geräterahmens):**
- Linke Icon-Rail: `position:absolute; left:12px; top:14px; bottom:14px; width:72px`, Liquid-Glass (`background:linear-gradient(160deg, rgba(255,255,255,.13), rgba(255,255,255,.04)); backdrop-filter:blur(30px) saturate(1.35); border:1px solid rgba(255,255,255,.13); border-radius:30px`), vertikal zentrierte Icon-Buttons 44×44px, `border-radius:15px`, Lucide-Icons: `layout-grid` (aktiv), `clock`, `star`, `tag`; App-Monogramm oben (34×34, `border-radius:12px`), Avatar unten (34×34 Kreis, Gradient).
- Suchleiste: `position:absolute; left:100px; top:16px; width:404px; height:50px`, gleicher Glas-Stil, `border-radius:25px`, Icon `search` + Placeholder-Text + `⌘K`-Badge rechts.
- Ansichts-Umschalter (Grid/Liste/Sortieren): daneben, `height:50px`, drei 38×38-Icon-Buttons (`layout-grid` aktiv, `rows-3`, `arrow-up-down`).
- „Neue Notiz"-Button: rechts davon, dunkel gefüllt (`#E9E6DF` hell-Variante / `#26221e` dunkel-Variante), `border-radius:25px`, Icon `pen-line` + Label.
- Content-Bereich: `padding: 92px 300px 26px 100px` (der rechte Wert reserviert bewusst Platz für das Agent-Panel — **wichtig**: darf nicht einfach `right:24px` sein, sonst werden Karten vom Panel verdeckt).
  - H1/H2 „Bibliothek" (Serif bzw. Grotesque, ~44–46px) + Metadaten „11 Fächer · 148 Notizen" + Datum rechtsbündig.
  - Fächer-Reihe: `display:flex; flex-wrap:wrap; gap:12px`, unterschiedlich große Karten (Bento-Prinzip, Breiten 120–298px, Höhen 128–164px), `border-radius:24–26px`. Jede Karte hat ein **eigenes thematisches Mikro-Design**, in das der Fächername als Typografie-Element eingebaut ist (kein generisches Icon+Label-Schema):
    - Mathe: Koordinatengitter-Hintergrund + diagonaler „Achsen"-Balken + große Serif-„f(x)"
    - Chemie: gepunkteter Hintergrund + zwei Ringe (Molekülstruktur) + vertikal laufender Schriftzug „CHEMIE"
    - Kunst: 4 schräge Farbstreifen + aufgesetztes helles Label-Band
    - PGW: Balkendiagramm-Silhouette + große Blocktypo „PGW"
    - Philosophie: großes Serif-Wasserzeichen „Φ" + kursiver Fachname als Blickfang + Kurzbeschreibung
    - Englisch: Lineal-/Linien-Hintergrund + handschriftliches „Englisch" in Caveat
    - Spanisch: diagonale Streifen + helles Label-Band unten
  - „Zuletzt bearbeitet" Abschnitt: `display:flex; gap:16–18px`, 3 Spalten mit `flex-direction:column`, Spalten unterschiedlich `padding-top` (18–52px) für den Asymmetrie-Effekt (Masonry-artiger Versatz). Jede Notizkarte: `border-radius:20px`, Vorschau-Bereich mit linierter/karierter/„Foto"-Textur + Titel in Caveat (Handschrift-Optik) + Footer-Zeile mit Farbpunkt (Fach-Farbe), Fachname, Zeitstempel.
  - Eine Karte ist als „Agent"-Ergebnis markiert: Badge „AGENT" (Sparkles-Icon) + Quellenanzahl, dezent andersfarbiger Verlaufshintergrund.
- Agent-Panel: `position:absolute; right:14px; top:14px; bottom:14px; width:274px`, gleicher Glas-Stil wie die Rail, `border-radius:30px`. Inhalt von oben nach unten:
  1. Header „Agent" mit pulsierendem grünen Punkt (`@keyframes agentPulse`, 2.2s) + Badge „N AKTIV" + Chevron.
  2. Laufende Aufträge als Karten (`border-radius:17–18px`, halbtransparenter Hintergrund): Icon+Label („RECHERCHIERT" / „LIEST HANDSCHRIFT"), Titel, Fortschrittsbalken oder Segment-Balken, Meta-Zeile (Quelle X/Y, Restzeit).
  3. Abschnitt „FERTIG · HEUTE": abgeschlossene Aufträge als Checkmark-Zeilen.
  4. Unten fixiert: Eingabefeld „Auftrag an den Agenten…" mit rundem Send-Button (Gradient, Pfeil-Icon).

**Interaktion:** Jede Notizkarte (`onClick`) navigiert zur Editor-Ansicht der jeweiligen Notiz.

### 2. Editor (gleiche Datei, Zustand nach Kartenklick)
**Zweck:** Eine Notiz lesen/bearbeiten. Ersetzt den alten 75/25-Split — der Editor ist jetzt vollflächig, kein fest abgetrennter Handschrift-Bereich mehr.

**Layout:**
- Papierfläche: `position:absolute; left:96px; right:24px; top:22px; bottom:22px`, `border-radius:22px`, liniertes Papier (`background-image` Linien alle 34px), Inhalt in Caveat (Handschrift-Simulation), Textmarker-Highlight als `background` mit ~20 % Deckkraft, eine Fokus-/Auswahl-Box mit farbigem 2px-Rahmen + leicht getöntem Hintergrund.
- Linke Icon-Rail: identisch zur Bibliothek, aber Inhalt kontextuell: `arrow-left` (zurück zur Bibliothek), `undo-2`, `redo-2`, `layers`.
- Titel-Pille oben links: Punkt in Fachfarbe + Notiztitel (bold) + Trenner + „Fach · Seite X von Y".
- Aktions-Pille oben rechts: „Erklären"-Button (Gradient-gefüllt, Sparkles-Icon — AI-Funktion), `share`, `more-horizontal`.
- Werkzeugleiste unten, zentriert, Glas-Pille: Stift/Textmarker/Radierer/Lasso-Icons, Farbwahl-Punkte (aktive Farbe mit doppeltem Ring hervorgehoben).

**Wichtiger Unterschied zum Ist-Zustand:** Die alte Architektur hatte eine fest 25 % breite, dauerhaft sichtbare „Writing Zone" rechts, in die separat mit dem Stift geschrieben wurde (Ergonomie-Lösung gegen fehlende Handballen-Erkennung, siehe `idee.txt`). In diesem Redesign ist stattdessen **kein dediziertes Schreibfeld mehr vorgesehen** — direkt auf der Papierfläche mit Fokus-Box gearbeitet. **Falls die Handballen-Ergonomie-Anforderung weiterhin gilt** (Galaxy Tab A7 ohne Palm-Rejection), muss der Entwickler zusammen mit dem Produktverantwortlichen klären, ob ein Ergonomie-Modus (z. B. ein einblendbares Schreibfeld) wieder ergänzt wird — das war in einer Zwischeniteration vorhanden und wurde auf expliziten Wunsch entfernt, weil es gestalterisch nicht überzeugte, nicht weil die technische Anforderung entfällt.

## Varianten in der Datei
Die Datei enthält 3 nebeneinander gebaute Design-Optionen (Canvas-Modus, per `<a href="#id">` verlinkt):
- **`1a` „Papier & Glas"**: helle Grundrichtung, Instrument Serif + Instrument Sans, farbige (kräftigere) Fächer-Akzente.
- **`1b` „Nachtglas"**: dunkle Gegenrichtung, Bricolage Grotesque + Manrope, Agent-Panel links statt rechts, kräftigere/buntere Akzentfarben.
- **`2a` „Tinte & Nachtglas"** (empfohlene/aktuellste Richtung laut Chatverlauf): Layout-Struktur von `1a`, Farbthema von `1b`, aber Farben entsättigt (Chroma ≤ 0.09 in OKLCH — gedeckte Tinten-/Erdtöne statt Neon), Fächernamen typografisch in jede Karte eingearbeitet statt als generisches Label.

Für die Implementierung nur **eine** dieser drei Richtungen umsetzen — mit dem Auftraggeber abstimmen, welche (Chat-Kontext deutet auf `2a`).

## Design Tokens

### Farben (Richtung `2a`, dunkel/entsättigt)
- Hintergrund: `#17161A` (Basis), radiale Verlaufs-Akzente mit sehr niedriger Chroma: `oklch(0.42 0.055 260/.85)`, `oklch(0.42 0.045 200/.7)`, `oklch(0.42 0.05 55/.6)`
- Text hell: `#E9E6DF` (Volltext), `rgba(233,230,223,.4–.8)` (sekundär, je nach Kontext)
- Glas-Panels: `linear-gradient(165deg, rgba(255,255,255,.135), rgba(255,255,255,.045))`, `backdrop-filter: blur(34px) saturate(1.4)`, Rand `1px solid rgba(255,255,255,.14)`
- Fach-Akzentfarben (jeweils dunkel + entsättigt, als Gradient-Paar): Mathe `oklch(0.31 0.045 258)/oklch(0.21 0.03 262)`; Chemie `oklch(0.32 0.04 160)/oklch(0.21 0.028 165)`; PGW `oklch(0.29 0.045 320)/oklch(0.2 0.03 318)`; Philosophie `oklch(0.35 0.028 78)/oklch(0.23 0.02 72)`; Englisch `oklch(0.3 0.05 26)/oklch(0.2 0.035 22)`; Spanisch `oklch(0.3 0.05 56)`
- Agent-Akzent: Lila/Magenta stark entsättigt, `oklch(0.6 0.075/0.08 320)` Familie
- Primärbutton („Neue Notiz"): `#E9E6DF` auf dunklem Grund, `#17161A` Text

### Typografie
- Display/Headlines: **Bricolage Grotesque** (700–800), negative letter-spacing (-.02 bis -.04em)
- UI-Text/Labels: **Manrope** (400–700)
- Zitate/Editorial: **Instrument Serif** (italic für Zitate/Fachnamen wie Philosophie)
- Handschrift-Simulation: **Caveat** (500–600) — NUR für Notizinhalte, nie für UI-Chrome
- Monospace (Meta-Infos, Zeitstempel, Badges): system `ui-monospace, Menlo, monospace`, meist 9.5–10.5px mit `letter-spacing:.05–.11em`, stark reduzierte Deckkraft

### Radien & Schatten
- Karten/Panels groß: `20–30px` Radius
- Icon-Buttons: `13–19px` Radius (nie perfekt eckig, nie voll rund außer Avatare/Farbpunkte)
- Schatten: weich, groß, meist `0 20-40px 40-80px -20-30px rgba(0,0,0,.7-.95)` — kein harter Slab-Schatten

### Icons
Lucide Icons (Bibliothek bereits im Projekt via `lucide-react` in `DocumentView.jsx` vorhanden): `layout-grid`, `clock`, `star`, `tag`, `search`, `rows-3`, `arrow-up-down`, `pen-line`, `sparkles`, `globe`, `scan-text`, `check`, `arrow-up`, `arrow-left`, `undo-2`, `redo-2`, `layers`, `share`, `more-horizontal`, `highlighter`, `eraser`, `lasso`, `chevron-right`, `plus`.

## State Management (Vorschlag für Umsetzung)
- `currentView`: `'library' | 'editor'` (idealerweise echtes Routing, z. B. React Router: `/`, `/note/:id`)
- `selectedNoteId`: string | null
- `agentTasks`: Array von `{ id, kind: 'research'|'ocr', title, progress, sourcesTotal, sourcesDone, etaMinutes }`
- `agentTaskHistory`: Array abgeschlossener Aufträge
- `subjects`: Array von `{ id, name, noteCount, theme }` — Fächer-Farbthema und Mikro-Design sollten pro Fach konfigurierbar sein (siehe Farbthema-Tokens oben), nicht hartkodiert pro Fachname
- `notes`: bestehende Datenstruktur aus `useMasterCanvas`/Stroke-Storage kann prinzipiell weiterverwendet werden; neu hinzu kommen Metadaten (Titel, Fach-Zuordnung, Vorschaubild/-text, letzte Bearbeitung)

## Assets
Keine Bild-Assets — alles ist CSS/SVG-Ersatzgrafik (Gradients, Icon-Font). Handschrift-Vorschauen sind gesetzter Caveat-Text als Platzhalter für echte OCR-/Stroke-Vorschauen; sollten in der echten App durch Canvas-Snapshots der tatsächlichen Notiz ersetzt werden.

## Referenzierte Codebase
`NotesAPP/` (React + Vite):
- `src/App.jsx`, `src/components/SplitLayout.jsx` — aktueller Tab-/Split-Aufbau, wird durch Library/Editor-Routing ersetzt
- `src/components/DocumentView.jsx` — enthält bereits `lucide-react` und `react-colorful` als Dependencies; Farbwähler-Logik (`ColorSlot`, Longpress-Popover) kann für die neue Werkzeugleiste wiederverwendet werden
- `src/components/WritingZone.jsx`, `src/hooks/useFocusBox.js`, `src/hooks/useMasterCanvas.js` — Canvas-/Stroke-Engine, Fokus-Box-Logik; bleibt technisch relevant für den Editor, auch wenn die dedizierte Writing-Zone-Spalte im neuen Design entfällt
- `idee.txt` — ursprüngliche Produktanforderung (Ergonomie-Palm-Rejection-Konzept); bei Bedarf mit Auftraggeber abgleichen, ob das weiter umgesetzt werden soll

## Dateien in diesem Handoff
- `Notizen Neu (Referenz, offline lauffähig).html` — Design-Referenz-Prototyp, alle 3 Optionen (`1a`, `1b`, `2a`). Einfach als Datei im Browser öffnen (Doppelklick genügt) — sie ist vollständig eigenständig (Schriften, Icons, Skripte eingebettet, keine Internetverbindung nötig). Bibliothek und Editor der Option `2a` per Klick auf eine Notizkarte durchspielbar.
