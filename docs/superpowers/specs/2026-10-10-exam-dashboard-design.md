# Spezifikation: Klausur-Dashboard (Lernstand im Kalender, Klausur-Subagent)

## 1. Übersicht & Ziel

Der Agent soll zur Klausurvorbereitung interaktive Dashboards erstellen. Sie leben im
Kalender an der Klausur, der Nutzer bedient sie dort, und der Agent sieht den
Lernstand für die weitere Planung.

Zwei Teile, die zusammengehören:

1. **Dashboard je Klausur** (`event.study`): Themen mit Selbsteinschätzung,
   Karteikarten, Quiz, Formelblatt, berechnete Bereitschaft. Nativ gerendert im
   Klausurfenster des Kalenders und an den Lerntagen dieser Klausur.
2. **Klausur-Subagent**: Ein eigener, kleiner Modellaufruf-Verlauf baut den Inhalt,
   mit eigenem Mini-Systemprompt und nur drei Lesewerkzeugen. Er bekommt nie den
   allgemeinen Prompt des Haupt-Agenten.

### 1.1 Abgrenzung

Nicht Teil dieser Spezifikation:

* Dashboards ohne Klausur (Fach- oder Themenübersichten).
* Vom Modell geschriebenes HTML oder iframe-Inhalte.
* Wiederholungs-Algorithmus über drei Boxen hinaus, Drag-and-drop.
* Geräteübergreifender Abgleich. `event.study` liegt wie der Rest in `localStorage`.
* Dashboards im Editor-Chat. Das Werkzeug gibt es nur auf der Startseite.

## 2. Entscheidungen

* **Getippte Bausteine, nativ gerendert** statt HTML des Modells: wenige Tokens,
  robust mit dem Gratismodell, Fortschritt ist strukturiert lesbar.
* **Ablage an der Klausur**, nicht im Chat: wie `event.topic`, `event.prep`,
  `event.need`. Überlebt den IServ-Abgleich (`mergeList` in
  `knowledgeRepository.js` übernimmt `study` wie `prep`).
* **Subagent statt Haupt-Agent**: Recherche und Bau laufen in einem eigenen Verlauf.
  Der Haupt-Agent bekommt nur eine Zeile Ergebnis zurück, die gelesenen Quellen
  landen nie in seinem Kontext.
* **Zwei Einstiege, ein Code**: Knopf im Kalender und Werkzeug
  `build_exam_dashboard` rufen dieselbe Funktion.
* **Ids vergibt die App**, nicht das Modell. Das Modell liefert Inhalt ohne ids.
* **Harte Grenzen im Code**, nicht im Prompt (wie `fitBlocks` in `examPrep.js`).

## 3. Datenmodell

`src/knowledge/examStudy.js`, reine Funktionen. Gespeichert in `event.study`:

```json
{
  "v": 1,
  "at": 1760000000000,
  "topics": [{ "id": "t1", "title": "Kettenregel", "level": null }],
  "cards":  [{ "id": "c1", "topic": "t1", "front": "...", "back": "...", "box": 0, "seenAt": 0 }],
  "quiz":   [{ "id": "q1", "topic": "t1", "q": "...", "opts": ["...", "..."], "right": 0,
               "why": "...", "tries": 0, "hits": 0 }],
  "sheet":  [{ "title": "Kettenregel", "text": "f'(x) = g'(h(x)) * h'(x)" }]
}
```

* `level`: 0 bis 3 (Nutzer-Einschätzung) oder `null` (noch nicht eingestuft).
* `box`: 0 bis 3 (Leitner). "Gewusst" erhöht um 1, "Nicht gewusst" setzt auf 0.
  Fällig sind Karten in Box 0 oder ungesehen, Box 1 nach 1 Tag, Box 2 nach 3, Box 3
  nach 7 Tagen (`seenAt`).
* Das Modell nennt je Karte und Frage den Themen-Titel. Die App ordnet ihn per
  `fold()` einem Thema zu, unbekannte Titel bleiben ohne Thema.
* **Bereitschaft** wird berechnet, nicht gespeichert: Themen (40 %, Mittel von
  `level / 3`), Karten (30 %, Mittel von `box / 3` über gesehene Karten), Quiz
  (30 %, `hits / tries`). Fehlt eine Komponente, werden die Gewichte neu verteilt.
  Ohne jede Datenlage `null`.
* **Schwache Themen**: `level <= 1` oder Karten-/Quiz-Quote unter 50 %, schlechtestes
  zuerst.

