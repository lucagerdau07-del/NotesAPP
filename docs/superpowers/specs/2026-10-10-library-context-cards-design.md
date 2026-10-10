# Spezifikation: Bibliotheks-Karten (Kontextsystem für den Agenten)

## 1. Übersicht & Ziel

Der Agent kennt die Bibliothek heute nicht. Der Systemprompt enthält keinen Ordner,
er muss sich über `list_folders`, `list_notes` und `search_sources` herantasten, jeder
Schritt ein Roundtrip. Das ist die Grundlage für alles, was später mit Lernen zu tun
hat: ohne Orientierung kein gezieltes Abfragen, Korrigieren oder Planen.

Neu ist ein **Kartensystem nach dem Muster von Claude Skills**: kurze, kontextgebende
Zusammenfassungen, die immer im Prompt stehen, und Detail, das nur auf Abruf geladen
wird.

| Stufe | Inhalt | Wann geladen |
|-------|--------|--------------|
| 1 | Ordnerbaum mit je einer Karte (1-2 Sätze, Stichwörter, Notizenzahl) | immer, im Systemprompt |
| 2 | Karte je Notiz in `list_notes` | wenn der Agent einen Ordner aufklappt |
| 3 | Volltext über `search_sources` / `read_source` | wie bisher, auf Abruf |

Der Agent liest Karten, bis er weiß, wo er graben muss, und nie den ganzen Baum.

Leitprinzip: **Die vorhandenen Werkzeuge bleiben.** Es kommt kein neues Werkzeug
dazu. Karten ersetzen den 120-Zeichen-Auszug in `list_notes` und füllen den
Systemprompt, mehr nicht.

### 1.1 Abgrenzung

Nicht Teil dieser Spezifikation:

* **Lernfunktionen** (Abfragemodus, Schwächenspeicher, Karteikarten in der App).
  Sie setzen auf diesem System auf.
* **Vom Agenten geschriebene Karten.** Ein `set_card`-Werkzeug entfällt in Version 1.
* **Manuelle Karten je Notiz.** Von Hand überschreibbar sind nur Ordnerkarten.
* **Geräteübergreifender Abgleich.** Karten liegen wie die Ordner in `localStorage`.
* **Embeddings oder Vektorsuche.** Die Karten leiten, die Volltextsuche findet.

## 2. Entscheidungen

* **Automatisch erzeugt, von Hand überschreibbar.** Eine eigene Zeile des Nutzers hat
  Vorrang und wird nie überschrieben.
* **Ein Modellaufruf je geändertem Ordner liefert beide Ebenen**: die Ordnerkarte und
  die Karten aller neuen oder geänderten Notizen darin. Aufrufzahl = Zahl der
  geänderten Ordner, nicht der Notizen. Das Gratiskontingent
  (`agentSettings.js`) trägt das.
* **Von unten nach oben.** Unterordner zuerst, die Karte des Elternordners entsteht
  aus den Notizen des Ordners plus den Karten seiner Unterordner. Nie aus Rohtext
  des ganzen Teilbaums.
* **Eigener Speicher statt Felder an Ordner und Notiz.** Abgeleitete Daten bleiben
  getrennt von Nutzerdaten, `saveNote` wird nicht aufgebläht, Löschen ist ein Eintrag.
* **Der Prompt-Block hat ein festes Zeichenbudget** und wird bei großen Bibliotheken
  stufenweise gekürzt, statt zu wachsen.

## 3. Datenmodell

`src/knowledge/cardRepository.js`, Schlüssel `notes.cards.v1`, gleiche Bauart wie
`folderRepository.js` (injizierter Storage, `version: 1`, Lesefehler ergeben leeren
Zustand).

```json
{
  "version": 1,
  "cards": {
    "<folderId>": {
      "manual": "Text des Nutzers, optional",
      "auto": {
        "text": "Mitschriften und Arbeitsblätter zu Analysis: Ableitung, Kurvendiskussion.",
        "notes": { "<noteId>": "Kurvendiskussion mit Beispielfunktion, Handschrift" },
        "seen": { "<noteId>": 1760000000000 },
        "stamp": "k3j9x2",
        "generatedAt": 1760000000000
      }
    }
  }
}
```

* Wirksamer Ordnertext = `manual` (nicht leer) vor `auto.text`.
* `manual` und `auto` sind getrennt, damit Löschen der eigenen Zeile ohne neuen
  Modellaufruf zur automatischen Karte zurückfällt.
* `auto.seen` merkt je Notiz die Version, die in die Karte eingeflossen ist:
  `updatedAt`, bei Importen zusätzlich die Zahl gelesener Seiten. Daran erkennt die
  Erzeugung, welche Notizen neu oder geändert sind.
* API: `get(folderId)`, `effectiveText(folderId)`, `noteCard(folderId, noteId)`,
  `setAuto(folderId, auto)`, `setManual(folderId, text)`, `remove(ids)`.

