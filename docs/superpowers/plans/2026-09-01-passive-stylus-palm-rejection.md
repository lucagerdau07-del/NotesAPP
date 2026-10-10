# Handballen-Schutz für passive Stylus-Eingabe – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auf einem Galaxy Tab A7 (SM-T505, Android 12) mit passivem kapazitivem Stylus schreibt der Stift zuverlässig, während die aufliegende Schreibhand weder Striche noch Scrollen noch Zoom auslöst – inklusive rückwirkender Entfernung von Strichen, die der Handballen erzeugt hat, bevor die Stiftspitze aufsetzte.

**Architecture:** Da dieses Gerät keinen Digitizer besitzt und `pointerType === 'pen'` nie auftritt, wird die Stift-Priorität durch eine **Kontakt-Election** ersetzt: Unter den gleichzeitig aktiven Touch-Kontakten wird genau einer zum Schreib-Kandidaten gewählt (kleinste Kontaktfläche; ohne nutzbare Geometrie: der Kontakt mit dem größten zurückgelegten Weg), alle anderen sind Handballen. Die Klassifikation lebt in einem neuen reinen Modul `src/ink/contactClassifier.js`; `src/ink/inputPolicy.js` bleibt der einzige Reducer für Zeichenbesitz und Gesten-Lock und bindet den Klassifikator ein. `src/hooks/useInkPointer.js` führt einen flüchtigen Ringpuffer der zuletzt festgeschriebenen Touch-Striche und nimmt sie über die vorhandene `removeStrokes`-Funktion zurück, sobald ein Kontakt nachträglich als Handballen erkannt wird. Ein neues Modul `src/ink/pointerProbe.js` misst auf dem echten Gerät, welche Signale das Panel überhaupt liefert, und leitet daraus das Profil ab.

**Tech Stack:** React 19.2, JavaScript/JSX, HTML Pointer Events, Capacitor 8 (Android WebView), Vitest 4.1, React Testing Library 16.3, jsdom 29.

**Spec:** `docs/superpowers/specs/2026-09-01-passive-stylus-palm-rejection-design.md`

## Global Constraints

- Zielgerät: Samsung Galaxy Tab A7 **SM-T505**, Android 12, One UI Core 4.1, **passiver kapazitiver Stylus ohne Digitizer**. `pointerType` ist dort für Stift, Finger und Handballen gleichermaßen `'touch'`.
- Der bestehende Pfad für echte Stifte (`pointerType === 'pen'`, `penProximityMs`, `postPenGuardMs`, `lastPenUpAt`, `lastPenSeenAt`) bleibt **unverändert wirksam**. Alle bestehenden Tests in `tests/inputPolicy.test.js` und `tests/useInkPointer.test.js` müssen nach jeder Task grün bleiben.
- Sobald in einer Sitzung ein echter `pen`-Pointer gesehen wurde, wird der Passiv-Stylus-Fallback abgeschaltet (`sawPenPointer`) und im Profil persistiert.
- **Keine Änderung am Ink-Schema** (`createInkStroke`, `INK_SCHEMA_VERSION = 1`). Rückwirkende Rücknahme läuft ausschließlich über einen flüchtigen Puffer im Hook.
- **Keine neue Laufzeitabhängigkeit.** Kein nativer Capacitor-Plugin-Layer, keine Änderung an `android/app/src/main/java/com/notes/app/MainActivity.java`.
- Alle Schwellwerte sind Profilwerte in `src/ink/palmSettings.js` und über die Settings-Slider nachjustierbar. Ein gemessener Kalibrierungswert schlägt den Slider-Standard; der Slider skaliert den gemessenen Wert danach um ±25 %.
- Persistenz weiterhin `localStorage` unter dem Schlüssel `notes.palmGuard`; ein altes Profil ohne die neuen Felder muss ohne Fehler laden (Defaults auffüllen).
- Tests laufen mit `npm test` (`vitest run`). Nach jeder Task wird gemäß `.agents/AGENTS.md` ein lokaler Git-Savestate committet.
- Kein `console.log` im Produktionspfad; Diagnose-Ausgaben erscheinen ausschließlich in der Settings-Diagnoseansicht.

---

## Dateistruktur und Verantwortlichkeiten

- **Neu** `src/ink/pointerProbe.js` — Rohaufzeichnung von Pointer-Feldern, Verdichtung zu Quantilen, Ableitung eines Profils aus zwei Kalibrierungsstichproben. Rein, ohne DOM.
- **Neu** `src/ink/contactClassifier.js` — Zustand pro Kontakt (Maximalfläche, Weg, Alter), Election des Schreib-Kandidaten, Pinch-Erkennung, Handballen-Urteil. Rein, ohne DOM.
- **Ändern** `src/ink/inputPolicy.js` — bindet den Klassifikator ein, führt `contacts`, `electedPointerId`, `retroBlockedPointerIds`, `sawPenPointer`; erlaubt dem gewählten Kandidaten das Zeichnen im Stylus-Modus.
- **Ändern** `src/ink/palmSettings.js` — neue Profilfelder, Messwert-Vorrang, Persistenz von `sawPenPointer`.
- **Ändern** `src/hooks/useInkPointer.js` — Ringpuffer festgeschriebener Touch-Striche, rückwirkende Entfernung, `markPalm`-Zugang für die Gesten-Ebene.
- **Ändern** `src/components/Settings.jsx` — echter Kalibrierungs-Assistent, Diagnose-Ansicht.
- **Ändern** `src/components/DocumentView.jsx` — `pointercancel` als Handballen-Urteil des Betriebssystems weiterreichen.
- **Neu** `tests/pointerProbe.test.js`, `tests/contactClassifier.test.js`; **erweitert** `tests/inputPolicy.test.js`, `tests/useInkPointer.test.js`.

---

## Task 1: Pointer-Probe und Diagnose-Ansicht

Diese Task steht bewusst vorn: Sie beantwortet auf dem echten Gerät, ob `width`/`height` oder `pressure` überhaupt variieren. Tasks 2, 6 und 8 hängen von diesem Messergebnis ab.

**Files:**
- Create: `src/ink/pointerProbe.js`
- Create: `tests/pointerProbe.test.js`
- Modify: `src/components/Settings.jsx` (neuer Nav-Eintrag "Diagnose" neben `activeNav === "palm"`, Zeile 34 und der Nav-Block ab Zeile 235)

**Interfaces:**
- Produces: `PRESSURE_SCALE_PX` (Zahl), `createProbe()`, `recordSample(probe, event, label)`, `summarizeSamples(probe, label)`, `deriveProfileFromCalibration(penSummary, palmSummary)`, `MIN_SEPARATION_RATIO`.
- Consumes: nichts.

- [ ] **Step 1: Test schreiben**

Datei `tests/pointerProbe.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  createProbe,
  deriveProfileFromCalibration,
  recordSample,
  summarizeSamples,
} from '../src/ink/pointerProbe.js';

const sample = (label, size, pressure = 0) => ({
  label, phase: 'move', pointerId: 1, pointerType: 'touch',
  timeStamp: 1_000, width: size, height: size, pressure,
});

const fill = (label, sizes) => {
  const probe = createProbe();
  for (const size of sizes) recordSample(probe, sample(label, size), label);
  return probe;
};

describe('pointer probe', () => {
  it('summarises contact sizes and reports whether the panel varies them', () => {
    const summary = summarizeSamples(fill('pen', [8, 9, 10, 11, 40]), 'pen');
    expect(summary.count).toBe(5);
    expect(summary.pointerTypes).toEqual(['touch']);
    expect(summary.sizeMin).toBe(8);
    expect(summary.sizeMax).toBe(40);
    expect(summary.sizeVaries).toBe(true);
  });

  it('flags a panel that reports one constant size for every contact', () => {
    const summary = summarizeSamples(fill('pen', [33, 33, 33, 33]), 'pen');
    expect(summary.sizeVaries).toBe(false);
  });

  it('ignores the placeholder size of 1 that means "unknown"', () => {
    const summary = summarizeSamples(fill('pen', [1, 1, 1]), 'pen');
    expect(summary.sizeSamples).toBe(0);
    expect(summary.sizeVaries).toBe(false);
  });

  it('derives thresholds between the pen and palm distributions', () => {
    const profile = deriveProfileFromCalibration(
      summarizeSamples(fill('pen', [8, 9, 10, 11, 12]), 'pen'),
      summarizeSamples(fill('palm', [50, 55, 60, 65, 70]), 'palm'),
    );
    expect(profile.geometryUsable).toBe(true);
    expect(profile.sizeChannel).toBe('geometry');
    expect(profile.penMaxPx).toBeGreaterThan(12);
    expect(profile.palmContactPx).toBeGreaterThan(profile.penMaxPx);
    expect(profile.palmContactPx).toBeLessThan(50);
  });

  it('refuses to derive thresholds when the distributions overlap', () => {
    const profile = deriveProfileFromCalibration(
      summarizeSamples(fill('pen', [30, 31, 32, 33]), 'pen'),
      summarizeSamples(fill('palm', [31, 32, 33, 34]), 'palm'),
    );
    expect(profile.geometryUsable).toBe(false);
    expect(profile.sizeChannel).toBe('none');
  });

  it('falls back to pressure when geometry is constant but pressure is not', () => {
    const profile = deriveProfileFromCalibration(
      summarizeSamples(fill('pen', [33, 33, 33], 0.10), 'pen'),
      summarizeSamples(fill('palm', [33, 33, 33], 0.80), 'palm'),
    );
    expect(profile.sizeChannel).toBe('pressure');
    expect(profile.geometryUsable).toBe(true);
  });
});
```

