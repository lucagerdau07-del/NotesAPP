# Spezifikation: Intelligente KI-Datenverwaltung

## 1. Übersicht & Ziel

Fertiggestellte Notizen werden zweimal täglich von einem Vision-Modell gelesen.
Das Modell sucht darin nach drei Dingen: Hausaufgaben, Klausurterminen und neuen
Fachbegriffen. Termine landen in einem Kalender, Begriffe in einem Glossar. Aus
beidem und dem bereits vorhandenen WebUntis-Stundenplan entsteht ein Lernplan,
der die Tage des Benutzers verplant.

Leitprinzip: **Zeitregeln sind Code, Inhalte sind Modell.** Wie viele Minuten
ein Tag bekommt, rechnet eine reine Funktion. Was in diesen Minuten passiert,
füllt das Sprachmodell. Ein LLM hält Minutenbudgets nicht zuverlässig ein; eine
Funktion kann sie nicht verletzen.

### 1.1 Abgrenzung

Nicht Teil dieser Spezifikation:

* **Importierte Dokumente** (PDF, Bild) werden nicht gescannt. Der Scan liest
  ausschließlich selbst erstellte Ink-Notizen über `renderNotePagesOf`.
  Importierte Dokumente haben ihren eigenen Renderpfad (`pdfRuntime`,
  `imageRuntime`) und brauchen einen eigenen Snapshot-Weg — ein eigener Schritt,
  nachdem der Scan für Ink-Notizen steht.
* Push-Benachrichtigungen, Weckerfunktionen, Widgets.
* Synchronisierung zwischen Geräten. Alle Daten liegen lokal.
* Kalender-Export (`.ics`) oder Anbindung an einen externen Kalenderdienst.
* Wiederholungsalgorithmen (Spaced Repetition, Karteikarten). Das Glossar ist
  ein Nachschlagewerk, kein Lernsystem.
* Änderungen am Hugging-Face-Space. Der bestehende Proxy kann bereits alles,
  was gebraucht wird (Abschnitt 3.2).

---

## 2. Benutzerverhalten

### 2.1 Der Scan passiert unsichtbar

Der Benutzer markiert nichts und drückt nichts. Er schreibt seine Notiz zu Ende
und legt das Tablet weg. Beim nächsten Öffnen der Bibliothek prüft die App, ob
ein Scan fällig ist, und arbeitet ihn im Hintergrund ab.

Eine Notiz ist scanfällig, wenn beides gilt:

* sie wurde seit dem letzten Scan bearbeitet (`updatedAt > lastScannedAt`), und
* die letzte Bearbeitung liegt mindestens **zwei Stunden** zurück.

Die zweite Bedingung ist die Definition von „fertiggestellt". Sie verhindert,
dass eine Notiz mitten im Schreiben gescannt wird, und braucht dafür keine neue
Geste vom Benutzer.

Ein Scanlauf startet höchstens zweimal täglich: er läuft nur, wenn seit dem
letzten Lauf eine der Slotgrenzen **15:00** oder **21:00** (Ortszeit)
überschritten wurde. Öffnet der Benutzer die App zehnmal am Nachmittag, läuft
der Scan trotzdem nur einmal.

Wird eine bereits gescannte Notiz später ergänzt, wird sie erneut gescannt. Die
Funde werden dabei zusammengeführt, nicht verdoppelt (Abschnitt 4.3).

### 2.2 Kalender

Die Bibliothek zeigt links unten anstelle der bisherigen `Neuigkeiten`-Attrappe
eine Karte **„Anstehend"**: alle offenen Hausaufgaben und Klausuren der nächsten
14 Tage, nach Fälligkeit sortiert, mit Fach und Quellnotiz. Ein Tippen hakt
einen Eintrag ab; abgehakte Einträge verschwinden aus der Liste, bleiben aber
gespeichert, damit ein erneuter Scan sie nicht wieder aufleben lässt.

### 2.3 Glossar und Lernplan

Ein neuer Bildschirm **„Plan"** — neben `library`, `editor` und `settings` in
`App.jsx` — zeigt zwei Bereiche:

* **Lernplan:** die kommenden sieben Tage. Pro Tag das Minutenbudget und die
  Blöcke, die das Modell hineingelegt hat (Fach, Aufgabe, Minuten). Mittwoch
  steht ausdrücklich als „Freier Tag — Lernzeit in der Schule" da, nicht als
  leere Lücke.
* **Glossar:** alle gefundenen Begriffe mit Definition, Fach und Quellnotiz.
  Durchsuchbar, nach Fach filterbar.

