# Spezifikation: IServ-Aufgaben in der Terminplanung

## 1. Übersicht & Ziel

Die Aufgaben aus dem IServ-Aufgabentool sollen ohne Handarbeit im Lernplan der
App landen. Ein Script auf dem PC (`C:\Antigravity\AUTOMATISIERUNG`, „SchulPilot")
holt die Aufgaben bereits von IServ und legt sie in einer SQLite-Datenbank ab.
Neu ist der Weg von dort in die App: Das Script schreibt die Aufgaben samt
Beschreibung und Anhängen in einen privaten Supabase-Speicher, die App liest sie
von dort und behandelt sie wie jeden anderen Termin der Terminplanung.

Als Lernzeitaufgaben gelten **alle** Aufgaben im IServ-Aufgabentool. Es gibt
keinen Filter.

Leitprinzip: **Die Terminplanung bleibt unverändert.** IServ-Aufgaben sind
gewöhnliche `events` mit `kind: "homework"`. Sie laufen durch dieselben Funktionen
wie Termine aus dem Notiz-Scan (`mergeFindings`, `dailyBudgets`, `buildPlan`).
Nichts an den Minutenbudgets oder der Mittwochsregel ändert sich.

### 1.1 Abgrenzung

Nicht Teil dieser Spezifikation:

* **Löschen in der Cloud.** Eine Aufgabe, die in IServ verschwindet, bleibt in
  der Cloud und in der App, bis sie abgehakt ist oder ihr Datum verstreicht.
* **Import der Anhänge in die Dokumentbibliothek.** Anhänge werden geöffnet bzw.
  geteilt, aber nicht als Dokument der App angelegt.
* **Beschreibung im Prompt des Lernplans.** `buildPlan` sieht weiterhin nur
  Titel, Fach und Datum.
* **Abgeben von Aufgaben.** `submit_task_headless` im Script bleibt, wie es ist.
* **Hintergrunddienst auf dem Tablet.** Wie beim Notiz-Scan wird beim Öffnen
  gezogen, nicht im Hintergrund.
* **Bekannte Fehler im Script, die nicht zu dieser Arbeit gehören.**
  `Orchestrator.submit_task_to_iserv` ruft `self.db.get_task` auf, die Methode
  heißt `get_task_by_id`. Das wird hier nicht angefasst.

---

## 2. Benutzerverhalten

Luca richtet den Weg einmal ein (Abschnitt 8). Danach:

1. Das Script läuft wie bisher (`--sync` oder `--auto`) und schiebt am Ende jedes
   Durchlaufs den Stand der IServ-Aufgabenliste in die Cloud.
2. Beim Öffnen der Bibliothek zieht die App die Liste. Neue Aufgaben erscheinen in
   der Karte „Bald fällig" mit der Quelle „IServ".
3. Im Plan-Bildschirm stehen die Aufgaben im Lernplan, verteilt nach den
   bestehenden Regeln (30 Minuten je Aufgabe, verteilt bis zur Frist, mittwochs
   nichts). Ein neuer Abschnitt „IServ-Aufgaben" zeigt jede offene Aufgabe zum
   Aufklappen mit Beschreibung und Anhängen. Ein Tipp auf einen Anhang öffnet das
   Teilen-Menü des Systems, in dem Luca einen PDF-Viewer wählt.
4. Abhaken funktioniert wie bei jedem Termin. Das Häkchen bleibt erhalten, wenn
   dieselbe Aufgabe beim nächsten Pull erneut ankommt.

---

## 3. Architektur

```
IServ ──Playwright──> Fetcher ──> SQLite (bestehend)
                          │
                          └─ last_list (neu, Liste des aktuellen Durchlaufs)
                                   │
                          NotesSync (neu, PC) ──HTTPS──> Supabase
                                                          ├─ notesapp.iserv_tasks
                                                          └─ Storage: notesapp-iserv
                                                                   │
                          iservSync.js (neu, App) <──HTTPS─────────┘
                                   │
                          knowledgeRepository.mergeFindings (bestehend)
                                   │
                          UpcomingCard / PlanScreen / buildPlan (bestehend)
```

PC und Tablet melden sich mit **demselben** Supabase-Account an (E-Mail und
Passwort). Beide benutzen nur den öffentlichen Anon-Key plus die Sitzung des
Accounts. Der Service-Key wird nirgends gebraucht. Die Zeilen gehören dem
Account, die RLS erzwingt das.

### 3.1 Cloud (`supabase/iserv_tasks.sql`, neu)

```sql
create table if not exists notesapp.iserv_tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,                        -- Aufgaben-URL, wie tasks.id im Script
  title text not null,
  subject text not null default '',
  due date,                                -- null, wenn die Frist nicht lesbar war
  deadline_raw text not null default '',
  url text not null default '',
  description text not null default '',    -- Originaltext, nicht zensiert
  attachments jsonb not null default '[]', -- [{filename, path, size_bytes}]
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
```

* RLS aktiv, eine Policy `for all using (auth.uid() = user_id) with check (…)`,
  Muster wie bei `untis_credentials`.
* `grant usage on schema notesapp` besteht bereits, die Tabelle bekommt
  `grant all … to authenticated`.
* Privater Bucket `notesapp-iserv`. Objektpfad `<user_id>/<task_hash>/<dateiname>`,
  vier Policies (select, insert, update, delete) über
  `(storage.foldername(name))[1] = auth.uid()::text`, Muster wie beim
  Backup-Bucket.
* `task_hash` sind die ersten 16 Hex-Zeichen von SHA-1 der Aufgaben-ID. Der
  Dateiname im Pfad wird auf `[A-Za-z0-9._-]` bereinigt, der Originalname steht
  in `attachments[].filename`.

### 3.2 PC (`C:\Antigravity\AUTOMATISIERUNG`)

**`config/settings.py`** bekommt vier optionale Felder: `supabase_url`,
`supabase_anon_key`, `supabase_email`, `supabase_password` (`SecretStr`). Luca
trägt sie in die `.env` ein. Ist eines leer, überspringt der Push mit einer
Debug-Meldung.

**`input/iserv_fetcher.py`**

* `fetch_new_tasks` behält seine Rückgabe (nur neue Aufgaben). Zusätzlich setzt
  es `self.last_list`, die vollständige Liste des Durchlaufs (Titel, Frist, URL,
  Fach), auch für bekannte Aufgaben.
* `_scrape_list` liest die Spaltenköpfe (`thead th`, das sind UI-Labels) und
  wählt die Spalte, deren Kopf auf `kurs|fach|tag` passt und die weder Titel-
  noch Fristspalte ist, als Fach. Gibt es sie nicht, bleibt das Fach leer. Die
  Auswahl steckt in einer reinen Hilfsfunktion `pick_subject(headers, texts)`.
* Es werden weiterhin keine Titel oder Beschreibungen geloggt (Regel aus
  `.agents/AGENTS.md`). Das gilt auch für alles Neue.

**`output/notes_sync.py`** (neu, `NotesSync`, `httpx.AsyncClient`, keine neue
Abhängigkeit)

1. `POST {url}/auth/v1/token?grant_type=password` mit Header `apikey` liefert
   `access_token` und `user.id`. Der Token gilt für diesen Lauf, es gibt keinen
   Refresh.
2. Für jeden Eintrag von `last_list` holt es Beschreibung und Anhänge aus der DB
   (`get_task_by_id`) und baut die Zeile. Die Frist wird per Regex
   `(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})` zu ISO, ein ungültiges Datum wie
   `31.02.` ergibt `null`.
3. Anhänge mit `file_data` und höchstens `max_attachment_mb` werden nach
   `POST {url}/storage/v1/object/notesapp-iserv/<pfad>` hochgeladen, ohne
   Upsert. Ein 409 („gibt es schon") zählt als Erfolg. Anhänge ohne Daten
   (Download gescheitert oder zu groß) bekommen `path: null`.
4. Alle Zeilen gehen in einem Aufruf an
   `POST {url}/rest/v1/iserv_tasks?on_conflict=user_id,id` mit
   `Content-Profile: notesapp` und
   `Prefer: resolution=merge-duplicates,return=minimal`.
5. `push()` wirft nie. Jeder Fehler wird als Warnung ohne Titel oder
   Beschreibung geloggt.

**`scheduler/orchestrator.py`**: `run_sync_pipeline` ruft `NotesSync.push`
direkt nach dem Abruf auf, **vor** dem Zweig „keine neuen Aufgaben". Sonst
würde ein Lauf ohne neue Aufgaben nie synchronisieren, und Änderungen an Frist
oder Fach kämen nie an. Der Discord-Ablauf bleibt unberührt.

### 3.3 App

**`src/lib/iservClient.js`** (neu): ein eigener Supabase-Client mit
`auth: { storageKey: "notes.iserv-auth" }`. Er ist von `supabaseClient.js`
getrennt, weil dessen anonyme Sitzung sonst durch den Account-Login ersetzt
würde und Untis-Spiegel und Backups unter einer anderen `user_id` liefen.

**`src/ink/iservSettings.js`** (neu): laden, speichern, löschen der
Zugangsdaten (E-Mail, Passwort), gleiches Muster wie `untisSettings.js`
(SecureStorage nativ, localStorage im Browser), aber **ohne** Cloud-Spiegel.

**`src/components/Settings.jsx`**: ein Abschnitt „IServ-Sync-Account" mit zwei
Feldern, wie der Untis-Block.

**`src/knowledge/iservSync.js`** (neu, ohne React):

* `rowToEvent(row)` gibt `{ kind: "homework", title, subject, due, iservId, url,
  description, attachments }` zurück, oder `null`, wenn Titel oder `due` fehlen.
* `pullIservEvents({ client, credentials })` sorgt für eine Sitzung
  (`getSession`, sonst `signInWithPassword`), liest `notesapp.iserv_tasks` und
  gibt die Events zurück.
* `openIservAttachment({ client, attachment })` lädt die Datei aus dem Bucket
  (`storage.from("notesapp-iserv").download(path)`) und ruft `saveAndShare`
  aus `exportDocument.js` auf. Diese Funktion wird dafür exportiert.

**`src/knowledge/knowledgeRepository.js`**

* `eventKey` bekommt einen Sonderfall: Events mit `iservId` haben den Schlüssel
  `iserv|<iservId>`. Ändert sich Titel oder Frist in IServ, wird derselbe Termin
  aktualisiert statt ein zweiter angelegt. `done` bleibt (Logik in `mergeList`).
* `mergeFindings` reicht `iservId`, `url`, `description` und `attachments`
  durch, wenn `iservId` gesetzt ist.

**`src/hooks/useKnowledge.js`**

* Neuer optionaler Parameter `syncIserv` (async Funktion, die die Events holt
  und per `mergeFindings` mit `sourceNoteId: "iserv"` einträgt, Rückgabe: Anzahl
  neuer Termine). Ohne den Parameter ändert sich nichts, bestehende Tests bleiben
  gültig.
* Er läuft einmal beim Einhängen (neben dem Scan) und in `refreshPlan` **vor**
  `buildPlan`.
* Kamen beim Einhängen neue Termine hinzu, setzt der Hook `plan` auf `null`.
  Sonst bliebe ein heute schon berechneter Plan ohne die neuen Aufgaben stehen,
  denn `PlanScreen` erneuert nur Pläne von gestern. Der Plan ist abgeleitet und
  wird beim Öffnen des Plan-Bildschirms neu gebaut.
* `iservState` (`"off" | "ok" | "error"`) ist der neue Rückgabewert.
* Der PlanScreen hat eine eigene Hook-Instanz, es kann also zwei Pulls
  hintereinander geben. Der Aufruf ist idempotent und billig, deshalb wird das
  nicht entdoppelt.

**`src/components/Library.jsx`**: übergibt `syncIserv` und ergänzt
`sourceNoteTitles` um `iserv: "IServ"`.

**`src/components/PlanScreen.jsx`**: neuer Abschnitt „IServ-Aufgaben" oben in der
rechten Spalte, über dem Glossar. Er zeigt alle offenen Events mit `iservId`,
nach Frist sortiert, überfällige eingeschlossen. Jeder Eintrag ist ein natives
`<details>`: Zusammenfassung mit Titel, Fach und Frist, Inhalt mit Beschreibung
(`white-space: pre-wrap`), Anhangsliste und „Erledigt". Anhänge ohne `path`
erscheinen deaktiviert mit „nicht verfügbar". Bei `iservState === "error"` steht
eine Zeile „IServ-Sync nicht erreichbar", ohne Fehlerdetails.

---

## 4. Fehlerverhalten

| Fall | Verhalten |
|---|---|
| Supabase-Felder in der `.env` leer | Push wird übersprungen, Debug-Meldung |
| Login am PC scheitert | Warnung, kein Abbruch der Pipeline, Discord läuft weiter |
| Upload eines Anhangs scheitert | Anhang bekommt `path: null`, die anderen laufen weiter |
| IServ-Scrape liefert eine leere Liste | Es wird nichts gepusht, nichts gelöscht |
| Frist nicht lesbar | Zeile mit `due: null` in der Cloud, die App ignoriert sie |
| Keine Zugangsdaten in der App | `iservState: "off"`, kein Netzwerkzugriff |
| App-Pull scheitert | `iservState: "error"`, lokale Daten bleiben unverändert |
| Dieselbe Aufgabe kommt erneut | Update über `iserv|<iservId>`, `done` bleibt |

---

## 5. Datenschutz

* Beschreibungen gehen im **Originaltext** in die Cloud (Entscheidung von Luca).
  Die zensierte Fassung (`clean_description`, Presidio) bleibt für Discord und
  die Modelle zuständig.
* Der Speicher ist privat: RLS pro Account, kein öffentliches Lesen, privater
  Bucket, Anhänge nur über die Sitzung des Accounts abrufbar.
* Das Passwort des gemeinsamen Accounts steht in der PC-`.env` und im
  SecureStorage des Tablets. Es wird nicht in die Cloud gespiegelt.
* Logs enthalten keine Titel, Beschreibungen oder Dateinamen.

---

## 6. Tests

**PC (pytest, keine Netzwerkzugriffe):**

* Fristparser: `"Do, 24.09.2026 14:30"` → `2026-09-24`, zweistelliges Jahr,
  `31.02.2026` → `None`, leerer String → `None`.
* `pick_subject`: Kopf vorhanden, Kopf fehlt, Kopf deckt sich mit Titel- oder
  Fristspalte.
* `NotesSync` mit `httpx.MockTransport`: Reihenfolge Login → Upload → Upsert,
  Zeilenform, 409 beim Upload gilt als Erfolg, Anhang ohne Daten → `path: null`,
  leere Settings → kein Request, Netzwerkfehler → kein Wurf.

**App (vitest):**

* `rowToEvent`: vollständige Zeile, fehlender Titel, fehlendes `due`.
* `pullIservEvents` mit einem Fake-Client: ohne Sitzung wird angemeldet, mit
  Sitzung nicht.
* `mergeFindings`: erneuter Pull aktualisiert Titel und Frist am selben Termin,
  `done` bleibt, ein Scan-Termin mit gleichem Titel wird nicht verschluckt.
* `useKnowledge`: `syncIserv` läuft vor `buildPlan`, ohne `syncIserv` bleibt das
  Verhalten unverändert, nach neuen Terminen ist `plan` `null`.
* `PlanScreen`: Abschnitt mit `<details>`, deaktivierter Anhang, Fehlerzeile.

Gegen das echte IServ und das echte Supabase-Projekt wird nicht getestet. Das
Script liest private Schuldaten, und das Projekt gehört Luca. Die Abnahme
(Abschnitt 8, Schritt 6) macht Luca selbst.

---

## 7. Annahmen

Diese Punkte lassen sich erst bei der Umsetzung oder bei Luca klären. Keiner
verlangt, private Inhalte zu lesen.

1. **Spaltenlayout der IServ-Liste.** Das Script nimmt heute Spalte 3 als Frist.
   Ob es eine Kurs-, Fach- oder Tag-Spalte gibt, ist unbekannt. Ohne sie bleibt
   das Fach leer, und die Aufgaben heißen in der App „Ohne Fach".
2. **Fristformat.** Angenommen wird ein `dd.mm.yyyy` irgendwo im Text.
3. **Supabase-Projekt.** E-Mail/Passwort-Login ist aktiviert, und
   `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` sind im App-Build gesetzt
   (der bestehende Client benutzt beide).
4. **Speicherlimit.** `max_attachment_mb` steht im Script auf 20 und liegt unter
   dem Standardlimit von Supabase (50 MB).
5. **Zwei Repositories.** `AUTOMATISIERUNG` hat noch keinen Commit auf `master`.
   Die Änderungen dort bleiben unversioniert, bis Luca entscheidet.

---

## 8. Einrichtung durch Luca

1. `supabase/iserv_tasks.sql` im Supabase-Dashboard (SQL-Editor) ausführen.
2. Im Dashboard unter Authentication einen Account anlegen, mit
   „Auto Confirm User".
3. In die PC-`.env` eintragen: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_EMAIL`, `SUPABASE_PASSWORD`.
4. In der App unter Einstellungen den Account („IServ-Sync-Account") eintragen.
5. APK neu bauen und installieren (Skill `update-tablet-app`).
6. `python main.py --sync` ausführen, die App öffnen und prüfen, dass die
   Aufgaben in „Bald fällig" und im Plan stehen, dass eine Beschreibung
   aufklappt und dass ein Anhang das Teilen-Menü öffnet.