Funktionen: `normalizeStudy(input, existing, mode)`, `readiness(study)`,
`weakTopics(study, limit)`, `dueCards(study, today)`, `rateCard`, `answerQuestion`,
`setLevel`.

### 3.1 Grenzen je Aufruf und gesamt

| Feld | je Aufruf | gesamt | Zeichen |
|------|-----------|--------|---------|
| Themen | 12 | 12 | Titel 60 |
| Karten | 30 | 60 | Vorderseite 120, Rückseite 240 |
| Fragen | 15 | 30 | Frage 200, 2 bis 4 Optionen je 80, Begründung 160 |
| Formelblatt | 8 | 8 | Titel 60, Text 300 |

* `mode: "add"` hängt an und überspringt Duplikate (gleiche Vorderseite oder Frage
  per `fold()`). `mode: "replace"` ersetzt alles, **behält aber den Fortschritt**
  (`level`, `box`, `tries`, `hits`) von Einträgen mit gleichem Titel, gleicher
  Vorderseite oder gleicher Frage.
* `right` muss ein gültiger Index in `opts` sein, sonst fällt die Frage weg.
* Alles Übrige wird getrimmt, gekürzt, verworfen. Es gibt nie einen Fehler wegen
  Überlänge.

## 4. Klausur-Subagent

`src/agent/examAgent.js`.

```
runExamAgent({ event, terms, memory, folders, study, wish, complete, execute, maxSteps = 5, signal })
  -> { content: { topics, cards, quiz, sheet }, steps }
```

### 4.1 Prompt und Kontext

Systemprompt (Deutsch, etwa 1 200 Zeichen, eine Aufgabe): baue aus den
Bibliotheksquellen dieses Faches ein Lern-Dashboard zur Klausur. Erst
`search_sources` mit Fachbegriffen und `folderId` (mehrere Suchen in einer Antwort),
dann `read_source` für die besten Treffer, dann **nur** ein JSON-Objekt
`{"topics":[],"cards":[],"quiz":[],"sheet":[]}`. Nichts erfinden, was weder in den
Quellen noch im Thema steht. Karten kurz und prüfbar, Fragen mit genau einer
richtigen Antwort und plausiblen falschen. Mehr Karten zu schwachen Themen.

Nutzer-Nachricht (fest gedeckelt, `CONTEXT_MAX_CHARS = 1600`), in dieser Rangfolge:

1. Klausur: Fach, Titel, Datum, Uhrzeit, Thema, Beschreibung (400 Zeichen),
   `need.content`.
2. Ordner des Faches: Name und `folderId`, aufgelöst über den Fachnamen
   (`fold()` gleich Ordnername), sonst weggelassen.
3. Vorhandenes Dashboard: Themen mit `level`, Zahl der Karten und Fragen, die
   ersten 40 Zeichen von höchstens 10 Vorderseiten (gegen Duplikate), schwache
   Themen.
4. Begriffe des Faches aus `terms` (höchstens 8, nur die Wörter).
5. Gedächtniszeilen, die mit dem Fachnamen beginnen (höchstens 4).
6. Wunsch des Nutzers im Wortlaut (200 Zeichen).

**Nicht** enthalten: Bibliotheksbaum, Notiz-Stilregeln, Editor-Werkzeuge,
`enable_tools`-Liste, Schul-Block, Websuche, das gesamte Gedächtnis.

### 4.2 Werkzeuge und Schleife

* Werkzeuge: `list_notes`, `search_sources`, `read_source` mit den bestehenden
  Schemas (1 894 Zeichen). `executeTool` bearbeitet sie ohne geöffnetes Dokument
  (`tools.js`, Zweig vor `api.getDocument`), der Subagent ruft es ohne `api`.
* Schleife headless (kein React), etwa 40 Zeilen, **ohne** Umbau von `useAgent.js`:
  Modellaufruf, Werkzeugaufrufe ausführen, Ergebnis je Aufruf auf 4 000 Zeichen
  kürzen, wiederholen, bis eine Antwort ohne Werkzeugaufruf kommt.
* `maxSteps = 5`: bis zu zwei Rechercherunden, die Antwort, eine Reserve. Das
  Gratiskontingent ist klein (siehe `agentSettings.js`), jeder Schritt zählt.
* Modell: wie `examPrep.js` kein `model`-Argument, Proxy-Standard.
* Ausgabe wird mit `extractJson` gelesen und durch `normalizeStudy` geprüft. Bei
  Parsefehler ein einziger Reparaturschritt mit der Fehlermeldung, danach wirft der
  Aufruf mit einer Meldung für den Nutzer. Ein vorhandenes Dashboard bleibt dann
  unberührt.
