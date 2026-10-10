# Spezifikation: Aufgaben-Chat im Kalender

## 1. Übersicht & Ziel

Jede Hausaufgabe, Klausur und jeder Lernblock im Kalender bekommt einen eigenen Chat
mit dem Agenten. Der Chat sitzt als rechte Spalte im Detail-Fenster, ist sofort offen
und beginnt mit einer Nachricht des Agenten, die konkret für diese Aufgabe sagt, wie
er helfen kann. Der Agent kennt Aufgabe, Fach, Frist und Beschreibung, liest bei
IServ-Aufgaben den Anhang und sucht auf Wunsch Quellen, Inhalte und Bilder.

### 1.1 Abgrenzung

Nicht Teil dieser Spezifikation:

* Notizen anlegen oder bearbeiten aus dem Aufgaben-Chat (die Dokument-Werkzeuge wären
  zu schwer für den Prompt). Ergebnisse gehen über `create_file` und Google Doc.
* Word- und PowerPoint-Anhänge lesen (`readAgentAttachment` kann nur Bild, PDF, Text).
* Chat für Termine (`appointment`), Unterrichtsstunden und Notiz-Einträge.
* Geräteübergreifender Abgleich. Verläufe liegen wie alle Chats in `localStorage`.

## 2. Entscheidungen

* **Neuer `task`-Modus in `useAgent`**, keine zweite Agent-Schleife. Die Schleife,
  Verlaufsspeicherung, Titel, Schritte, Bild-Rückgabe (`result.pages`) und Abbruch
  existieren dort schon.
* **Ein Verlauf je Aufgabe**: `documentId = "task:<eventId>"`. Lernblock und Aufgabe
  teilen sich damit denselben Chat. Ein Lernblock ohne verknüpfte Aufgabe nutzt
  `task:<entryId>`.
* **Kontext gedeckelt und nur hier**: kein Schul-Block, keine Bibliotheksübersicht.
  `buildContext` aus `examAgent.js` wird verallgemeinert (heute nur Klausur).
* **Nur lesende Werkzeuge** plus `create_file`/Google Doc, siehe 4.
* **Startnachricht ist ein Completion-Aufruf ohne Werkzeuge**, einmal je Aufgabe,
  gespeichert als erste Assistenten-Nachricht. Sie führt nichts aus.
* **Anhang erst auf Wunsch lesen**: weder die Startnachricht noch das Öffnen löst
  einen Vision-Aufruf aus.

## 3. Wer bekommt einen Chat

| Eintrag | Chat | Kontext-Aufgabe |
|---|---|---|
| `homework`, `exam` (Event) | ja | das Event |
| `study` mit `eventIds` | ja | erstes verknüpftes offenes Event, alle (max. 3) im Kontext |
| `study` ohne Event | ja | Titel und Fach des Blocks |
| `appointment`, `lesson`, `review`, `note` | nein | – |

Erledigte Aufgaben zeigen den Chat ebenfalls, erzeugen aber keine automatische
Startnachricht (Eingabe bleibt benutzbar).

## 4. Werkzeuge im Aufgaben-Chat

Bestehend: `search_web`, `wolfram_alpha`, `search_sources`, `read_source`,
`list_notes`, `create_file`, `create_google_doc`, `find_google_docs`,
`read_google_doc`, `edit_google_doc`, `remember`, `done`.

Neu, beide in `tools.js`, Ausführung über `executeTool`:

* **`read_attachment { index }`** – lädt Anhang `index` der Aufgabe.
  * Download über `fetchIservAttachment` (aus `openIservAttachment` herausgelöst,
    beide teilen den Abruf der Space-Route `file?path=`).
  * Bild und PDF gehen durch `readAgentAttachment` und kommen als
    `{ pages: [{ src, cite }] }` zurück (max. 8 Seiten). `useAgent` hängt sie schon
    als Bild-Turn an und wählt die Vision-Kette.
  * Textdatei kommt als gekürzter Text (30 000 Zeichen).
  * Nicht lesbar (Word, fehlender `path`, Netz): `Fehler: …`, der Agent sagt es dem
    Nutzer.
* **`search_images { query }`** – Wikimedia-Commons-API direkt aus der App (CORS
  `origin=*`), kein Space-Hop. Ergebnis: bis zu 6 Treffer mit `title`, `thumb`,
  `page`, `license`, `author`. Bilder werden im Chat mit Quelle und Lizenz genannt.