Für den Druck-Fall muss `fill` den Druck mitgeben – ergänze in `fill` einen dritten Parameter:

```js
const fill = (label, sizes, pressure = 0) => {
  const probe = createProbe();
  for (const size of sizes) recordSample(probe, sample(label, size, pressure), label);
  return probe;
};
```

Damit `pressureVaries` in diesem Test greift, braucht jede Stichprobe Streuung. Ersetze den letzten Test durch:

```js
  it('falls back to pressure when geometry is constant but pressure is not', () => {
    const pen = createProbe();
    for (const pressure of [0.08, 0.10, 0.12]) recordSample(pen, sample('pen', 33, pressure), 'pen');
    const palm = createProbe();
    for (const pressure of [0.70, 0.80, 0.90]) recordSample(palm, sample('palm', 33, pressure), 'palm');
    const profile = deriveProfileFromCalibration(
      summarizeSamples(pen, 'pen'),
      summarizeSamples(palm, 'palm'),
    );
    expect(profile.sizeChannel).toBe('pressure');
    expect(profile.geometryUsable).toBe(true);
  });
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/pointerProbe.test.js`
Expected: FAIL — `Failed to resolve import "../src/ink/pointerProbe.js"`

- [ ] **Step 3: Minimale Implementierung**

Datei `src/ink/pointerProbe.js`:

```js
// A passive capacitive stylus is, to the panel, a small finger: pointerType,
// hover, tilt and real pressure are all unavailable. The only question worth
// asking is which channel THIS panel actually varies between a tip, a
// fingertip and a palm — and that is a measurement, not a spec sheet reading.

export const PROBE_LIMIT = 4000;
// Pressure arrives normalised to 0..1. Mapping it onto a pixel-like scale lets
// one pair of thresholds serve both channels instead of doubling the profile.
export const PRESSURE_SCALE_PX = 60;
// Below this relative gap the two distributions are the same distribution, and
// a threshold between them is a coin flip dressed up as a guard.
export const MIN_SEPARATION_RATIO = 0.2;

export function createProbe() {
  return { samples: [], truncated: false };
}

// Mutates: this runs at pointer rate on a tablet, and copying a 4000-entry
// array per sample is how a diagnostic tool becomes the thing being diagnosed.
export function recordSample(probe, event, label = '') {
  if (probe.samples.length >= PROBE_LIMIT) {
    probe.truncated = true;
    return probe;
  }
  const number = (value) => (Number.isFinite(value) ? value : 0);
  probe.samples.push({
    label,
    phase: typeof event.phase === 'string' ? event.phase : '',
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    timeStamp: number(event.timeStamp),
    width: number(event.width),
    height: number(event.height),
    pressure: number(event.pressure),
    tiltX: number(event.tiltX),
    tiltY: number(event.tiltY),
    twist: number(event.twist),
  });
  return probe;
}

const quantile = (values, q) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.round((sorted.length - 1) * q);
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))];
};

export function summarizeSamples(probe, label) {
  const rows = label
    ? probe.samples.filter((entry) => entry.label === label)
    : probe.samples;
  // A device with no contact geometry reports 1x1 for everything. That is
  // "unknown", not "tiny", so those samples must not enter the statistics.
  const sizes = rows
    .map((entry) => Math.max(entry.width, entry.height))
    .filter((value) => value > 1);
  const pressures = rows.map((entry) => entry.pressure).filter((value) => value > 0);
  return {
    count: rows.length,
    pointerTypes: [...new Set(rows.map((entry) => entry.pointerType))].sort(),
    sizeSamples: sizes.length,
    sizeMin: quantile(sizes, 0),
    sizeP10: quantile(sizes, 0.1),
    sizeP50: quantile(sizes, 0.5),
    sizeP90: quantile(sizes, 0.9),
    sizeMax: quantile(sizes, 1),
    sizeVaries: sizes.length > 0 && quantile(sizes, 1) - quantile(sizes, 0) > 1,
    pressureSamples: pressures.length,
    pressureP10: quantile(pressures, 0.1),
    pressureP50: quantile(pressures, 0.5),
    pressureP90: quantile(pressures, 0.9),
    pressureVaries:
      pressures.length > 0 && quantile(pressures, 0.9) - quantile(pressures, 0.1) > 0.01,
  };
}

export function deriveProfileFromCalibration(penSummary, palmSummary) {
  const channel =
    penSummary.sizeVaries && palmSummary.sizeVaries
      ? 'geometry'
      : penSummary.pressureVaries && palmSummary.pressureVaries
        ? 'pressure'
        : 'none';
  if (channel === 'none') {
    return { geometryUsable: false, sizeChannel: 'none', separation: 0 };
  }
  const pen =
    channel === 'geometry' ? penSummary.sizeP90 : penSummary.pressureP90 * PRESSURE_SCALE_PX;
  const palm =
    channel === 'geometry' ? palmSummary.sizeP10 : palmSummary.pressureP10 * PRESSURE_SCALE_PX;
  const separation = palm > 0 ? (palm - pen) / palm : 0;
  if (separation < MIN_SEPARATION_RATIO) {
    return { geometryUsable: false, sizeChannel: 'none', separation };
  }
  return {
    geometryUsable: true,
    sizeChannel: channel,
    // The candidate ceiling sits nearer the pen, the hard palm gate nearer the
    // palm: a tip misread as a palm loses the stroke, a palm misread as a tip
    // only loses the election to the smaller real tip.
    penMaxPx: Math.round(pen + (palm - pen) * 0.35),
    palmContactPx: Math.round(pen + (palm - pen) * 0.65),
    separation,
  };
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `npx vitest run tests/pointerProbe.test.js`
Expected: PASS (6 Tests)

- [ ] **Step 5: Diagnose-Ansicht in Settings**

In `src/components/Settings.jsx`:

Import ergänzen:

```js
import { createProbe, recordSample, summarizeSamples } from "../ink/pointerProbe.js";
```

State und Handler oberhalb des `return` einfügen:

```js
  // Diagnose — beantwortet auf dem Gerät, welche Pointer-Felder das Panel
  // überhaupt variiert. Ohne diese Messung ist jede Schwelle geraten.
  const probeRef = useRef(createProbe());
  const [probeSummary, setProbeSummary] = useState(null);

  const recordProbe = (event, phase) => {
    recordSample(
      probeRef.current,
      {
        phase,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        timeStamp: event.timeStamp,
        width: event.width,
        height: event.height,
        pressure: event.pressure,
        tiltX: event.tiltX,
        tiltY: event.tiltY,
        twist: event.twist,
      },
      "diagnose",
    );
    setProbeSummary(summarizeSamples(probeRef.current, "diagnose"));
  };

  const resetProbe = () => {
    probeRef.current = createProbe();
    setProbeSummary(null);
  };