Der Plan wird neu erzeugt, wenn der Bildschirm geöffnet wird und der gespeicherte
Plan nicht von heute ist. Ein Knopf erzwingt eine Neuberechnung.

### 2.4 Einstellungen

Unter `KI & Netzwerk` kommen hinzu:

* Schalter **„Notizen automatisch auswerten"** (Standard: an).
* Knopf **„Jetzt auswerten"**, der Slotgrenze und Ruhezeit übergeht.
* Eine Statuszeile: Zeitpunkt des letzten Laufs, Anzahl gescannter Notizen,
  gegebenenfalls die letzte Fehlermeldung.

---

## 3. Architektur

### 3.1 Wo der Scan läuft

Im Client, nicht auf dem Server. Die Notizen liegen ausschließlich lokal
(`localStorage` über `inkRepository`); ein serverseitiger Cron müsste sie erst
hochladen und bräuchte Speicher, Authentifizierung und Rücksync. Der Client hat
die Daten bereits und rendert sie ohnehin schon.

Der Preis: der Scan läuft nur, wenn die App geöffnet wird. Für eine App, die
täglich in der Schule benutzt wird, ist das ausreichend.

### 3.2 Der bestehende Proxy genügt

`server.js` des Space wählt das Modell selbst:

```js
const NOTES_VISION_MODEL = 'deepseek/deepseek-v4-flash-vision-exp';
const hasImage = messages.some(
  (message) => Array.isArray(message.content) &&
    message.content.some((part) => part?.type === 'image_url'),
);
```

Schickt der Client `content` als Array mit `image_url`-Teilen, routet der Space
selbstständig auf das Vision-Modell; reiner Text geht an das Textmodell. Es ist
**keine Änderung am Backend nötig**. `requestCompletion` reicht `messages`
unverändert durch und muss ebenfalls nicht angefasst werden.

Zwei Grenzen des Proxys sind einzuhalten:

* höchstens 60 Nachrichten pro Anfrage — der Scan schickt zwei;
* der Scan darf keine `tools` senden. Ob das Vision-Modell Werkzeugaufrufe
  beherrscht, ist unbekannt. Das Ergebnis kommt deshalb als **JSON im
  Antworttext** und wird tolerant geparst. Ein Ausgabeformat, ein Codepfad.

### 3.3 Bildaufbereitung

`renderNotePagesOf(documentId)` rendert bereits jede Seite vollständig — Striche,
Formen, Text und Linierung — als Daten-URL. Der Scan benutzt genau diese
Funktion.

Sie liefert bislang PNG bei bis zu 1280 px Kantenlänge. Als Base64 in einer
HTTP-Anfrage ist das pro Seite mehrere hundert Kilobyte. Die Funktion bekommt
deshalb einen optionalen Parameter für Kantenlänge, MIME-Typ und Qualität; der
Aufruf aus der Bibliothek bleibt unverändert, der Scan fordert JPEG bei 1000 px
und Qualität 0,72 an. Das ist für Handschrift gut lesbar und um etwa eine
Größenordnung kleiner.

Ein Scan schickt höchstens **acht Seiten** je Notiz. Bei längeren Notizen die
ersten acht; die Obergrenze deckelt die Kosten eines einzelnen Aufrufs.

### 3.4 Modulschnitt

| Modul | Verantwortung |
| --- | --- |
| `src/knowledge/scanQueue.js` | Reine Logik: welche Notiz ist wann fällig, ist ein Lauf überhaupt dran |
| `src/knowledge/documentScan.js` | Eine Notiz → Bilder → ein Modellaufruf → geprüfte Funde |
| `src/knowledge/knowledgeRepository.js` | Persistenz von Terminen, Begriffen, Scanzustand und Plan |
| `src/knowledge/studyPlan.js` | Minutenbudget je Tag (Code) und Planaufbau (Modell) |
| `src/hooks/useKnowledge.js` | Bindeglied zu React: Scanlauf anstoßen, Daten liefern |
| `src/components/UpcomingCard.jsx` | Die „Anstehend"-Karte in der Bibliothek |
| `src/components/PlanScreen.jsx` | Bildschirm mit Lernplan und Glossar |

Jedes der vier `knowledge`-Module ist ohne React und ohne Netzwerk testbar:
`scanQueue` und `studyPlan` sind rein, `knowledgeRepository` bekommt seinen
`storage` injiziert (wie `noteRepository`), `documentScan` bekommt seine
Renderfunktion und seinen Modellaufruf injiziert.

---

## 4. Datenmodell

### 4.1 Speicherort

Ein Schlüssel in `localStorage`: `notes.knowledge.v1`. Aufbau und Fehlerverhalten
folgen `noteRepository.js` — defensives Lesen mit Rückfall auf einen leeren
Zustand, Schreibfehler werden geschluckt und dürfen die App nie blockieren.

