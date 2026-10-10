# Spezifikation: Handballen-Schutz für passive Stylus-Eingabe (Galaxy Tab A7)

**Datum:** 2026-09-01
**Status:** Bereit zur Implementierung
**Ersetzt nicht, sondern erweitert:** `2026-08-26-two-finger-zoom-pan-palm-protection-design.md`

---

## 1. Ausgangslage und der harte Befund

Die Zielhardware ist ein **Samsung Galaxy Tab A7 (SM-T505), Android 12, One UI Core 4.1**, bedient mit einem **passiven kapazitiven Stylus** ("Standard-Touch-Stylus", Amazon).

Dieses Gerät besitzt **keinen Digitizer**. Daraus folgt technisch zwingend:

| Signal | Verfügbarkeit auf diesem Gerät |
|---|---|
| `pointerType === 'pen'` | **Nie.** Der Stylus meldet sich als `'touch'` (Android `TOOL_TYPE_FINGER`). |
| Hover / Proximity (`pointermove` ohne Kontakt) | **Nie.** Ein passiver Stift hat keine Feldkopplung ohne Berührung. |
| `pressure` (echter Druck) | **Nein.** Android liefert für kapazitive Panels einen aus der Kontaktfläche abgeleiteten Ersatzwert. |
| `tiltX` / `tiltY` / `twist` | **Nie.** Immer 0. |
| `width` / `height` (Kontaktgeometrie) | **Wahrscheinlich, aber unbestätigt.** Chrome leitet sie aus `MotionEvent.getTouchMajor/Minor` ab. Viele Panels melden hier eine Konstante. |
| `pointercancel` durch Android-Palm-Rejection | **Gelegentlich.** Android 12 kann Kontakte mit `FLAG_CANCELED` zurückziehen. |

**Konsequenz:** Die gesamte im aktuellen `src/ink/inputPolicy.js` implementierte Stift-Priorität (`penProximityMs`, `postPenGuardMs`, `drawingPointerType === 'pen'`) ist auf dieser Hardware **inaktiver Code**. Der Handballen-Schutz muss vollständig aus Signalen aufgebaut werden, die auch ein Finger liefert.

Der Code für echte Stifte wird **nicht entfernt** — er bleibt korrekt für ein späteres Gerät mit S Pen/USI —, aber er darf nicht länger die einzige Verteidigungslinie sein.

### 1.1 Der ehrliche Ceiling

Ein passiver Stylus ist für das Panel physikalisch ein kleiner Finger. Wenn das Panel des SM-T505 die Kontaktgeometrie **nicht** differenziert meldet (also für Stiftspitze, Fingerkuppe und Handballen denselben `width`-Wert liefert), ist eine geometriebasierte Trennung **unmöglich**. In diesem Fall bleiben nur die zeitlich-räumlichen Schichten (Election, Bewegungssignatur, retroaktive Rücknahme), die einen deutlich niedrigeren Genauigkeitsplafond haben.

**Deshalb ist Messung vor Implementierung Pflicht.** Task 1 des Plans ist eine Diagnose auf dem Gerät; ihr Ergebnis entscheidet, welche Schichten überhaupt scharf geschaltet werden. Eine Heuristik, die auf einem Signal aufbaut, das dieses Panel nicht liefert, ist keine Palm-Rejection, sondern ein stiller Fehlalarm.

---

## 2. Zielverhalten

### 2.1 Schreiben mit aufliegender Hand
Der Benutzer legt die Schreibhand vollflächig auf das Display und schreibt mit dem passiven Stylus. Es entstehen **keine** Handballen-Striche, **kein** ungewolltes Scrollen, **kein** ungewollter Zoom. Der Stylus-Strich selbst wird ohne spürbare Verzögerung gezeichnet.

Der Handballen setzt in der Praxis **vor** der Stiftspitze auf. Das System muss diesen Fall beherrschen: Ein bereits begonnener Handballen-Strich wird **rückwirkend entfernt**, sobald der Stylus-Kontakt erkannt wird.

### 2.2 Erkennungsprinzip: Kontakt-Election statt Stift-Priorität
Solange kein `pointerType === 'pen'` existiert, wählt das System unter den gleichzeitig aktiven Touch-Kontakten **einen einzigen Schreib-Kandidaten**:

* Der Kandidat ist der Kontakt mit der **kleinsten gemessenen Kontaktfläche**, sofern diese unter `penMaxPx` liegt.
* Alle anderen gleichzeitig aktiven Kontakte sind per Definition Handballen und werden blockiert.
* Erscheint während eines laufenden Strichs ein **kleinerer** Kontakt, wird der bisherige Kandidat rückwirkend als Handballen eingestuft, sein Strich entfernt und der neue Kontakt übernimmt.

### 2.3 Zwei-Finger-Zoom bleibt erhalten
Zwei Kontakte, die **beide** oberhalb der Fingerschwelle liegen und deren Abstand `pinchMinSeparationPx` überschreitet, gelten als bewusste Pinch-Geste und werden nicht als Handballen-Cluster verworfen. Ein Handballen erzeugt entweder einen einzelnen großen Fleck oder mehrere eng beieinanderliegende Flecken.

### 2.4 Ruhende Kontakte zeichnen nicht
Ein Kontakt, der innerhalb von `restingMs` weniger als `restingPx` Weg zurücklegt, ist eine aufliegende Hand, kein Schreibvorgang. Er wird blockiert; ein bereits erzeugtes Strichfragment wird entfernt.