```

Nav-Eintrag neben dem bestehenden `"palm"`-Eintrag (Muster von Zeile 235 kopieren, `activeNav === "diagnose"`, Label `Diagnose`).

Panel-Block, analog zu `{activeNav === "palm" && (`:

```jsx
        {activeNav === "diagnose" && (
          <div className="settings-detail">
            <h2 className="settings-detail-title">Signal-Diagnose</h2>
            <p style={{ color: "#FFFFFF", fontSize: 12, margin: "0 0 10px" }}>
              Tippe, schreibe und lege die Hand auf. Die Tabelle zeigt, welche
              Felder dieses Display tatsächlich liefert.
            </p>
            <div
              style={{
                height: 180,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,.15)",
                background: "#08080A",
                touchAction: "none",
              }}
              onPointerDown={(event) => recordProbe(event, "down")}
              onPointerMove={(event) => recordProbe(event, "move")}
              onPointerUp={(event) => recordProbe(event, "up")}
              onPointerCancel={(event) => recordProbe(event, "cancel")}
            />
            <pre
              data-testid="probe-summary"
              style={{ color: "#FFFFFF", fontSize: 11, whiteSpace: "pre-wrap" }}
            >
              {probeSummary
                ? [
                    `Samples: ${probeSummary.count}`,
                    `pointerType: ${probeSummary.pointerTypes.join(", ") || "-"}`,
                    `Größe min/p10/p50/p90/max: ${probeSummary.sizeMin} / ${probeSummary.sizeP10} / ${probeSummary.sizeP50} / ${probeSummary.sizeP90} / ${probeSummary.sizeMax}`,
                    `Größe variiert: ${probeSummary.sizeVaries ? "ja" : "nein"}`,
                    `Druck p10/p50/p90: ${probeSummary.pressureP10} / ${probeSummary.pressureP50} / ${probeSummary.pressureP90}`,
                    `Druck variiert: ${probeSummary.pressureVaries ? "ja" : "nein"}`,
                  ].join("\n")
                : "Noch keine Daten."}
            </pre>
            <button className="settings-action-btn" onClick={resetProbe}>
              Messung zurücksetzen
            </button>
          </div>
        )}
```

- [ ] **Step 6: Gesamte Suite laufen lassen**

Run: `npm test`
Expected: PASS — keine bestehende Suite bricht.

- [ ] **Step 7: Commit**

```bash
git add src/ink/pointerProbe.js tests/pointerProbe.test.js src/components/Settings.jsx docs/superpowers
git commit -m "feat(ink): measure which pointer signals this panel actually varies"
```

- [ ] **Step 8: Auf dem Gerät messen (Handarbeit, blockiert Task 6 und 8)**

```bash
npm run build && npx cap sync android && npx cap run android
```

Einstellungen → Diagnose öffnen und drei Messungen notieren:
1. Nur mit dem Stylus schreiben.
2. Nur mit einer Fingerkuppe schreiben.
3. Nur den Handballen auflegen.

Ergebnis in `docs/superpowers/verification/2026-09-01-sm-t505-pointer-probe.md` festhalten: je Messung `pointerType`, Größenquantile, `sizeVaries`, Druckquantile, `pressureVaries`. **Wenn `sizeVaries` in allen drei Messungen `false` ist und `pressureVaries` ebenfalls, ist die Geometrieschicht auf diesem Gerät tot** — Tasks 2 bis 5 laufen dann im Pfad `sizeChannel: 'none'`, und Task 6 setzt `geometryUsable: false`.

---

## Task 2: Kontakt-Klassifikator

**Files:**
- Create: `src/ink/contactClassifier.js`
- Create: `tests/contactClassifier.test.js`

**Interfaces:**
- Consumes: `PRESSURE_SCALE_PX` aus `src/ink/pointerProbe.js`.
- Produces: `CONTACT_DEFAULTS` (Objekt), `contactSize(event, tuning) -> number`, `updateContacts(contacts, event, tuning) -> contacts`, `isPinchPair(contacts, tuning) -> boolean`, `classifyContacts(contacts, tuning, now) -> { electedId, palmIds }`. `contacts` ist ein einfaches Objekt `{ [pointerId]: { id, maxSize, x, y, downAt, lastAt, pathPx } }`.

- [ ] **Step 1: Test schreiben**

Datei `tests/contactClassifier.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  CONTACT_DEFAULTS,
  classifyContacts,
  contactSize,
  isPinchPair,
  updateContacts,
} from '../src/ink/contactClassifier.js';

const touch = (phase, pointerId, { size = 0, x = 0, y = 0, timeStamp = 1_000 } = {}) => ({
  phase, pointerId, pointerType: 'touch', timeStamp,
  width: size, height: size, clientX: x, clientY: y,
});

const track = (events, tuning = CONTACT_DEFAULTS) =>
  events.reduce((contacts, event) => updateContacts(contacts, event, tuning), {});