Der Zugriff auf die Aufgabe läuft über `api.readAttachment`, das `useAgent` im
`task`-Modus setzt, wie `create_note`/`open_note` über `api.createNote`.

## 5. Kontext und Prompt

* **Aufgabenblock** (`buildTaskContext`), harte Grenze 1600 Zeichen, Rang von oben:
  1. Art, Fach, Titel, Frist, Uhrzeit.
  2. Beschreibung (400 Zeichen), Thema und Lernplan bei Klausuren.
  3. Anhänge: `0: dateiname.pdf` je Zeile, ohne Pfad. Nicht verfügbare markiert.
  4. Ordner des Fachs mit `folderId`.
  5. Lernstand (Dashboard, schwache Themen) bei Klausuren.
  6. Gedächtnis zum Fach, max. 4 Einträge.
* **Prompt**: der bestehende Basisprompt, ohne Editor- und Schul-Regeln, plus
  Aufgabenregeln: Aufgabe aus Stoff der Bibliothek lösen, vor dem Lesen des Anhangs
  `read_attachment` aufrufen, nie raten was im Anhang steht.
* **Kosten**: Zeichen von Aufgabenblock und neuen Tool-Schemas werden gemessen und im
  Bericht genannt (Regel: Agent-Kontext knapp halten).

## 6. Startnachricht

* Auslöser: Aufgabe seit 1,5 s ausgewählt, Chat leer, Aufgabe nicht erledigt, kein
  Lauf aktiv. Durchblättern der Liste erzeugt keine Aufrufe.
* Aufruf: `requestCompletion` ohne `tools`. `requestCompletion` hat keine
  Token-Grenze, die Länge begrenzt der Mini-Prompt (höchstens 110 Wörter).
* Mini-Prompt: Aufgabe, Anhangsnamen und eine Zeile der verfügbaren Fähigkeiten.
  Anweisung: 3 bis 5 konkrete Vorschläge für genau diese Aufgabe. Was nicht ganz
  geht (z. B. fertige Präsentation), als Teilschritt anbieten (Inhalt recherchieren,
  Gliederung, Bilder suchen). Nur vorschlagen, nichts ausführen, keine Rückfrage-Wand.
* Ergebnis wird als erste `assistant`-Nachricht in den Verlauf geschrieben und danach
  nicht neu erzeugt. Fehler (offline, Kontingent): kein Verlaufseintrag, ein
  statischer Satz mit „Nochmal versuchen“ im Chat, beim nächsten Öffnen erneut.

## 7. UI

* `src/components/TaskChat.jsx` (neu): Kopf mit Aufgabentitel (einzeilig), Verlauf,
  Eingabezeile mit Senden/Stopp. Wiederverwendet werden `StepList`, `Markdown`,
  `CopyButton` aus `AiChatPanel`/Library.
* `.cal-detail` wird bei Breite über 860 px zweispaltig: links die bisherigen
  Details (Breite bleibt `max-width: 620px`), rechts der Chat über die volle Höhe des
  Fensters, Breite `clamp(340px, 34%, 460px)`. Der Chat scrollt in sich, die Eingabe
  bleibt unten.
* Unter 860 px (Handy): der Chat steht unter den Details mit fester Mindesthöhe.
* Modell: globales Chat-Modell (`loadChatModel`), kein eigener Wähler.

## 8. Tests

* `buildTaskContext`: Deckel, Rang beim Kürzen, Anhangsliste, Klausur und Lernblock.
* `read_attachment`: Text, PDF → `pages`, nicht lesbar → `Fehler`, Index außerhalb.
* `search_images`: Antwort-Mapping, leere Antwort, Netzfehler.
* Startnachricht: einmalig, entprellt, nicht bei erledigt, nicht bei vorhandenem
  Verlauf, Fehlerfall ohne Verlaufseintrag.
* `fetchIservAttachment`: `openIservAttachment`-Test bleibt grün.
* Kalender: Chat bei Hausaufgabe, Klausur und Lernblock, nicht bei Termin und Stunde.

## 9. Offene Abhängigkeiten

* Anhangszugriff läuft über den Space. Dort fehlt noch das Secret
  `NOTES_ACCESS_TOKEN`, und die APK ist noch nicht installiert (siehe
  `2026-10-10-iserv-via-hf-space-design.md`). Ohne das antwortet `read_attachment`
  mit `Fehler`, genau wie das Öffnen heute.
* `CalendarScreen.jsx`, `calendar.css` und `calendarEntries.js` haben uncommittete
  Änderungen aus anderer Arbeit. Die Umsetzung setzt darauf auf.