* Ist die Antwort leer (nichts verwertbar), Fehler "Das Modell hat kein Dashboard
  geliefert. Später erneut versuchen."

## 5. Einstiege

### 5.1 Kalender

`useKnowledge.js`: `buildDashboard(id, wish, mode)` umhüllt `buildExamDashboard`
(Abschnitt 5.2), gleiche Bauart wie `planExam` (Zustand `dashboardExamId`, `{ok}`
oder `{error}`, `setState(repository.read())` im `finally`). Knopf "Dashboard erstellen" beziehungsweise "Dashboard ergänzen"
in der neuen Sektion (Abschnitt 7), daneben ein einzeiliges Feld "Wunsch,
optional". Läuft nur auf Knopfdruck, der tägliche Plan ruft ihn nie.

### 5.2 Haupt-Agent

Neues Werkzeug `build_exam_dashboard { id, wish?, mode? }`, nur in
`AGENT_LIBRARY_TOOLS` (Startseite). `id` ist die Kurz-id aus dem Schul-Block
(`shortId`), Auflösung und Fehlermeldungen wie `set_task_done`. Beide Einstiege
rufen die reine Funktion `buildExamDashboard({ id, wish, mode, repository,
complete })` aus `examAgent.js`: sie liest die Klausur, ruft `runExamAgent`,
schreibt mit `setExamStudy`. `executeTool` nutzt die Browser-Vorgaben (wie
`runSchoolTool`, ein eigener asynchroner Zweig wie `create_google_doc`) und löst
danach `KNOWLEDGE_CHANGED` aus. Rückgabe ist **eine Zeile**:
`Dashboard Mathe Di 14.10.: 6 Themen, 12 Karten, 8 Fragen`.

Im Chat erscheint eine Karte (`step.card`, wie `DocCard`) mit Titel und der Zeile
"Dashboard · Zum Öffnen tippen". Tippen öffnet den Kalender beim Eintrag: `App.jsx`
hält `calendarFocus` (Event-id), `CalendarScreen` bekommt `focusEventId`,
`Library` reicht `onOpenCalendar(eventId)` an die `StepList` weiter.

## 6. Lernstand für den Agenten

* **Schul-Block** (`schoolContext.js`): je anstehende Klausur der nächsten 14 Tage
  mit Dashboard eine Zeile, höchstens zwei:
  `Lernstand Mathe Di 14.10.: 62%, schwach: Kettenregel, Produktregel`
  (höchstens 110 Zeichen). Rang direkt nach der Lernplan-Zeile, vor dem
  Stundenplan, fällt bei Platzmangel mit den Extras von hinten weg. Budget bleibt
  `SCHOOL_MAX_CHARS = 900`.
* **`list_tasks`**: bei enger Auswahl (höchstens 3 Einträge) zusätzlich die Zeile
  "Dashboard: Bereitschaft, Themen mit Stufe, Karten x/y gewusst, Fragen x/y
  richtig".
* **Planer**: `examPrep.js` und `examNeed.js` hängen Bereitschaft und schwache
  Themen an die Anfrage (eine Zeile `Lernstand: ...`), damit ein neuer Lernplan
  sie gewichtet. `buildPlan` in `studyPlan.js` hängt dieselbe Zeile an Klausuren
  ohne eigenen Lernplan. Die Schlüssel `planInputsKey` bleiben unverändert: der
  Lernstand löst kein Neuberechnen aus, er wirkt, wenn der Plan ohnehin entsteht
  (Knopf oder neuer Tag).

## 7. Oberfläche

`src/components/ExamDashboard.jsx`, eingebunden in `EntryDetail`
(`CalendarScreen.jsx`) unter `ExamPlan`, für `event.kind === "exam" && !event.done`.

Bausteine, von oben:

1. Kopf: Bereitschaft in Prozent (Balken), Zahl fälliger Karten.
2. **Themen**: je Thema ein Chip mit Stufe 0 bis 3, Tippen schaltet weiter, leer
   bedeutet nicht eingestuft.
3. **Karten**: eine Karte, Tippen dreht sie, darunter "Gewusst" und "Nicht gewusst",
   nächste fällige Karte. Leer: "Heute nichts fällig".
4. **Quiz**: eine Frage, Optionen als Knöpfe, nach der Wahl sofort richtig/falsch
   mit Begründung, "Weiter".