### 4.2 Form

```
{
  version: 1,
  events: [{
    id, kind: "homework" | "exam",
    title, subject,
    due,               // "YYYY-MM-DD"
    sourceNoteId,
    done: boolean,
    createdAt, updatedAt
  }],
  terms: [{
    id, term, definition, subject,
    sourceNoteId, createdAt, updatedAt
  }],
  scanState: {
    lastRunAt,                    // Zeitpunkt des letzten Laufs
    lastError,                    // Text oder null
    notes: { [noteId]: lastScannedAt }
  },
  plan: {
    generatedFor,                 // "YYYY-MM-DD"
    days: [{ date, budgetMinutes, blocks: [{ subject, task, minutes }] }]
  }
}
```

### 4.3 Zusammenführen statt Anhängen

Wird eine ergänzte Notiz erneut gescannt, liefert das Modell die bereits
bekannten Funde noch einmal mit. Ohne Deduplizierung wüchse der Kalender bei
jedem Lauf.

* **Termine** sind gleich, wenn `kind`, `subject`, `due` und der normalisierte
  `title` übereinstimmen. Normalisierung: klein geschrieben, Mehrfach-Leerzeichen
  zusammengezogen, Satzzeichen an den Rändern entfernt.
* **Begriffe** sind gleich, wenn `subject` und der normalisierte `term`
  übereinstimmen.

Bei einer Übereinstimmung werden die Felder aktualisiert und `updatedAt` gesetzt;
`id`, `createdAt` und — bei Terminen — `done` bleiben erhalten. Ein bereits
abgehakter Termin darf durch einen erneuten Scan **nicht** wieder auf offen
springen.

### 4.4 Prüfung der Modellantwort

Alles aus dem Modell ist unzuverlässig und wird vor dem Speichern geprüft:

* `kind` muss `"homework"` oder `"exam"` sein, sonst wird der Eintrag verworfen.
* `due` muss auf `/^\d{4}-\d{2}-\d{2}$/` passen und ein gültiges Datum sein.
  Termine mehr als ein Jahr in der Zukunft oder in der Vergangenheit werden
  verworfen — das sind praktisch immer Halluzinationen aus einer Jahreszahl im
  Text.
* `title` und `term` müssen nach dem Trimmen nicht leer sein und werden auf 200
  Zeichen gekürzt, `definition` auf 500.
* `subject` fällt auf das Fach der Quellnotiz zurück, wenn das Modell keines
  nennt.
* Höchstens 20 Termine und 40 Begriffe je Notiz. Alles darüber wird
  abgeschnitten.

---

## 5. Der Scan

### 5.1 Ablauf eines Laufs

1. `isRunDue({ now, scanState })` prüft die Slotgrenze. Nein → Ende.
2. `dueNotes({ now, notes, scanState })` liefert die fälligen Notizen, älteste
   Bearbeitung zuerst.
3. Je Notiz nacheinander (nicht parallel — der Proxy ist eine gemeinsame,
   ratenbegrenzte Ressource): rendern, aufrufen, prüfen, zusammenführen,
   `scanState.notes[noteId]` auf `now` setzen.
4. Nach dem letzten Durchgang `lastRunAt` setzen.

Höchstens **zehn Notizen** je Lauf. Der Rest ist beim nächsten Lauf wieder
fällig — die Warteschlange geht nicht verloren, sie wird nur gestreckt.

### 5.2 Der Prompt

Systemnachricht auf Deutsch, wie der Rest der App. Der Benutzerinhalt ist ein
Array: zuerst ein Textteil mit Titel, Fach und **dem heutigen Datum**, dann die
Seitenbilder. Das heutige Datum ist zwingend, sonst kann das Modell „bis nächsten
Freitag" nicht auflösen.

Verlangtes Format, ohne umgebenden Text:

```json
{
  "homework": [{ "title": "", "subject": "", "due": "YYYY-MM-DD" }],
  "exams":    [{ "title": "", "subject": "", "due": "YYYY-MM-DD" }],
  "terms":    [{ "term": "", "definition": "", "subject": "" }]
}
```

Ausdrückliche Anweisung: **nichts erfinden.** Findet sich in der Notiz keine
Hausaufgabe, bleibt das Array leer. Ein leeres Ergebnis ist ein gültiges
Ergebnis. Als Begriff zählt nur ein Fachbegriff, der in der Notiz erklärt oder
eingeführt wird, kein Alltagswort.

### 5.3 Parsen

