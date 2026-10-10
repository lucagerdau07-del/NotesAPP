# Spezifikation: IServ-Aufgaben direkt vom HF-Space, ohne PC

Löst den Weg PC-Script → Supabase aus `2026-09-21-iserv-lernzeit-sync-design.md` ab.
Der HF-Space (`luca448-app-backend`) liest IServ selbst, die App fragt ihn direkt.
Das PC-Script wird für die App nicht mehr gebraucht.

## 1. Ziel

* Aufgaben, Fristen, Beschreibungen und Anhänge kommen vom Space, auch wenn der PC aus ist.
* Hat eine Aufgabe in IServ den Status **erledigt** oder **abgelaufen**, ist sie in der App abgehakt
  (und fällt damit aus dem Lernplan).

Nicht Teil: das Abgeben von Aufgaben, ein Hintergrunddienst auf dem Tablet, Änderungen an Muse
(`/iserv/tasks`, `/iserv/freigabe`) und am gefilterten Python-Dienst `iserv-filter/`.

## 2. Architektur

```
App ──x-app-key──> GET /api/notes/iserv/tasks ──> Puppeteer ──> IServ (Liste + offene Aufgabenseiten)
    └─x-app-key──> GET /api/notes/iserv/file?path=…  ──> Puppeteer ──> IServ (eine Datei)
```

IServ-Zugangsdaten stehen nur in den Space-Secrets (`ISERV_BASE_URL`, `ISERV_USERNAME`,
`ISERV_PASSWORD`, wie bei Muse). Die App schickt keine IServ-Daten. Sie braucht nur den
Zugriffsschlüssel, den sie für den Agenten schon hat (`loadAgentConfig`: `baseUrl`, `accessKey`).

## 3. HF-Space (`C:\Antigravity\app-backend-temp`)

**`src/api/iserv.js`**: die Anmeldung wird aus `fetchIServTasks` in `openIServPage` herausgezogen
(Verhalten unverändert). Neu:

* `fetchIServOverview(url, user, pass)`: meldet an, liest die Liste mit `parseListHtml` und lädt für jede
  **offene** Aufgabe die Aufgabenseite per `fetch` im angemeldeten Tab (höchstens vier gleichzeitig,
  `parseTaskHtml`). Erledigte und abgelaufene Aufgaben bekommen keine Aufgabenseite. Es werden keine
  Dateien geladen, nichts wird zensiert (die App ist der eigene Client; Entscheidung von Luca vom 21.09.),
  und es werden keine Mock-Aufgaben erfunden. Rückgabe je Aufgabe:
  `{ id, url, title, tags, due, done, expired, description, attachments: [{ filename, path }] }`.
  `due` ist `yyyy-mm-ddThh:mm` (Listenspalte `data-sort`), sonst `yyyy-mm-dd` aus dem Fristtext, sonst `null`.
  `path` ist Pfad plus Query des Download-Links; nur Dateien der Lehrkraft (`provided`).
* `downloadIServFile(url, user, pass, path)`: meldet an und holt genau diese Datei per `fetch` im Tab.
  Höchstens 25 MB.

**`src/api/iserv-parse.js`**: `parseListHtml` liefert zusätzlich `expired`
(`/abgelaufen|expired/i` auf den `title`-Attributen der Zeile, wie `done`).

**`src/api/iserv-notes.js`** (neu): `registerIServNotes(app, { overview, file })`.

* Beide Routen **schließen bei fehlender Konfiguration**: ist `NOTES_ACCESS_TOKEN` kürzer als
  16 Zeichen, antworten sie 503 `config`; ein falscher Schlüssel ergibt 401. (`checkNotesAccess` der
  übrigen Notes-Routen lässt ohne Token alles durch, das ist hier nicht tragbar.)
* `GET /api/notes/iserv/tasks`: höchstens eine IServ-Sitzung gleichzeitig (Warteschlange wie in
  `iserv-filtered.js`), Ergebnis 3 Minuten im Arbeitsspeicher, damit mehrfaches Öffnen der App
  nicht jedes Mal einloggt. Antwort `{ tasks, fetchedAt }`, `Cache-Control: no-store`.
* `GET /api/notes/iserv/file?path=…`: `path` muss mit `/iserv/` beginnen, darf weder `..`, noch `//`,
  noch ein Schema enthalten. Der Inhalt wird mit dem `Content-Type` von IServ durchgereicht, die App benennt die Datei selbst.