### 2.5 Betriebssystem-Signale werden respektiert
Ein `pointercancel` für einen Touch-Kontakt wird als Handballen-Urteil des Betriebssystems gewertet: Der Kontakt wird blockiert, sein Strich rückwirkend entfernt und der Handballen-Latch aktiviert.

### 2.6 Kalibrierung misst statt zu behaupten
Der bestehende Kalibrierungs-Assistent in `src/components/Settings.jsx` zeigt heute nur einen Fortschritt und schreibt keine gemessenen Werte. Er wird durch eine echte Zwei-Phasen-Messung ersetzt:

1. **Phase Hand:** "Lege deine Schreibhand auf, ohne zu schreiben." — sammelt Kontaktflächen des Handballens.
2. **Phase Stift:** "Schreibe mit dem Stylus, Hand in der Luft." — sammelt Kontaktflächen der Stiftspitze.

Aus beiden Verteilungen werden `palmContactPx` und `penMaxPx` abgeleitet. Überlappen die Verteilungen zu stark (Trennschärfe unter 20 %), meldet der Assistent das offen und setzt `geometryUsable: false`; der Schutz läuft dann ohne Größenschicht weiter.

---

## 3. Technische Architektur

### 3.1 `src/ink/pointerProbe.js` (neu)
Reine Funktionen zum Aufzeichnen roher Pointer-Felder und zum Verdichten zu einer Statistik. Beantwortet auf dem echten Gerät: Welche Signale liefert dieses Panel überhaupt? Liefert außerdem die Ableitung eines Profils aus zwei Kalibrierungsstichproben.

### 3.2 `src/ink/contactClassifier.js` (neu)
Reiner, zustandsbehafteter Klassifikator pro Kontakt: Größe (Maximum über die Lebensdauer), zurückgelegter Weg, Alter, Election des kleinsten Kandidaten, Urteil `pen-candidate | palm | finger`. Bewusst getrennt von `inputPolicy.js`, damit der Reducer dort seine bestehende Verantwortung (Zeichenbesitz, Gesten-Lock) behält.

### 3.3 `src/ink/inputPolicy.js` (Erweiterung)
Bindet den Klassifikator ein, führt eine Liste `retroBlockedPointerIds` (Kontakte, die nachträglich als Handballen erkannt wurden) und unterstützt den Modus `passiveStylus`, in dem der gewählte Kandidat im Stylus-Modus zeichnen darf.

### 3.4 `src/hooks/useInkPointer.js` (Erweiterung)
Führt einen kurzen Ringpuffer der zuletzt festgeschriebenen Touch-Striche (`{ strokeId, committedAt }`). Wird ein Kontakt nachträglich als Handballen eingestuft, werden der laufende Entwurf und die im Rückblickfenster `retroWindowMs` festgeschriebenen Striche über die bestehende Funktion `removeStrokes` entfernt. **Kein Schema-Feld am Strich**, damit keine Migration nötig ist.

### 3.5 `src/ink/palmSettings.js` (Erweiterung)
Profil um `penMaxPx`, `restingPx`, `restingMs`, `retroWindowMs`, `pinchMinSeparationPx`, `geometryUsable`, `sizeChannel` und `passiveStylus` erweitert; Laden/Speichern bleibt `localStorage` unter `notes.palmGuard`.

### 3.6 `src/components/Settings.jsx` (Erweiterung)
Echter Kalibrierungs-Assistent plus eine Diagnose-Ansicht, die die Probe-Statistik lesbar anzeigt.

### 3.7 `src/components/DocumentView.jsx` (Erweiterung)
`pointercancel` setzt den Handballen-Latch; die Pinch-Erkennung berücksichtigt `pinchMinSeparationPx`.

---

## 4. Nicht-Ziele

* **Kein nativer Capacitor-Plugin-Layer.** Da der Stylus für Android ohnehin `TOOL_TYPE_FINGER` ist, liefert die native Ebene kein zusätzliches Wahrheitssignal. `TOOL_TYPE_PALM` existiert erst ab API 33; das Gerät läuft auf API 31.
* **Keine Änderung am Ink-Schema.** Retroaktive Rücknahme läuft über einen flüchtigen Puffer im Hook.
* **Keine Handedness-Zone.** Ohne bekannte Stiftposition vor dem ersten Kontakt bringt eine Ellipse um die Schreibhand nichts, was die Election nicht schon abdeckt.

---

## 5. Akzeptanzkriterien

1. Auf dem SM-T505 liegt eine Messung vor, die für Stiftspitze, Fingerkuppe und Handballen die tatsächlich gelieferten `width`/`height`/`pressure`-Bereiche dokumentiert.
2. Im Stylus-Modus zeichnet auf diesem Gerät der passive Stylus (bisher: gar nichts, da kein `pen`-Pointer existiert).
3. Ein Handballen, der vor der Stiftspitze aufsetzt und bereits einen Strich erzeugt hat, hinterlässt nach dem Aufsetzen des Stylus keine Spur mehr.
4. Ein ruhender Kontakt über `restingMs` erzeugt keinen Strich.
5. Zwei-Finger-Zoom funktioniert weiterhin.
6. Der Kalibrierungs-Assistent schreibt gemessene Werte in das Profil und meldet offen, wenn die Geometrie auf diesem Panel nicht trennscharf ist.
7. Die bestehende Stift-Priorität bleibt für echte `pen`-Pointer unverändert wirksam (Regressionstests grün).