## 4. Erzeugung

`src/knowledge/cards.js`, Funktion `queueCardGeneration(scope, deps)`.

### 4.1 Einhängen

* `sources.js` exportiert `afterIndexing(task)` (`queue = queue.then(task)`) und
  `leadingText(note, opts)` (Textanfang plus Zahl gelesener Seiten), damit
  die Kartenerzeugung in derselben Warteschlange läuft wie OCR und
  Handschrifterkennung. Es laufen nie zwei Modellaufrufe parallel, und Karten
  entstehen erst, wenn der Text der Seiten gelesen ist.
* `useDocumentLibrary` ruft sie im vorhandenen Effekt nach `indexHandwriting` auf.
  Neue Abhängigkeit des Hooks: `generateCards`, injizierbar wie `indexSources`.
* `matchesFolder` zieht aus `tools.js` nach `folderRepository.js` und wird von dort
  importiert (Tool-Schicht und Kartenschicht nutzen dieselbe Regel).

### 4.2 Ablauf je Lauf

1. Ordner nach Tiefe absteigend sortieren (Blätter zuerst).
2. Je Ordner die direkten Notizen bilden (eigene und importierte,
   `matchesFolder`). Ordner ohne Notizen und ohne Unterordnerkarten: überspringen,
   keine Karte.
3. `stamp` berechnen: Hash über `id:updatedAt:gelesene Seiten` der direkten Notizen
   und die wirksamen Texte der Unterordnerkarten.
4. Veraltet, wenn `stamp` abweicht **und** eines davon gilt:
   keine automatische Karte vorhanden, eine Notiz ist neu im Ordner (`id` nicht in
   `seen`), oder `generatedAt` ist älter als `MIN_REFRESH_MS` (6 Stunden).
   Das Drosseln verhindert, dass Tippen in einer Notiz bei jedem Öffnen der
   Bibliothek einen Aufruf auslöst.
5. Veraltete Ordner ordnen: fehlende Karte zuerst, dann älteste `generatedAt`.
   Höchstens `MAX_CALLS_PER_RUN` (8) Aufrufe. Der Rest folgt beim nächsten Öffnen.
6. Aufruf (`requestCompletion`, wie die OCR injizierbar):
   * Eingabe je neuer oder geänderter Notiz: `id | Titel | Auszug` mit Auszug
     höchstens 280 Zeichen. Eigene Notizen: getippter Text plus
     Handschriftabschrift. Importierte: Text der ersten zwei gelesenen Seiten.
   * Unveränderte Notizen gehen nur als `id | Titel | bisherige Karte` mit, damit
     das Modell sie behält und nicht neu zusammenfasst.
   * Höchstens `MAX_NOTES_PER_CALL` (60) Notizen, neue und geänderte zuerst.
   * Mitgegeben: Ordnername, Unterordnerkarten, eine vorhandene manuelle Zeile als
     Kontext.
   * Ausgabe: `{"folder": "...", "notes": {"<id>": "..."}}`.
7. Validieren (`extractJson` aus `documentScan.js`): nur Strings, getrimmt,
   Ordnertext höchstens 220, Notizkarte höchstens 140 Zeichen, unbekannte ids
   verworfen. Fehlende Notizen behalten ihre alte Karte. Bei Parsefehler bleibt die
   alte Karte unverändert, der Fehler landet in `lastCardError`.
8. `setAuto` mit neuem `seen`, `stamp`, `generatedAt`. Karten von Notizen, die
   nicht mehr im Ordner liegen, fallen dabei weg.

### 4.3 Generator-Prompt

Deutsch, eine Aufgabe: Jede Karte beantwortet „Was liegt hier, und wofür braucht man
es?" mit den konkreten Themen und Fachbegriffen, der Textsorte (Mitschrift,
Arbeitsblatt, Buch, Klausur) und, wenn erkennbar, dem Zeitraum. Kein Füllwort, kein
Gedankenstrich, keine Wiederholung des Titels.

## 5. Prompt-Block

`src/agent/libraryOverview.js`.

* `buildLibraryOverview({ folders, counts, cards }, { maxChars = 2400 })` ist eine
  reine Funktion und liefert einen String oder `""` bei leerer Bibliothek.
* `loadLibraryOverview(deps)` liest Ordner, eigene Notizen (synchron),
  importierte Dokumente (IndexedDB, asynchron) und Karten, zählt direkte Notizen je
  Ordner wie `folderTree` und ruft `buildLibraryOverview`.

Format:

```
Bibliothek (Ordner [id], Zahl der Notizen, Karte). Wähle damit den Ordner, bevor du suchst:
Mathe [mathe] 14: Mitschriften und Arbeitsblätter zu Analysis, Ableitung, Kurvendiskussion.
  Analysis [a1] 6: ...
Englisch [englisch] 3: Vokabellisten, ...
Ohne Ordner: 2 Notizen
```