* Fehler tragen nur einen Code (`config`, `unauthorized`, `unreachable`, `bad_path`, `too_large`),
  nie die Schuldomain oder Aufgabentexte. Nichts davon wird geloggt.

**`server.js`**: `registerIServNotes(app, …)` neben `registerIServFiltered(app)`.

## 4. App

**`src/knowledge/iservSync.js`**

* `taskToEvent(task)`: `{ kind: "homework", title, subject: tags, due, time?, iservId: url, url, description,
  attachments: [{ filename, path }], iservClosed }`. `iservClosed` ist `done || expired`. `null`, wenn
  Titel oder Frist fehlen.
* `pullIservEvents({ config, fetchImpl })`: GET `${baseUrl}/iserv/tasks` mit `x-app-key`, 25 s Timeout.
* `syncIserv({ repository, loadConfig, fetchImpl })`: `null` ohne `accessKey` (`iservState: "off"`),
  sonst Anzahl neuer Termine; wirft bei Fehlern (`iservState: "error"`).
* `openIservAttachment({ attachment, config, share, fetchImpl })`: lädt über `/iserv/file` und ruft
  `saveAndShare`.
* Der Supabase-Weg entfällt: `src/lib/iservClient.js`, `src/ink/iservSettings.js`, der Abschnitt
  „ISERV-SYNC" in den Einstellungen und `ISERV_BUCKET`.

**`src/knowledge/knowledgeRepository.js`**

* `eventKey`: aus `iservId` wird die Zahl hinter `/exercise/show/` genommen, sonst der Wert selbst.
  Bereits gespeicherte Termine (Schlüssel aus der vollen URL) und neue treffen sich damit, auch wenn
  sich die Schreibweise der Domain unterscheidet.
* `mergeFindings` für Termine mit `iservId`:
  * Bekannter Termin, `iservClosed` jetzt wahr und vorher nicht: `done = true`. Danach bleibt ein
    Un-Häkchen in der App stehen, bis sich der Status ändert.
  * Unbekannter Termin, `iservClosed`: wird nicht angelegt (sonst käme die ganze IServ-Historie in den
    Kalender).
  * Der Wert `iservClosed` wird am Termin gespeichert.
* Der Lernplan baut sich selbst neu, weil `done` im `planInputsKey` steckt.

**`CalendarScreen.jsx`**: `openIservAttachment({ attachment })` ohne Supabase-Client. Ein Anhang ist
nicht mehr „nicht verfügbar", solange er einen `path` hat.

## 5. Fehlerverhalten

| Fall | Verhalten |
|---|---|
| Kein `accessKey` in der App | `iservState: "off"`, kein Netzzugriff |
| Space schläft / nicht erreichbar / 25 s Timeout | `iservState: "error"`, lokale Daten bleiben |
| Space ohne `NOTES_ACCESS_TOKEN` oder `ISERV_*` | 503 `config`, in der App „IServ nicht erreichbar" |
| IServ-Login scheitert | 502 `unreachable`, Liste bleibt leer, nichts wird gelöscht |
| Liste leer | App ändert nichts |
| Anhang nicht ladbar | „Anhang konnte nicht geöffnet werden." |

## 6. Annahmen

1. Das Status-Icon trägt „Erledigt" im `title` (live gesehen, Kommentar in `iserv-parse.js`). Für
   „abgelaufen" wird dasselbe Muster geraten; stimmt es nicht, fehlt nur diese Erkennung.
2. Die Space-Secrets `ISERV_*` und `NOTES_ACCESS_TOKEN` sind gesetzt (Muse und der Agent nutzen sie).
3. Der Download per `fetch` im Tab klappt wie beim bestehenden Fetcher. Verweigert IServ die Datei,
   meldet die App den Fehler beim Öffnen.

## 7. Tests

* HF (`node --test`): `parseListHtml` mit `expired`; `registerIServNotes` mit eingespritzten Fakes
  (fail-closed, falscher Schlüssel, Cache, Pfadprüfung, Fehlercodes ohne Domain).
* App (vitest): `taskToEvent`, `pullIservEvents`/`syncIserv` mit Fake-`fetch`, `eventKey`-Normalisierung,
  Merge (offen→erledigt, Un-Häkchen bleibt, neu+geschlossen wird übersprungen), `openIservAttachment`,
  Kalender-Test ohne Supabase-Client.
* Gegen das echte IServ wird nicht getestet. Die Abnahme macht Luca nach dem Deploy.