5. **Formelblatt**: aufklappbare Liste.
6. Knopf "Dashboard ergänzen" und Wunschfeld.

* `entry.forExam` (Lerntage aus `fromPrep`) bekommt statt des vollen Dashboards die
  Kompaktansicht "Heute üben": fällige Karten und offene Fragen dieser Klausur.
  Das sind die passenden Stellen im Kalender.
* Zustand ändert sich über `repository.updateStudy(id, fn)` plus
  `KNOWLEDGE_CHANGED`. Keine eigene Speicherung in der Komponente.
* Ohne `study`: Hinweis "Noch kein Dashboard" und der Erstellen-Knopf.
* Stil: vorhandene `cal-*`-Klassen, keine neuen Farben.

## 8. Token-Budget

Gemessen (`buildSystemPrompt` mit `canEdit` und `library`, `AGENT_LIBRARY_TOOLS`,
ohne Bibliothekskarten, Gedächtnis und Schul-Block):

| | Zeichen | Hinweis |
|---|---------|---------|
| Haupt-Agent Systemprompt | 12 647 | je Schritt |
| Haupt-Agent Werkzeuge (24) | 14 093 | je Schritt |
| Subagent Systemprompt | etwa 1 200 | Deckel im Test |
| Subagent Werkzeuge (3) | 1 894 | gemessen |
| Subagent Kontext | höchstens 1 600 | `CONTEXT_MAX_CHARS` |

Ein Subagent-Schritt kostet damit rund ein Sechstel eines Haupt-Agent-Schritts. Der
Haupt-Agent zahlt nur: Werkzeug-Schema (etwa 450 Zeichen), ein Satz im Prompt
(etwa 230 Zeichen) und höchstens 220 Zeichen Lernstand im Schul-Block, alles nur
auf der Startseite. Die Zahlen des Subagent-Prompts misst ein Test und deckelt sie.

## 9. Fehler und Grenzen

* Ein Fehlschlag lässt ein vorhandenes Dashboard unberührt, der Nutzer sieht die
  Meldung im Kalender, der Haupt-Agent bekommt sie als Werkzeugergebnis.
* Ohne Treffer in der Bibliothek baut der Subagent aus Thema, Beschreibung und
  Begriffen. Das steht im Prompt als Regel: nichts erfinden, lieber weniger Karten.
* Bewusste Grenze: höchstens 5 Modellaufrufe je Dashboard. Große Stoffgebiete
  füllt der Nutzer über mehrere "Ergänzen"-Läufe.
* Bewusste Grenze: der Lernstand löst keine automatische Neuplanung aus.
* Bewusste Grenze: verschiebt sich die Klausur, bleibt `study` erhalten
  (anders als `prep`, das an `due` hängt). Wird sie erledigt, verschwindet das
  Dashboard aus der Ansicht, die Daten bleiben.
* Wird eine Klausur gelöscht, entfällt `study` mit ihr.

## 10. Tests

* `tests/examStudy.test.js`: Kürzen und Grenzen, `add` mit Duplikaten, `replace`
  behält Fortschritt, ungültiges `right`, Bereitschaft mit fehlenden Komponenten,
  schwache Themen, `dueCards` je Box, Themenzuordnung per `fold`.
* `tests/examAgent.test.js`: gescriptetes `complete` (Werkzeugaufruf, Ergebnis,
  End-JSON), Reparaturschritt bei Parsefehler, `maxSteps`, Ergebniskürzung,
  Kontext enthält weder Bibliotheksbaum noch fremdes Gedächtnis, Deckel
  `CONTEXT_MAX_CHARS`, Länge von Systemprompt plus Werkzeugen.
* `tests/knowledgeRepository.test.js`: `study` überlebt `mergeFindings`,
  `updateStudy`.
* `tests/schoolContext.test.js`: Lernstand-Zeile, Rang und Wegfall bei Platzmangel,
  `list_tasks` mit Dashboard-Zeile.
* `tests/tools.test.js`: `build_exam_dashboard` mit unbekannter, mehrdeutiger und
  Nicht-Klausur-id, Rückgabe eine Zeile, nur in `AGENT_LIBRARY_TOOLS`.
* `tests/systemPrompt.test.js`: Satz nur mit Schul-Block und nicht im Fast-Modus,
  Cache-Präfix oberhalb von "Aktueller Kontext" byte-gleich.
* `src/components/__tests__/ExamDashboard.test.jsx`: Stufe wechseln, Karte drehen
  und bewerten, Frage beantworten, Kompaktansicht an `forExam`.