Das Modell antwortet trotz Anweisung häufig mit umgebendem Text oder einem
Codeblock. Der Parser nimmt in dieser Reihenfolge: den Inhalt eines
Dreifach-Backtick-Blocks, sonst den Abschnitt vom ersten `{` bis zur letzten `}`,
sonst die ganze Antwort. Schlägt `JSON.parse` fehl, gilt der Scan dieser Notiz
als fehlgeschlagen — sie bleibt fällig und wird beim nächsten Lauf erneut
versucht.

### 5.4 Fehler

Ein Fehler bei einer Notiz bricht den Lauf nicht ab. `scanState.notes` wird für
diese Notiz nicht gesetzt, die Meldung landet in `scanState.lastError`, der Lauf
geht zur nächsten Notiz. Ist der Space nicht erreichbar (derzeit antwortet er
mit `503`), schlagen alle Notizen fehl, es wird nichts gespeichert, und die
Einstellungen zeigen die Meldung an. Kein Dialog, kein Toast — der Scan ist eine
Hintergrundaufgabe und darf den Benutzer nicht unterbrechen.

---

## 6. Der Lernplan

### 6.1 Zeitregeln (Code)

```
budgetForDay(date, demand):
  Mittwoch                  -> 0        (Lernzeit findet in der Schule statt)
  Montag/Dienstag/
  Donnerstag/Freitag        -> 70 + demand, gedeckelt bei 120
  Samstag/Sonntag           -> demand,      gedeckelt bei 120
```

70 Minuten sind der Pflichtsockel an Schultagen und stehen auch dann im Plan,
wenn nichts ansteht — dann als Wiederholung. Der Mittwoch ist unbedingt null:
keine Nachfrage, kein Klausurdruck hebt ihn an.

`demand(date)` ist der aufgelaufene Bedarf aus offenen Terminen:

* Jede offene **Hausaufgabe** veranschlagt 30 Minuten, gleichmäßig auf die Tage
  von heute bis zum Fälligkeitstag verteilt.
* Jede **Klausur** veranschlagt 180 Minuten Vorbereitung, verteilt auf die zehn
  Lerntage vor dem Termin (Mittwoche zählen nicht mit).
* Überfällige Einträge zählen auf den heutigen Tag.

Die Pauschalen 30 und 180 sind bewusst grob und stehen als benannte Konstanten
im Modul. Sie sind der erste Wert, an dem gedreht wird, wenn der Plan sich falsch
anfühlt.

### 6.2 Inhalte (Modell)

Ein reiner Textaufruf — keine Bilder, also das günstige Textmodell. Eingabe:
die sieben Tage mit ihrem bereits berechneten Budget, die offenen Termine, die
Fächer aus dem Stundenplan und eine Auswahl an Glossarbegriffen.

Das Modell verteilt ausschließlich **Inhalte** auf vorgegebene Minuten. Es darf
das Budget eines Tages nicht ändern. Beim Zusammenbauen wird das erzwungen: die
Summe der Blockminuten eines Tages wird auf das Budget gekürzt, überzählige
Blöcke fallen weg. Tage mit Budget 0 bekommen keine Blöcke, auch wenn das Modell
welche liefert.

Fällt der Modellaufruf aus, entsteht trotzdem ein Plan: jeder Tag bekommt einen
Block je fälligem Termin und, falls Budget übrig ist, einen Wiederholungsblock
für das Fach mit den meisten offenen Einträgen. Der Plan ist dann dürftig, aber
vorhanden.

---

## 7. Tests

Vitest, wie im übrigen Projekt. Netzwerk und Rendern werden injiziert und in den
Tests durch Attrappen ersetzt; es geht in keinem Test eine echte Anfrage raus.

* `tests/scanQueue.test.js` — Slotgrenze (vor/nach 15:00 und 21:00, zweimaliges
  Öffnen am selben Nachmittag), Ruhezeit von zwei Stunden, erneute Fälligkeit
  nach Bearbeitung, Deckel von zehn Notizen je Lauf.
* `tests/knowledgeRepository.test.js` — leerer und kaputter Speicher, Merge ohne
  Verdopplung, abgehakter Termin bleibt abgehakt, Schreibfehler wirft nicht.
* `tests/documentScan.test.js` — JSON in einem Codeblock, JSON mit umgebendem
  Text, kaputtes JSON, verworfene Einträge (falsches `kind`, unmögliches Datum,
  leerer Titel), Seitendeckel bei acht.
* `tests/studyPlan.test.js` — Mittwoch bleibt 0 auch unter Klausurdruck, Sockel
  70 an Schultagen ohne Aufgaben, Deckel 120, Blockminuten überschreiten das
  Tagesbudget nie, Rückfallplan ohne Modell.