describe('contact classifier', () => {
  it('reads a 1x1 report as unknown rather than tiny', () => {
    expect(contactSize({ width: 1, height: 1 }, CONTACT_DEFAULTS)).toBe(0);
    expect(contactSize({ width: 18, height: 12 }, CONTACT_DEFAULTS)).toBe(18);
  });

  it('reads pressure as the size proxy when the profile says so', () => {
    const tuning = { ...CONTACT_DEFAULTS, sizeChannel: 'pressure' };
    expect(contactSize({ width: 33, height: 33, pressure: 0.5 }, tuning)).toBe(30);
  });

  it('remembers the largest patch a contact ever reported', () => {
    const contacts = track([
      touch('down', 1, { size: 10 }),
      touch('move', 1, { size: 60 }),
      touch('move', 1, { size: 12 }),
    ]);
    expect(contacts[1].maxSize).toBe(60);
  });

  it('accumulates the path a contact has travelled and forgets it on release', () => {
    const moved = track([
      touch('down', 1, { x: 0, y: 0 }),
      touch('move', 1, { x: 3, y: 4 }),
      touch('move', 1, { x: 3, y: 14 }),
    ]);
    expect(moved[1].pathPx).toBe(15);
    expect(updateContacts(moved, touch('up', 1), CONTACT_DEFAULTS)).toEqual({});
  });

  it('elects the smallest contact and condemns every other one', () => {
    const contacts = track([
      touch('down', 1, { size: 60, x: 10, y: 10 }),
      touch('down', 2, { size: 9, x: 200, y: 200 }),
    ]);
    const verdict = classifyContacts(contacts, CONTACT_DEFAULTS, 1_000);
    expect(verdict.electedId).toBe(2);
    expect(verdict.palmIds).toEqual([1]);
  });

  it('re-elects when a smaller contact lands later, condemning the earlier one', () => {
    let contacts = track([touch('down', 1, { size: 30, x: 10, y: 10 })]);
    expect(classifyContacts(contacts, CONTACT_DEFAULTS, 1_000).palmIds).toEqual([]);
    contacts = updateContacts(contacts, touch('down', 2, { size: 8, x: 40, y: 40 }), CONTACT_DEFAULTS);
    const verdict = classifyContacts(contacts, CONTACT_DEFAULTS, 1_010);
    expect(verdict.electedId).toBe(2);
    expect(verdict.palmIds).toEqual([1]);
  });

  it('condemns a contact that rests without travelling', () => {
    const contacts = track([
      touch('down', 1, { size: 20, x: 5, y: 5, timeStamp: 1_000 }),
      touch('move', 1, { size: 20, x: 6, y: 5, timeStamp: 1_400 }),
    ]);
    const verdict = classifyContacts(contacts, CONTACT_DEFAULTS, 1_400);
    expect(verdict.palmIds).toEqual([1]);
    expect(verdict.electedId).toBe(null);
  });

  it('elects the contact that travelled when the panel reports no geometry', () => {
    const tuning = { ...CONTACT_DEFAULTS, sizeChannel: 'none', geometryUsable: false };
    const contacts = track([
      touch('down', 1, { x: 10, y: 10, timeStamp: 1_000 }),
      touch('down', 2, { x: 60, y: 10, timeStamp: 1_000 }),
      touch('move', 2, { x: 160, y: 10, timeStamp: 1_050 }),
    ], tuning);
    const verdict = classifyContacts(contacts, tuning, 1_050);
    expect(verdict.electedId).toBe(2);
    expect(verdict.palmIds).toEqual([1]);
  });

  it('leaves a deliberate two-finger pinch alone', () => {
    const contacts = track([
      touch('down', 1, { size: 20, x: 100, y: 100 }),
      touch('down', 2, { size: 22, x: 400, y: 300 }),
    ]);
    expect(isPinchPair(contacts, CONTACT_DEFAULTS)).toBe(true);
    const verdict = classifyContacts(contacts, CONTACT_DEFAULTS, 1_000);
    expect(verdict.electedId).toBe(null);
    expect(verdict.palmIds).toEqual([]);
  });

  it('does not mistake two clustered palm blobs for a pinch', () => {
    const contacts = track([
      touch('down', 1, { size: 50, x: 100, y: 100 }),
      touch('down', 2, { size: 48, x: 140, y: 120 }),
    ]);
    expect(isPinchPair(contacts, CONTACT_DEFAULTS)).toBe(false);
    expect(classifyContacts(contacts, CONTACT_DEFAULTS, 1_000).palmIds).toEqual([1, 2]);
  });

  it('lets a lone unclassified contact draw instead of stalling on it', () => {
    const contacts = track([touch('down', 1, { size: 0, x: 10, y: 10 })]);
    const verdict = classifyContacts(contacts, CONTACT_DEFAULTS, 1_000);
    expect(verdict.electedId).toBe(null);
    expect(verdict.palmIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/contactClassifier.test.js`
Expected: FAIL — `Failed to resolve import "../src/ink/contactClassifier.js"`

- [ ] **Step 3: Minimale Implementierung**

Datei `src/ink/contactClassifier.js`:

```js
import { PRESSURE_SCALE_PX } from './pointerProbe.js';

// Without a digitizer there is no pointerType to trust, so the question shifts
// from "is this a pen?" to "which of the contacts currently on the glass is the
// pen?". Exactly one wins; the rest of the hand loses by construction.
export const CONTACT_DEFAULTS = {
  // Hard gate: nothing this large is ever a writing tip.
  palmContactPx: 45,
  // A contact above this may still be a fingertip, but never the elected tip.
  penMaxPx: 26,
  // A hand that lands and stays is resting, not writing.
  restingPx: 8,
  restingMs: 220,
  // Palm blobs cluster; two fingers deliberately spread to pinch do not.
  pinchMinSeparationPx: 180,
  sizeChannel: 'geometry',
  geometryUsable: true,
  pressureScalePx: PRESSURE_SCALE_PX,
};

export function contactSize(event, tuning = CONTACT_DEFAULTS) {
  if (!tuning.geometryUsable || tuning.sizeChannel === 'none') return 0;
  if (tuning.sizeChannel === 'pressure') {
    const pressure = Number.isFinite(event.pressure) ? event.pressure : 0;
    return pressure > 0 ? pressure * (tuning.pressureScalePx ?? PRESSURE_SCALE_PX) : 0;
  }
  const size = Math.max(
    Number.isFinite(event.width) ? event.width : 0,
    Number.isFinite(event.height) ? event.height : 0,
  );
  // 1x1 is the placeholder a device with no contact geometry reports. Reading
  // it as "smallest contact on the glass" would elect a palm as the pen.
  return size > 1 ? size : 0;
}

const number = (value) => (Number.isFinite(value) ? value : 0);

export function updateContacts(contacts, event, tuning = CONTACT_DEFAULTS) {
  if (event.pointerType !== 'touch') return contacts;
  const id = event.pointerId;
  if (event.phase === 'up' || event.phase === 'cancel' || event.phase === 'abort') {
    if (!(id in contacts)) return contacts;
    const next = { ...contacts };
    delete next[id];
    return next;
  }
  const size = contactSize(event, tuning);
  const x = number(event.clientX);
  const y = number(event.clientY);
  const time = number(event.timeStamp);
  const previous = contacts[id];
  if (!previous || event.phase === 'down') {
    return { ...contacts, [id]: { id, maxSize: size, x, y, downAt: time, lastAt: time, pathPx: 0 } };
  }
  return {
    ...contacts,
    [id]: {
      ...previous,
      maxSize: Math.max(previous.maxSize, size),
      x,
      y,
      lastAt: time,
      pathPx: previous.pathPx + Math.hypot(x - previous.x, y - previous.y),
    },
  };
}

export function isPinchPair(contacts, tuning = CONTACT_DEFAULTS) {
  const list = Object.values(contacts);
  if (list.length !== 2) return false;
  const [first, second] = list;
  if (first.maxSize >= tuning.palmContactPx || second.maxSize >= tuning.palmContactPx) return false;
  return Math.hypot(first.x - second.x, first.y - second.y) >= tuning.pinchMinSeparationPx;
}

export function classifyContacts(contacts, tuning = CONTACT_DEFAULTS, now = 0) {
  const list = Object.values(contacts);
  const oversized = list
    .filter((contact) => contact.maxSize >= tuning.palmContactPx)
    .map((contact) => contact.id);
  // Two well-separated normal contacts are a gesture the user meant. Electing a
  // pen out of them would break zoom for the sake of a palm that is not there.
  if (isPinchPair(contacts, tuning)) return { electedId: null, palmIds: oversized };

  const resting = list
    .filter((contact) => now - contact.downAt >= tuning.restingMs && contact.pathPx < tuning.restingPx)
    .map((contact) => contact.id);
  const eligible = list.filter(
    (contact) => contact.maxSize < tuning.palmContactPx && !resting.includes(contact.id),
  );
  const sized = eligible.filter(
    (contact) => contact.maxSize > 0 && contact.maxSize <= tuning.penMaxPx,
  );
  const elected = sized.length > 0
    ? sized.reduce((best, contact) => (contact.maxSize < best.maxSize ? contact : best))
    // No usable geometry: the hand rests and the tip writes, so the contact
    // that has actually travelled is the only thing left to elect on.
    : eligible
        .filter((contact) => contact.pathPx >= tuning.restingPx)
        .reduce((best, contact) => (!best || contact.pathPx > best.pathPx ? contact : best), null);

  const electedId = elected ? elected.id : null;
  const palmIds = [...new Set([
    ...oversized,
    ...resting,
    // A single unclassified contact is left alone on purpose: stalling it until
    // it proves itself would put a visible lag on every ordinary stroke.
    ...(electedId === null
      ? []
      : list.filter((contact) => contact.id !== electedId).map((contact) => contact.id)),
  ])];
  return { electedId, palmIds };
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `npx vitest run tests/contactClassifier.test.js`
Expected: PASS (11 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/ink/contactClassifier.js tests/contactClassifier.test.js
git commit -m "feat(ink): elect the writing contact instead of trusting pointerType"
```

---

## Task 3: Klassifikator in die Input-Policy einbinden

**Files:**
- Modify: `src/ink/inputPolicy.js`
- Modify: `tests/inputPolicy.test.js` (anhängen, bestehende Tests unverändert lassen)

**Interfaces:**
- Consumes: `CONTACT_DEFAULTS`, `classifyContacts`, `updateContacts` aus `src/ink/contactClassifier.js`.
- Produces: `createInputState({ sawPenPointer })` mit den neuen Feldern `contacts`, `electedPointerId`, `retroBlockedPointerIds`, `sawPenPointer`; `PALM_GUARD_DEFAULTS` erweitert um alle Felder aus `CONTACT_DEFAULTS` plus `passiveStylus: true` und `retroWindowMs: 1200`.

- [ ] **Step 1: Test schreiben**

An `tests/inputPolicy.test.js` anhängen:

```js
import { classifyContacts } from '../src/ink/contactClassifier.js';

const contact = (phase, pointerId, { size = 0, x = 0, y = 0, timeStamp = 1_000 } = {}) => ({
  phase, pointerId, pointerType: 'touch', timeStamp,
  width: size, height: size, clientX: x, clientY: y,
});

describe('passive stylus admission', () => {
  it('lets the elected contact draw in stylus mode on a device with no pen', () => {
    let result = reducePointerInput(createInputState(), contact('down', 1, { size: 60, x: 10, y: 10 }), 'stylus');
    expect(result.intent).toBe('ignore');
    result = reducePointerInput(result.state, contact('down', 2, { size: 9, x: 300, y: 300, timeStamp: 1_050 }), 'stylus');
    expect(result.intent).toBe('start-draw');
    expect(result.state.drawingPointerId).toBe(2);
    expect(result.state.blockedTouchPointerIds).toContain(1);
  });

  it('cancels the palm stroke and names it for retroactive removal', () => {
    let result = reducePointerInput(createInputState(), contact('down', 1, { size: 30, x: 10, y: 10 }), 'stylus');
    expect(result.intent).toBe('start-draw');
    result = reducePointerInput(result.state, contact('down', 2, { size: 8, x: 40, y: 40, timeStamp: 1_050 }), 'stylus');
    expect(result.intent).toBe('cancel-draw');
    expect(result.state.retroBlockedPointerIds).toContain(1);
  });

  it('treats an OS pointer cancel on a touch as a palm verdict', () => {
    let result = reducePointerInput(createInputState(), contact('down', 1, { size: 20 }), 'stylus');
    expect(result.intent).toBe('start-draw');
    result = reducePointerInput(result.state, contact('cancel', 1, { size: 20, timeStamp: 1_020 }), 'stylus');
    expect(result.intent).toBe('cancel-draw');
    expect(result.state.retroBlockedPointerIds).toContain(1);
  });

  it('condemns a contact that has rested past the resting window', () => {
    let result = reducePointerInput(createInputState(), contact('down', 1, { size: 20, x: 5, y: 5 }), 'stylus');
    expect(result.intent).toBe('start-draw');
    result = reducePointerInput(result.state, contact('move', 1, { size: 20, x: 6, y: 5, timeStamp: 1_400 }), 'stylus');
    expect(result.intent).toBe('cancel-draw');
    expect(result.state.retroBlockedPointerIds).toContain(1);
  });

  it('keeps the real pen path in charge once a pen pointer has been seen', () => {
    let result = reducePointerInput(createInputState(), event('down', 7, 'pen', 1_000), 'stylus');
    expect(result.state.sawPenPointer).toBe(true);
    result = reducePointerInput(result.state, event('up', 7, 'pen', 1_100), 'stylus');
    result = reducePointerInput(result.state, contact('down', 1, { size: 8, timeStamp: 5_000 }), 'stylus');
    expect(result.intent).toBe('navigate');
    expect(result.state.drawingPointerId).toBe(null);
  });

  it('still admits a two-finger pinch in stylus mode', () => {
    let result = reducePointerInput(createInputState(), contact('down', 1, { size: 20, x: 100, y: 100 }), 'stylus');
    result = reducePointerInput(result.state, contact('down', 2, { size: 22, x: 400, y: 300, timeStamp: 1_020 }), 'stylus');
    expect(result.state.blockedTouchPointerIds).toEqual([]);
    expect(result.state.gestureLocked).toBe(true);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/inputPolicy.test.js`
Expected: FAIL — bei "lets the elected contact draw in stylus mode" mit `expected 'ignore' to be 'start-draw'`; `result.state.retroBlockedPointerIds` ist `undefined`.

- [ ] **Step 3: Implementierung**

In `src/ink/inputPolicy.js`:

Import und Defaults oben ergänzen:

```js
import { CONTACT_DEFAULTS, classifyContacts, updateContacts } from './contactClassifier.js';
```

`PALM_GUARD_DEFAULTS` erweitern (bestehende Felder unverändert lassen, nur anhängen):

```js
export const PALM_GUARD_DEFAULTS = {
  penProximityMs: 600,
  postPenGuardMs: POST_PEN_TOUCH_GUARD_MS,
  palmContactPx: 45,
  palmLatchMs: 250,
  ...CONTACT_DEFAULTS,
  // On a device without a digitizer nothing ever reports pointerType 'pen', so
  // stylus mode would admit nothing at all. The elected contact stands in for
  // the pen until a real one shows up and takes the job back.
  passiveStylus: true,
  // How far back a stroke can still be taken away once its contact turns out
  // to have been a palm. The hand lands before the tip, so this has to cover a
  // whole short palm stroke, not just a frame.
  retroWindowMs: 1200,
};
```

`createInputState` erweitern:

```js
export function createInputState(seed = {}) {
  return {
    drawingPointerId: null,
    drawingPointerType: null,
    touchPointerIds: [],
    blockedTouchPointerIds: [],
    gestureLocked: false,
    lastPenUpAt: Number.NEGATIVE_INFINITY,
    lastPenSeenAt: Number.NEGATIVE_INFINITY,
    lastPalmUpAt: Number.NEGATIVE_INFINITY,
    contacts: {},
    electedPointerId: null,
    // Pointer ids condemned by this event and not blocked before it. The hook
    // uses them to take back ink that has already been drawn or committed.
    retroBlockedPointerIds: [],
    sawPenPointer: seed.sawPenPointer === true,
  };
}
```

In `shouldBlockTouch` die Stylus-Blockade um die Ausnahme für den gewählten Kandidaten ergänzen:

```js
  if (inputMode === 'stylus' && state.electedPointerId !== event.pointerId) {
    if (state.blockedTouchPointerIds.length > 0) return true;
    if (timeStamp - state.lastPalmUpAt < tuning.palmLatchMs) return true;
  }
```

In `reducePointerInput` ganz oben, vor `const isTouch = ...`, die Klassifikation einziehen und `state` durch den angereicherten Zustand ersetzen:

```js
export function reducePointerInput(
  inputState,
  event,
  inputMode = 'stylus',
  tuning = PALM_GUARD_DEFAULTS,
) {
  const contacts = updateContacts(inputState.contacts ?? {}, event, tuning);
  const verdict = classifyContacts(contacts, tuning, eventTime(event));
  // Android withdraws a contact it has decided was a palm as a cancel. That is
  // a verdict from the driver, better informed than anything computed up here.
  const osPalmIds = event.pointerType === 'touch' && event.phase === 'cancel'
    ? [event.pointerId]
    : [];
  const palmIds = [...new Set([...verdict.palmIds, ...osPalmIds])];
  const state = { ...inputState, contacts, electedPointerId: verdict.electedId };
  const isTouch = event.pointerType === 'touch';
  // ... bestehender Rumpf ab hier unverändert
```

Danach in der Berechnung von `blockedTouchPointerIds` die Handballen-Urteile einmischen. Bestehenden Ausdruck ersetzen durch:

```js
  const classifierBlocked = [...new Set([...state.blockedTouchPointerIds, ...palmIds])];
  const blockedTouchPointerIds = !isTouch
    ? state.blockedTouchPointerIds
    : isRelease
      ? remove(classifierBlocked, event.pointerId)
      : blockedByPalmGuard && event.phase === 'down'
        ? addUnique(classifierBlocked, event.pointerId)
        : classifierBlocked;
```

`nextState` um die neuen Felder ergänzen:

```js
  const nextState = {
    ...state,
    touchPointerIds,
    blockedTouchPointerIds,
    gestureLocked,
    retroBlockedPointerIds: palmIds.filter(
      (id) => !inputState.blockedTouchPointerIds.includes(id),
    ),
    sawPenPointer: state.sawPenPointer || event.pointerType === 'pen',
    lastPenSeenAt: event.pointerType === 'pen' ? eventTime(event) : state.lastPenSeenAt,
    lastPalmUpAt: isTouch && isRelease && state.blockedTouchPointerIds.includes(event.pointerId)
      ? eventTime(event)
      : state.lastPalmUpAt,
  };
```

Direkt nach `nextState` und **vor** `if (blockedByPalmGuard) return ...` den Widerruf des laufenden Strichs einfügen:

```js
  // The hand lands before the tip. When the contact that is currently drawing
  // turns out to be that hand, the only correct move is to take the stroke
  // back — deciding at pointerdown alone can never get this ordering right.
  if (state.drawingPointerId !== null && palmIds.includes(state.drawingPointerId)) {
    return {
      state: { ...nextState, drawingPointerId: null, drawingPointerType: null },
      intent: 'cancel-draw',
    };
  }
```

In der `canDraw`-Bedingung den Passiv-Stylus-Pfad ergänzen:

```js
    const canDraw = inputMode !== 'move' && (
      event.pointerType === 'mouse'
      || (isTouch && inputMode === 'finger' && !gestureLocked)
      || (
        isTouch
        && inputMode === 'stylus'
        && tuning.passiveStylus
        && !state.sawPenPointer
        && !gestureLocked
      )
    );
```

- [ ] **Step 4: Tests laufen lassen, Erfolg prüfen**

Run: `npx vitest run tests/inputPolicy.test.js`
Expected: PASS — alle bestehenden **und** die sechs neuen Tests.

- [ ] **Step 5: Gesamte Suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ink/inputPolicy.js tests/inputPolicy.test.js
git commit -m "feat(ink): admit the elected contact as the pen when no digitizer exists"
```

---

## Task 4: Rückwirkende Entfernung von Handballen-Strichen

**Files:**
- Modify: `src/hooks/useInkPointer.js`
- Modify: `tests/useInkPointer.test.js` (anhängen)

**Interfaces:**
- Consumes: `state.retroBlockedPointerIds` aus Task 3; `options.removeStrokes` (existiert bereits, siehe `src/hooks/useInkDocument.js:123`).
- Produces: Hook-Rückgabe zusätzlich `markPalm(pointerId, timeStamp)`.

- [ ] **Step 1: Test schreiben**

An `tests/useInkPointer.test.js` anhängen (Hilfsfunktionen der bestehenden Datei wiederverwenden; falls dort kein `pointerEvent`-Helfer existiert, den vorhandenen Aufbau der Nachbartests spiegeln):

```js
  it('removes a committed touch stroke once its contact turns out to be a palm', async () => {
    const removeStrokes = vi.fn();
    const commitStroke = vi.fn();
    const { result } = renderHook(() =>
      useInkPointer({
        document: testDocument,
        inputMode: 'stylus',
        tool: 'pen',
        color: '#000000',
        width: 3,
        mapPoint: (event) => ({ pageId: 'page-1', x: event.clientX, y: event.clientY }),
        commitStroke,
        removeStrokes,
      }),
    );

    // A palm lands first, draws, and lifts — the stroke is committed.
    act(() => {
      result.current.onPointerDown(pointerEvent('down', 1, 'touch', { size: 30, x: 10, y: 10, timeStamp: 1_000 }));
      result.current.onPointerMove(pointerEvent('move', 1, 'touch', { size: 30, x: 40, y: 40, timeStamp: 1_020 }));
      result.current.onPointerUp(pointerEvent('up', 1, 'touch', { size: 30, x: 40, y: 40, timeStamp: 1_040 }));
    });
    expect(commitStroke).toHaveBeenCalledTimes(1);
    const strokeId = commitStroke.mock.calls[0][0].id;

    // The tip lands a moment later. The earlier contact was the hand.
    act(() => {
      result.current.markPalm(1, 1_100);
    });
    expect(removeStrokes).toHaveBeenCalledWith([strokeId]);
  });

  it('does not remove a touch stroke older than the retroactive window', () => {
    const removeStrokes = vi.fn();
    const commitStroke = vi.fn();
    const { result } = renderHook(() =>
      useInkPointer({
        document: testDocument,
        inputMode: 'finger',
        tool: 'pen',
        color: '#000000',
        width: 3,
        mapPoint: (event) => ({ pageId: 'page-1', x: event.clientX, y: event.clientY }),
        commitStroke,
        removeStrokes,
      }),
    );
    act(() => {
      result.current.onPointerDown(pointerEvent('down', 1, 'touch', { x: 10, y: 10, timeStamp: 1_000 }));
      result.current.onPointerMove(pointerEvent('move', 1, 'touch', { x: 40, y: 40, timeStamp: 1_020 }));
      result.current.onPointerUp(pointerEvent('up', 1, 'touch', { x: 40, y: 40, timeStamp: 1_040 }));
      result.current.markPalm(1, 1_040 + 5_000);
    });
    expect(removeStrokes).not.toHaveBeenCalled();
  });
```

Der Helfer `pointerEvent` in dieser Datei muss `width`, `height`, `clientX`, `clientY` und `timeStamp` durchreichen. Falls er das noch nicht tut, erweitere ihn:

```js
const pointerEvent = (phase, pointerId, pointerType, extra = {}) => ({
  pointerId,
  pointerType,
  timeStamp: extra.timeStamp ?? 1_000,
  width: extra.size ?? 0,
  height: extra.size ?? 0,
  clientX: extra.x ?? 0,
  clientY: extra.y ?? 0,
  currentTarget: {},
  nativeEvent: {},
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/useInkPointer.test.js`
Expected: FAIL — `result.current.markPalm is not a function`

- [ ] **Step 3: Implementierung**

In `src/hooks/useInkPointer.js`:

Neben den bestehenden Refs ergänzen:

```js
  const draftPointerIdRef = useRef(null);
  // Committed touch strokes stay revocable for a moment: on a device with no
  // digitizer we only learn that a contact was a palm after the tip arrives,
  // which is after that palm's stroke has already been written down.
  const recentTouchStrokesRef = useRef([]);
```

In `startDraft` nach `draftOwnerRef.current = owner;`:

```js
    draftPointerIdRef.current = event.pointerId;
```

In `discardDraft` und `finalizeDraft` jeweils `draftPointerIdRef.current = null;` mit zurücksetzen — in `finalizeDraft` **vor** dem frühen `return`, aber den Wert vorher in einer lokalen Konstante sichern:

```js
  const finalizeDraft = useCallback(() => {
    const draft = draftRef.current;
    const owner = draftOwnerRef.current;
    const isStrokeEraser = strokeEraserRef.current;
    const pointerId = draftPointerIdRef.current;
    const pointerType = inputStateRef.current.drawingPointerType;
    draftRef.current = null;
    draftOwnerRef.current = null;
    draftPointerIdRef.current = null;
    strokeEraserRef.current = false;
    setDraftStroke(null);
    releaseCapture();
    // ... bestehender Rumpf bis current.commitStroke?.(draft);
    current.commitStroke?.(draft);
    if (pointerType === 'touch' && pointerId !== null) {
      recentTouchStrokesRef.current.push({
        strokeId: draft.id,
        pointerId,
        committedAt: now(),
      });
    }
  }, [releaseCapture]);
```

Hinweis: `inputStateRef.current.drawingPointerType` ist beim Aufruf von `finalizeDraft` bereits auf `null` gesetzt, weil `route(event, 'up')` vorher lief. Führe deshalb ein eigenes Ref:

```js
  const draftPointerTypeRef = useRef(null);
```
das in `startDraft` mit `event.pointerType` belegt und in `finalizeDraft`/`discardDraft` zurückgesetzt wird; `finalizeDraft` liest `draftPointerTypeRef.current` statt der Policy.

Zeitquelle und Widerruf oberhalb von `route` einfügen:

```js
  const now = () =>
    typeof performance?.now === 'function' ? performance.now() : Date.now();

  const revokeCommitted = useCallback((pointerIds, at) => {
    const window = palmGuard(optionsRef.current).retroWindowMs;
    const buffer = recentTouchStrokesRef.current;
    const doomed = buffer.filter(
      (entry) => pointerIds.includes(entry.pointerId) && at - entry.committedAt <= window,
    );
    recentTouchStrokesRef.current = buffer.filter(
      (entry) => at - entry.committedAt <= window && !doomed.includes(entry),
    );
    if (doomed.length > 0) {
      optionsRef.current.removeStrokes?.(doomed.map((entry) => entry.strokeId));
    }
  }, []);
```

In `route`, direkt nach `inputStateRef.current = routed.state;`:

```js
    if (routed.state.retroBlockedPointerIds.length > 0) {
      revokeCommitted(routed.state.retroBlockedPointerIds, now());
    }
```

`route` bekommt dadurch `revokeCommitted` in die Dependency-Liste.

`markPalm` in das Rückgabeobjekt aufnehmen:

```js
    markPalm: (pointerId, timeStamp) => {
      const routed = reducePointerInput(
        inputStateRef.current,
        { pointerId, pointerType: 'touch', timeStamp, phase: 'cancel' },
        optionsRef.current.inputMode || 'stylus',
        palmGuard(optionsRef.current),
      );
      inputStateRef.current = routed.state;
      if (draftPointerIdRef.current === pointerId) discardDraft();
      revokeCommitted([pointerId], now());
    },
```

`reset` zusätzlich `recentTouchStrokesRef.current = []` setzen; ebenso im Dokumentwechsel-Block oben im Hook.

- [ ] **Step 4: Tests laufen lassen, Erfolg prüfen**

Run: `npx vitest run tests/useInkPointer.test.js`
Expected: PASS

- [ ] **Step 5: Gesamte Suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useInkPointer.js tests/useInkPointer.test.js
git commit -m "feat(ink): take back ink a contact drew before it was recognised as a palm"
```

---

## Task 5: Profil, Persistenz und Slider-Skalierung

**Files:**
- Modify: `src/ink/palmSettings.js`
- Create: `tests/palmSettings.test.js`

**Interfaces:**
- Consumes: `PALM_GUARD_DEFAULTS` aus `src/ink/inputPolicy.js`.
- Produces: `PALM_PROFILE_DEFAULTS` erweitert um `measured: null`, `sawPenPointer: false`, `passiveStylus: true`; `palmGuardFromProfile(profile)` liefert zusätzlich `penMaxPx`, `restingPx`, `restingMs`, `pinchMinSeparationPx`, `retroWindowMs`, `sizeChannel`, `geometryUsable`, `passiveStylus`; neu `markPenSeen(storage)`.

- [ ] **Step 1: Test schreiben**

Datei `tests/palmSettings.test.js`:

```js
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PALM_PROFILE_DEFAULTS,
  loadPalmProfile,
  markPenSeen,
  palmGuardFromProfile,
  savePalmProfile,
} from '../src/ink/palmSettings.js';

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
};

describe('palm profile', () => {
  it('fills defaults in for a profile stored before the new fields existed', () => {
    const storage = memoryStorage();
    storage.setItem('notes.palmGuard', JSON.stringify({ detectionStrength: 20 }));
    const profile = loadPalmProfile(storage);
    expect(profile.detectionStrength).toBe(20);
    expect(profile.passiveStylus).toBe(true);
    expect(profile.measured).toBe(null);
  });

  it('prefers a measured threshold over the slider default', () => {
    const guard = palmGuardFromProfile({
      ...PALM_PROFILE_DEFAULTS,
      detectionStrength: 50,
      measured: { palmContactPx: 40, penMaxPx: 16, sizeChannel: 'geometry', geometryUsable: true },
    });
    expect(guard.palmContactPx).toBe(40);
    expect(guard.penMaxPx).toBe(16);
  });

  it('lets the strength slider scale a measured threshold by ±25 percent', () => {
    const measured = { palmContactPx: 40, penMaxPx: 16, sizeChannel: 'geometry', geometryUsable: true };
    const loose = palmGuardFromProfile({ ...PALM_PROFILE_DEFAULTS, detectionStrength: 0, measured });
    const tight = palmGuardFromProfile({ ...PALM_PROFILE_DEFAULTS, detectionStrength: 100, measured });
    expect(loose.palmContactPx).toBe(50);
    expect(tight.palmContactPx).toBe(30);
  });

  it('turns the size layer off when calibration found no usable channel', () => {
    const guard = palmGuardFromProfile({
      ...PALM_PROFILE_DEFAULTS,
      measured: { geometryUsable: false, sizeChannel: 'none' },
    });
    expect(guard.geometryUsable).toBe(false);
    expect(guard.sizeChannel).toBe('none');
  });

  it('remembers that this device has a real pen', () => {
    const storage = memoryStorage();
    markPenSeen(storage);
    expect(loadPalmProfile(storage).sawPenPointer).toBe(true);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/palmSettings.test.js`
Expected: FAIL — `markPenSeen is not a function`

- [ ] **Step 3: Implementierung**

In `src/ink/palmSettings.js`:

```js
export const PALM_PROFILE_DEFAULTS = {
  detectionStrength: 56,
  smallContacts: 56,
  contactWindow: 56,
  passiveStylus: true,
  // Written once by the calibration wizard; null means "never measured".
  measured: null,
  // Persisted so a tablet that does have a digitizer never falls back to the
  // passive-stylus path just because no pen has touched down yet this session.
  sawPenPointer: false,
};
```

`palmGuardFromProfile` erweitern:

```js
export function palmGuardFromProfile(profile) {
  const strength = clamp(profile?.detectionStrength, PALM_PROFILE_DEFAULTS.detectionStrength);
  const smallContacts = clamp(profile?.smallContacts, PALM_PROFILE_DEFAULTS.smallContacts);
  const contactWindow = clamp(profile?.contactWindow, PALM_PROFILE_DEFAULTS.contactWindow);
  const postPenGuardMs = Math.round(contactWindow * 6);
  const measured = profile?.measured ?? null;
  // A measured threshold beats a formula; the slider then trims it by a
  // quarter either way, because the hand that was calibrated is not always the
  // grip that is writing.
  const scale = 1.25 - strength * 0.005;
  const measuredOrDefault = (key, fallback) =>
    Number.isFinite(measured?.[key]) ? Math.round(measured[key] * scale) : fallback;
  return {
    ...PALM_GUARD_DEFAULTS,
    palmContactPx: measuredOrDefault('palmContactPx', Math.round(80 - strength * 0.62)),
    penMaxPx: measuredOrDefault('penMaxPx', PALM_GUARD_DEFAULTS.penMaxPx),
    palmLatchMs: Math.round(smallContacts * 4),
    postPenGuardMs,
    penProximityMs: postPenGuardMs * 2,
    geometryUsable: measured ? measured.geometryUsable !== false : PALM_GUARD_DEFAULTS.geometryUsable,
    sizeChannel: measured?.sizeChannel ?? PALM_GUARD_DEFAULTS.sizeChannel,
    passiveStylus: profile?.passiveStylus !== false,
  };
}
```

`markPenSeen` ergänzen:

```js
export function markPenSeen(storage = globalThis.localStorage) {
  const profile = loadPalmProfile(storage);
  if (profile.sawPenPointer) return profile;
  const next = { ...profile, sawPenPointer: true };
  savePalmProfile(next, storage);
  return next;
}
```

`savePalmProfile` muss das ganze Profil schreiben, nicht nur die drei Slider — prüfe die Aufrufstelle in `src/components/Settings.jsx:47` und ergänze dort die übrigen Felder aus dem geladenen Profil, damit `measured` und `sawPenPointer` nicht bei jeder Slider-Bewegung verloren gehen:

```js
  useEffect(() => {
    savePalmProfile({
      ...loadPalmProfile(),
      detectionStrength,
      smallContacts,
      contactWindow,
    });
  }, [detectionStrength, smallContacts, contactWindow]);
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `npx vitest run tests/palmSettings.test.js`
Expected: PASS (5 Tests)

- [ ] **Step 5: `sawPenPointer` in die Policy einspeisen**

In `src/hooks/useInkPointer.js` den Startzustand aus dem Profil ziehen und beim ersten echten Pen-Event persistieren:

```js
import { loadPalmProfile, markPenSeen } from "../ink/palmSettings.js";

  const inputStateRef = useRef(
    createInputState({ sawPenPointer: loadPalmProfile().sawPenPointer === true }),
  );
```

In `route`, nach `inputStateRef.current = routed.state;`:

```js
    if (event.pointerType === 'pen' && !inputStateRef.current.sawPenPointer) markPenSeen();
```

Achtung: `sawPenPointer` wird im Reducer bereits auf `true` gesetzt, bevor diese Zeile läuft. Prüfe deshalb den vorherigen Wert:

```js
    const hadPen = inputStateRef.current.sawPenPointer;
    inputStateRef.current = routed.state;
    if (!hadPen && routed.state.sawPenPointer) markPenSeen();
```

Beim Dokumentwechsel ebenfalls den Seed übergeben:

```js
    inputStateRef.current = createInputState({
      sawPenPointer: inputStateRef.current.sawPenPointer,
    });
```

- [ ] **Step 6: Gesamte Suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/ink/palmSettings.js src/hooks/useInkPointer.js src/components/Settings.jsx tests/palmSettings.test.js
git commit -m "feat(ink): let a measured palm profile outrank the slider defaults"
```

---

## Task 6: Kalibrierungs-Assistent, der wirklich misst

Ersetzt den bestehenden Assistenten in `src/components/Settings.jsx` (Zeilen 713–795), der heute nur einen Toast zeigt.

**Files:**
- Modify: `src/components/Settings.jsx`
- Create: `tests/Settings.calibration.test.jsx`

**Interfaces:**
- Consumes: `createProbe`, `recordSample`, `summarizeSamples`, `deriveProfileFromCalibration` (Task 1); `loadPalmProfile`, `savePalmProfile` (Task 5).
- Produces: keine neue exportierte API; schreibt `measured` ins Profil.

- [ ] **Step 1: Test schreiben**

Datei `tests/Settings.calibration.test.jsx`:

```jsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Settings from '../src/components/Settings.jsx';
import { loadPalmProfile } from '../src/ink/palmSettings.js';

const stroke = (element, sizes) => {
  sizes.forEach((size, index) => {
    fireEvent.pointerDown(element, {
      pointerId: 1, pointerType: 'touch', width: size, height: size,
      clientX: index * 5, clientY: 0, pressure: 0.5,
    });
    fireEvent.pointerMove(element, {
      pointerId: 1, pointerType: 'touch', width: size, height: size,
      clientX: index * 5 + 3, clientY: 0, pressure: 0.5,
    });
    fireEvent.pointerUp(element, { pointerId: 1, pointerType: 'touch' });
  });
};

describe('palm calibration wizard', () => {
  it('writes measured thresholds into the profile', () => {
    render(<Settings onBack={() => {}} />);
    fireEvent.click(screen.getByTestId('recalibrate-btn'));

    stroke(screen.getByTestId('calibration-surface'), [8, 9, 10, 11, 12]);
    fireEvent.click(screen.getByTestId('calibration-next'));

    stroke(screen.getByTestId('calibration-surface'), [50, 55, 60, 65, 70]);
    fireEvent.click(screen.getByTestId('calibration-finish'));

    const measured = loadPalmProfile().measured;
    expect(measured.geometryUsable).toBe(true);
    expect(measured.palmContactPx).toBeGreaterThan(measured.penMaxPx);
  });

  it('reports honestly when the panel cannot separate pen from palm', () => {
    render(<Settings onBack={() => {}} />);
    fireEvent.click(screen.getByTestId('recalibrate-btn'));

    stroke(screen.getByTestId('calibration-surface'), [33, 33, 33, 33]);
    fireEvent.click(screen.getByTestId('calibration-next'));

    stroke(screen.getByTestId('calibration-surface'), [33, 33, 33, 33]);
    fireEvent.click(screen.getByTestId('calibration-finish'));

    expect(loadPalmProfile().measured.geometryUsable).toBe(false);
    expect(screen.getByTestId('calibration-result')).toHaveTextContent(/nicht/i);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/Settings.calibration.test.jsx`
Expected: FAIL — `Unable to find an element by: [data-testid="calibration-surface"]`

- [ ] **Step 3: Implementierung**

In `src/components/Settings.jsx` den Assistenten-State ersetzen:

```js
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState(1);
  const [calibrationResult, setCalibrationResult] = useState(null);
  const penProbeRef = useRef(createProbe());
  const palmProbeRef = useRef(createProbe());

  const startCalibration = () => {
    penProbeRef.current = createProbe();
    palmProbeRef.current = createProbe();
    setCalibrationResult(null);
    setCalibrationStep(1);
    setIsCalibrating(true);
  };

  const recordCalibration = (event, phase) => {
    const probe = calibrationStep === 1 ? penProbeRef.current : palmProbeRef.current;
    recordSample(
      probe,
      {
        phase,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        timeStamp: event.timeStamp,
        width: event.width,
        height: event.height,
        pressure: event.pressure,
      },
      calibrationStep === 1 ? 'pen' : 'palm',
    );
  };

  const finishCalibration = () => {
    const measured = deriveProfileFromCalibration(
      summarizeSamples(penProbeRef.current, 'pen'),
      summarizeSamples(palmProbeRef.current, 'palm'),
    );
    savePalmProfile({ ...loadPalmProfile(), measured });
    setCalibrationResult(measured);
  };
```

Den Button aus Zeile 302 (`data-testid="recalibrate-btn"`) auf `startCalibration` verdrahten.

Das Modal ersetzen durch:

```jsx
          {isCalibrating && (
            <div className="settings-modal-overlay">
              <div className="settings-modal-card" style={{ width: 440 }}>
                <h3 style={{ margin: 0, color: "#FFFFFF" }}>Handballen-Kalibrierung</h3>
                <p style={{ color: "#FFFFFF", fontSize: 12 }}>
                  {calibrationStep === 1
                    ? "Schritt 1 von 2: Schreibe mit dem Stylus, halte die Hand dabei in der Luft."
                    : "Schritt 2 von 2: Lege die Schreibhand flach auf, ohne zu schreiben."}
                </p>
                <div
                  data-testid="calibration-surface"
                  style={{
                    height: 200,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,.15)",
                    background: "#08080A",
                    touchAction: "none",
                  }}
                  onPointerDown={(event) => recordCalibration(event, "down")}
                  onPointerMove={(event) => recordCalibration(event, "move")}
                  onPointerUp={(event) => recordCalibration(event, "up")}
                />
                {calibrationResult && (
                  <p data-testid="calibration-result" style={{ color: "#FFFFFF", fontSize: 12 }}>
                    {calibrationResult.geometryUsable
                      ? `Getrennt bei ${calibrationResult.palmContactPx} px (Kanal: ${calibrationResult.sizeChannel}).`
                      : "Dieses Display meldet für Stift und Handballen dieselben Werte. Die Größenerkennung wird deshalb nicht verwendet; der Schutz läuft über Bewegung und rückwirkende Korrektur."}
                  </p>
                )}
                {calibrationStep === 1 ? (
                  <button
                    data-testid="calibration-next"
                    className="settings-action-btn"
                    onClick={() => setCalibrationStep(2)}
                  >
                    Weiter
                  </button>
                ) : (
                  <button
                    data-testid="calibration-finish"
                    className="settings-action-btn"
                    onClick={finishCalibration}
                  >
                    Kalibrierung abschließen
                  </button>
                )}
                <button className="settings-action-btn" onClick={() => setIsCalibrating(false)}>
                  Schließen
                </button>
              </div>
            </div>
          )}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `npx vitest run tests/Settings.calibration.test.jsx`
Expected: PASS (2 Tests)

- [ ] **Step 5: Gesamte Suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/Settings.jsx tests/Settings.calibration.test.jsx
git commit -m "feat(settings): make palm calibration measure the panel instead of pretending"
```

---

## Task 7: Gesten-Ebene respektiert das Handballen-Urteil

**Files:**
- Modify: `src/components/DocumentView.jsx`
- Modify: `tests/DocumentView.test.jsx` (anhängen)

**Interfaces:**
- Consumes: `inkPointer.markPalm` (Task 4), `pinchMinSeparationPx` im Guard (Task 3).

- [ ] **Step 1: Test schreiben**

An `tests/DocumentView.test.jsx` anhängen (Render-Helfer der Datei wiederverwenden):

```jsx
  it('drops a cancelled touch out of the gesture set instead of leaving it pinching', async () => {
    const { container } = renderDocumentView();
    const page = container.querySelector('.document-page');

    fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, width: 20, height: 20 });
    fireEvent.pointerDown(page, { pointerId: 2, pointerType: 'touch', clientX: 400, clientY: 300, width: 20, height: 20 });
    fireEvent.pointerCancel(page, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    fireEvent.pointerMove(page, { pointerId: 2, pointerType: 'touch', clientX: 500, clientY: 300, width: 20, height: 20 });

    // With one contact withdrawn there is no pair left, so nothing may zoom.
    expect(container.querySelector('.document-page').style.transform || '').not.toMatch(/scale\((?!1\)).*\)/);
  });
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `npx vitest run tests/DocumentView.test.jsx`
Expected: FAIL beim neuen Fall (der abgebrochene Kontakt bleibt in `activePointers`).

- [ ] **Step 3: Implementierung**

In `src/components/DocumentView.jsx` in `handlePointerCancel` (ab Zeile 1684) für Touch-Kontakte das Betriebssystem-Urteil weiterreichen und den Kontakt aus der Gestenmenge nehmen:

```js
  const handlePointerCancel = (e) => {
    // Android withdraws a contact it classified as a palm. That verdict beats
    // anything we compute here, so it has to reach the ink layer too — not
    // just drop the gesture.
    if (e.pointerType === "touch") {
      inkPointer.markPalm?.(e.pointerId, e.timeStamp);
      if (activePointers.current.has(e.pointerId)) handleGestureEnd(e);
    }
    // ... bestehende Zweige unverändert
  };
```

Sicherstellen, dass `onPointerCancel={handlePointerCancel}` auch auf dem Scroll-Container hängt, der die Gesten führt (falls dort bislang nur `handleGestureEnd` gebunden ist, beide aufrufen).

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `npx vitest run tests/DocumentView.test.jsx`
Expected: PASS

- [ ] **Step 5: Gesamte Suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/DocumentView.jsx tests/DocumentView.test.jsx
git commit -m "fix(document): honour an OS pointer cancel as a palm verdict in gestures"
```

---

## Task 8: Verifikation auf dem SM-T505 und Nachjustierung

Diese Task hat keinen Unit-Test — sie ist die Messung, ohne die der Rest nur plausibel statt richtig ist.

**Files:**
- Create: `docs/superpowers/verification/2026-09-01-sm-t505-palm-results.md`
- Ggf. Modify: `src/ink/contactClassifier.js` (Default-Werte), `src/ink/palmSettings.js`

- [ ] **Step 1: Bauen und installieren**

```bash
npm run build && npx cap sync android && npx cap run android
```

- [ ] **Step 2: Kalibrierung auf dem Gerät ausführen**

Einstellungen → Palm-Schutz → "Neu kalibrieren", beide Schritte durchführen. Ergebnistext notieren.

- [ ] **Step 3: Sechs Szenarien durchgehen und protokollieren**

| # | Szenario | Erwartung |
|---|---|---|
| 1 | Hand auflegen, dann mit Stylus schreiben | Stiftstrich erscheint, kein Handballen-Strich bleibt stehen |
| 2 | Hand **zuerst** auflegen, 1 s warten, dann schreiben | Ein eventuell entstandener Handballen-Strich verschwindet beim Aufsetzen des Stylus |
| 3 | Hand auflegen ohne zu schreiben, 2 s ruhen | Kein Strich, kein Scrollen |
| 4 | Zwei Finger spreizen und zoomen | Zoom funktioniert |
| 5 | Am Rand mit ruhendem Handballen | Kein Scrollen |
| 6 | Mit einem Finger schreiben im Fingermodus | Funktioniert weiterhin |

- [ ] **Step 4: Nachjustieren**

Bei Fehlverhalten **nicht** die Logik ändern, sondern zuerst die Schwellen:
- Handballen zeichnet weiter → `detectionStrength`-Slider erhöhen (skaliert `palmContactPx` und `penMaxPx` nach unten).
- Stylus zeichnet nicht mehr → `detectionStrength` senken; bleibt es dabei, in der Diagnose prüfen, ob die Stiftspitze überhaupt unter `penMaxPx` gemeldet wird.
- Handballen erzeugt kurze Punkte, die bleiben → `restingMs` in `CONTACT_DEFAULTS` senken (z. B. 160) oder `restingPx` erhöhen.
- Zoom bricht ab → `pinchMinSeparationPx` senken.
- Handballen-Striche verschwinden zu spät oder gar nicht → `retroWindowMs` erhöhen.

- [ ] **Step 5: Ergebnisse dokumentieren und committen**

Ergebnisse (inklusive der endgültigen Schwellwerte) in `docs/superpowers/verification/2026-09-01-sm-t505-palm-results.md` festhalten.

```bash
git add docs/superpowers/verification/2026-09-01-sm-t505-palm-results.md src/ink
git commit -m "docs(verification): record palm rejection results and tuned thresholds on SM-T505"
```

---

## Bekannte Grenzen (bewusst so gebaut)

- **Ein einzelner ruhender Handballen zeichnet bis zu `restingMs` (220 ms) einen kurzen Strich, der danach wieder verschwindet.** Das ist der Preis dafür, dass ein echter Strich ohne Verzögerung beginnt. Ein Aufschub des Zeichnens um 220 ms würde das Aufblitzen vermeiden, aber jeden Strich spürbar träge machen. Wechsel dorthin nur, wenn das Aufblitzen im Test stört.
- **Ohne nutzbare Kontaktgeometrie fällt der Schutz auf Bewegung plus rückwirkende Korrektur zurück.** Das ist deutlich schwächer als eine Größenschwelle. Es ist eine Eigenschaft des Panels, keine der Implementierung — Task 1 macht diesen Fall sichtbar, statt ihn zu verschleiern.
- **Kein natives Android-Modul.** `TOOL_TYPE_PALM` gibt es erst ab API 33, das Zielgerät läuft auf API 31, und `getToolType()` meldet für einen passiven Stylus ohnehin `TOOL_TYPE_FINGER`. Eine native Schicht würde hier nichts hinzufügen, was der WebView nicht schon liefert.