* Reihenfolge stabil nach Name (`localeCompare("de")`), damit der Block nur bei
  echter Änderung wechselt. Keine Zeitangaben im Block, die liefert `list_notes`.
* Budget: Kürzungsstufen nacheinander, bis der Block passt:
  1. Karten bis 220 Zeichen, voller Baum.
  2. Karten bis 120 Zeichen.
  3. Karten bis 120 Zeichen, Unterordner ab Tiefe 2 zu `(Unterordner: a, b, c)`
     eingeklappt.
  4. Karten bis 80 Zeichen, nur oberste Ebene mit eingeklappten Unterordnern.
* Ordner ohne Karte erscheinen mit Name, id und Notizenzahl.

`buildSystemPrompt` bekommt den optionalen Parameter `libraryOverview`. Die
Reihenfolge ist Cache-Pflege, denn die Modelle cachen den Präfix byteweise:
statische Anweisungen zuerst, dann die Karten (wechseln selten), und alles, was
sich bei jedem Senden ändert (Uhrzeit, geöffnete Notiz, Ziel-Notiz), unter
„Aktueller Kontext" ganz am Ende. Vorher standen Uhrzeit und Notiztitel mitten im
Prompt und machten den Cache samt Gesprächsverlauf jede Minute ungültig. Davor eine Anweisung: aus den Karten ableiten, wo ein Thema liegt, dann
`list_notes` mit `folderId` oder `search_sources` mit `folderId`, nie blind
alles lesen. Im Fast-Modus entfällt der Block, dort sind die Suchwerkzeuge
ausgeschaltet.

`useAgent.send` ruft `await loadLibraryOverview()` vor dem Bau des Prompts. Der Block
gilt in der Startseite, im Editor und im Chat, da überall Bibliothekswerkzeuge
verfügbar sind.

## 6. Werkzeuge

Keine neuen Werkzeuge. Geändert:

* **`list_notes`**: letzte Spalte ist die Notizkarte, falls vorhanden, sonst der
  Auszug wie bisher. Der Treffertest (`noteListing`) zählt die Karte wie den
  Auszug mit, damit „Kurvendiskussion" eine Notiz findet, deren Titel nur
  „Blatt 4" heißt.
* **`list_folders`**: jede Zeile bekommt den wirksamen Kartentext.
* **Beschreibungen** von `list_notes` und `list_folders` nennen Karte statt Auszug.
* `search_sources` und `read_source` bleiben unverändert.

## 7. Oberfläche

Der Ordnerdialog in `Library.jsx` (Handler um `createFolder`/`renameFolder`) bekommt
ein mehrzeiliges Feld „Beschreibung für den Assistenten".

* Platzhalter: die automatische Karte (`auto.text`), damit sichtbar ist, was der
  Agent sonst sieht.
* Speichern ruft `cardRepository.setManual`. Leeres Feld entfernt `manual`.
* Beim Löschen eines Ordners (`removeFolder` liefert die entfernten ids) ruft der
  Handler `cardRepository.remove(ids)`.

## 8. Fehler und Grenzen

* Ein fehlgeschlagener Aufruf lässt die alte Karte stehen und blockiert die
  übrigen Ordner nicht (wie `indexNote` in `sources.js`).
* Ohne Karte funktioniert alles wie heute, nur ohne Orientierung.
* Bewusste Grenze: Karten entstehen nur, solange die App offen ist. Große
  Bibliotheken füllen sich über mehrere Öffnungen (`MAX_CALLS_PER_RUN`).
* Bewusste Grenze: `seen` und Notizkarten wachsen mit dem Ordner. Bei Ordnern
  jenseits von etwa 60 Notizen werden nur neue und geänderte Notizen neu
  zusammengefasst, ältere behalten ihre Karte.
* Verschiebt der Nutzer eine Notiz in einen anderen Ordner, fällt sie dort auf den
  Auszug zurück, bis der Ordner neu erzeugt wird.

## 9. Tests

* `tests/cards.test.js`: Blätter vor Eltern, Stamp und Drossel (6 Stunden),
  neue Notiz umgeht die Drossel, `MAX_CALLS_PER_RUN`, `manual` bleibt bei
  Neuerzeugung, Parsefehler lässt Karte stehen, unbekannte ids verworfen.
* `tests/cardRepository.test.js`: Lesen defekter Daten, `effectiveText`,
  `remove`.
* `tests/libraryOverview.test.js`: Reihenfolge, alle vier Kürzungsstufen, leere
  Bibliothek, Zeile „Ohne Ordner", Ordner ohne Karte.
* Bestehende Tests von `list_notes` und `list_folders` laufen weiter und
  bekommen je einen Fall mit Karte.
* `buildSystemPrompt`: Block vorhanden, nach allem Statischen, im Fast-Modus
  abwesend. Alles oberhalb von „Aktueller Kontext" bleibt byte-gleich, wenn sich nur
  Uhrzeit, Notiz oder Ziel-Notiz ändern (Prompt-Cache).
