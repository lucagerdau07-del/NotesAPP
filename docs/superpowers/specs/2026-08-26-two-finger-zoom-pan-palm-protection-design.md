# Spezifikation: 2-Finger-Zoom & Verschieben mit integriertem Handballen-Schutz

## 1. Übersicht & Ziel
Diese Spezifikation beschreibt das Verhalten und die technische Architektur für das Zoomen und Verschieben (Pan) von Dokumenten mit zwei Fingern in der Notizen-App. Das System verhindert zuverlässig Fehlbedienungen durch aufliegende Handballen (Palm Rejection) sowohl beim Schreiben mit dem Stylus als auch bei Touch-Interaktionen.

---

## 2. Detailliertes Verhalten & Interaktionsregeln

### 2.1 Stift-Eingabe (Stylus / Active Pen)
* **Höchste Priorität:** Sobald ein Stylus (`pointerType === 'pen'`) auf dem Bildschirm aufgesetzt wird (`down`), besitzt er die ausschließliche Schreib-Berechtigung.
* **Handballen-Blockade während des Schreibens:** Während ein Stiftstrich aktiv ist (`drawingPointerType === 'pen'`), werden alle gleichzeitigen Touch-Ereignisse (Finger, Handballen) auf dem gesamten Bildschirm ignoriert (`intent: 'ignore'`). Es wird kein Zoomen, kein Verschieben und kein Rand-Scrollen ausgelöst.
* **Schutz nach dem Absetzen:** Wenn kurz zuvor ein Stift aktiv war, werden versehentliche Touch-Ereignisse durch ruhende Handballen am Rand abgefangen.

### 2.2 Finger-Eingabe auf der Dokumentfläche (`pointerType === 'touch'`)
* **1-Finger-Interaktion:**
  * Ein einzelner Finger auf der Dokumentfläche dient im Standard-/Fingermodus als Stiftwerkzeug und startet das Zeichnen (`intent: 'start-draw'`).
  * Ein einzelner Finger auf der Dokumentfläche verschiebt das Dokument **nicht** (verhindert, dass ein aufliegender Handballen die Seite verschiebt).
* **2-Finger-Interaktion (Zoom & Pan):**
  * Sobald ein 2. Finger den Bildschirm berührt, wird ein eventuell begonnener 1-Finger-Strich sofort verworfen (`intent: 'cancel-draw'`).
  * Das System wechselt in den Gesten-Modus:
    * **Pan (Verschieben):** Der Mittelpunkt (Centroid) der beiden Finger steuert die X- und Y-Verschiebung des Dokuments.
    * **Pinch-to-Zoom:** Die Distanzänderung der beiden Finger skaliert das Dokument stufenlos (von 50 % bis 300 %) bezogen auf den Mittelpunkt.
* **Release-Schutz beim Beenden der Geste:**
  * Wenn nach einer 2-Finger-Geste ein Finger abgehoben wird, verbleibt das System im Navigationszustand. Es wird kein Strich mit dem verbleibenden Finger gezeichnet, bis alle Finger vollständig abgehoben wurden (`activePointers.size === 0`).

### 2.3 Randbereich außerhalb des Dokuments (Margin Gutter)
* **1-Finger-Scrollen am Rand:**
  * Startet ein Touch-Event im Randbereich (außerhalb der Dokumentgrenzen), kann der Benutzer die Seite vertikal scrollen.
* **Handballen-Schutz am Rand:**
  * **Bewegungsschwelle (Drag-Threshold):** Ein ruhender Handballen am Rand löst kein Scrollen aus. Das Scrollen startet erst, wenn eine bewusste Bewegung von mehr als 15 px vertikal registriert wird.
  * **Stift-Sperre:** Wenn ein Stift auf dem Bildschirm liegt, ist auch das Scrollen am Rand vollständig blockiert.

---

## 3. Technische Komponenten & Architektur

### 3.1 Input Policy (`src/ink/inputPolicy.js`)
* Erweiterung des Input-State-Reducers zur Unterstützung dynamischer Stift- vs. Finger-Erkennung.
* Robuste Handhabung von `pointerType === 'pen'` mit Palm-Unterdrückung (`intent: 'ignore'`).
* Schnelles Abbrechen von Ein-Finger-Zeichenversuchen bei Mehrfachberührung (`cancel-draw`).

### 3.2 Gesten-Controller in `DocumentView.jsx`
* Erfassung aktiver Pointer über `activePointers` Map.
* Berechnung des Mittelpunkts `(x1 + x2)/2, (y1 + y2)/2` und der Distanz `hypot(dx, dy)`.
* Gleichzeitige Aktualisierung von `zoom` und `scrollContainer.scrollLeft / scrollTop`.
* Synchronisation mit der `focusBox` (sofern im Split-Screen aktiv).
* Margin-Detektor: Unterscheidung, ob `pointerdown` innerhalb oder außerhalb von `containerRef` (`document-page`) stattfand.

---

## 4. Test- & Validierungsplan

### 4.1 Automatisierte Tests (Vitest)
1. `inputPolicy.test.js`:
   * Stylus-Down gefolgt von Touch-Down/Move/Up blockiert alle Touches und behält den Stiftstrich.
   * Single-Touch startet Zeichnen; zweiter Touch löst `cancel-draw` aus und schaltet auf Gesten um.
   * Nach Gesten-Ende wird erst bei vollständigem Release wieder Zeichnen freigegeben.
2. `DocumentView.test.jsx`:
   * 2-Finger-Pinch skaliert und verschiebt das Dokument.
   * 1-Finger auf Dokumentfläche verschiebt das Dokument nicht.
   * 1-Finger im Randbereich scrollt nach Überschreiten des Schwellenwerts (15 px).
   * Palm-Touch am Rand während Stift-Aktivität löst kein Scrollen aus.

---

## 5. Review & Freigabe
* Status: **Bereit zur Implementierung**
