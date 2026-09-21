# IServ-Aufgaben in der Terminplanung — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aufgaben aus dem IServ-Aufgabentool kommen samt Beschreibung und Anhängen über einen privaten Supabase-Speicher in die App und erscheinen dort als Termine im Lernplan.

**Architecture:** Das PC-Script (SchulPilot) schreibt nach jedem Sync alle aktuell gelisteten Aufgaben in `notesapp.iserv_tasks` und lädt Anhänge in den Bucket `notesapp-iserv`. Die App liest die Zeilen mit einem eigenen Supabase-Client (gemeinsamer Account) und trägt sie über das bestehende `mergeFindings` als `homework`-Events ein. `dailyBudgets` und `buildPlan` bleiben unverändert.

**Tech Stack:** Python 3.10 (httpx, pytest, pydantic), React 19 + Vite + Vitest, `@supabase/supabase-js`, Capacitor (Filesystem, Share, SecureStorage), Supabase (Postgres/RLS/Storage).

**Spec:** `docs/superpowers/specs/2026-09-21-iserv-lernzeit-sync-design.md`

## Global Constraints

- Als Lernzeitaufgaben gelten **alle** IServ-Aufgaben, es gibt keinen Filter.
- Tabelle `notesapp.iserv_tasks`, Bucket `notesapp-iserv` (privat), Objektpfad `<user_id>/<task_hash>/<dateiname>`. `task_hash` = erste 16 Hex-Zeichen von SHA-1 der Aufgaben-ID, der Dateiname wird auf `[A-Za-z0-9._-]` bereinigt.
- Events aus IServ haben `kind: "homework"`, `sourceNoteId: "iserv"` und einen Schlüssel `iserv|<iservId>`. `HOMEWORK_MINUTES` und die Mittwochsregel in `studyPlan.js` bleiben unverändert.
- Eigener Supabase-Client mit `auth: { storageKey: "notes.iserv-auth" }`. `src/lib/supabaseClient.js` (anonyme Sitzung für Untis-Spiegel und Backups) wird nicht angefasst.
- Der IServ-Account wird nicht in die Cloud gespiegelt: Passwort nur in der PC-`.env` und im SecureStorage des Tablets.
- **Datenschutz im PC-Script:** Logs enthalten keine Titel, Beschreibungen, Dateinamen oder URLs mit Dateinamen (Regel aus `AUTOMATISIERUNG/.agents/AGENTS.md`). Die Dateien `.env`, `private.env`, Screenshots und Aufgabeninhalte in der DB werden weder gelesen noch ausgegeben. Es wird nicht gegen das echte IServ oder das echte Supabase-Projekt getestet, das macht Luca selbst (Abschnitt „Abnahme").
- `AUTOMATISIERUNG` wird nur um optionale Felder ergänzt; sind sie leer, überspringt der Push. `.env` wird **nicht** angefasst.
- Beschreibungen gehen im Originaltext in die Cloud (nicht `clean_description`).
- Code-Kommentare und UI-Texte sind deutsch, wie im Rest der Codebasis.
- `NotesAPP` hat unabhängige, uncommittete Änderungen (`src/documents/notePreview.js`, `src/hooks/useLiquidGlass.js`, `tests/liquidGlassRecapture.test.js`). **Nie** `git add -A` oder `git add .`, immer explizite Pfade. `AUTOMATISIERUNG` hat noch keinen Commit auf `master`, dort gibt es keine Commit-Schritte (Spec Abschnitt 7 Nr. 5).
- Test-Kommandos: PC im Ordner `C:\Antigravity\AUTOMATISIERUNG` mit `python -m pytest tests -q` (nie ohne `tests`, sonst sammelt pytest die Skripte `test_500.py`, `test_sync.py`, `test_inputs.py` im Wurzelordner ein, die den echten Fetcher starten). App im Ordner `C:\Antigravity\NotesAPP` mit `npx vitest run <datei>`.

## Dateien

**PC (`C:\Antigravity\AUTOMATISIERUNG`)**

| Datei | Änderung |
|---|---|
| `core/iserv_rows.py` | neu: reine Helfer (`task_id_of`, `parse_deadline`, `pick_subject`, `task_hash`, `safe_filename`), importiert nichts aus `config` |
| `output/notes_sync.py` | neu: `NotesSync` und `build_row`, nur stdlib und `httpx` |
| `input/iserv_fetcher.py` | `last_list`, Fach aus der Spaltenkopf-Zeile |
| `config/settings.py` | vier optionale Supabase-Felder |
| `scheduler/orchestrator.py` | Push direkt nach dem Abruf, vor dem Early-Return |
| `tests/test_iserv_rows.py`, `tests/test_notes_sync.py` | neu |

**Cloud und App (`C:\Antigravity\NotesAPP`)**

| Datei | Änderung |
|---|---|
| `supabase/iserv_tasks.sql` | neu |
| `src/knowledge/knowledgeRepository.js` | Schlüssel `iserv|<id>`, Durchreichfelder |
| `src/lib/iservClient.js` | neu: eigener Supabase-Client |
| `src/ink/iservSettings.js` | neu: Zugangsdaten laden und speichern |
| `src/knowledge/iservSync.js` | neu: `rowToEvent`, `pullIservEvents`, `syncIserv`, `openIservAttachment` |
| `src/hooks/useKnowledge.js` | Parameter `syncIserv`, Rückgabe `iservState`, Plan-Invalidierung |
| `src/components/Settings.jsx` | Abschnitt „IServ-Sync-Account" |
| `src/components/IservTaskList.jsx` | neu: aufklappbare Aufgabenliste |
| `src/components/UpcomingCard.jsx` | `formatDue` exportieren |
| `src/components/PlanScreen.jsx` | Abschnitt „IServ-Aufgaben" |
| `src/components/Library.jsx` | `syncIserv` übergeben, Quelle „IServ" |
| `src/styles/main.css` | Stile für die Aufgabenliste |
| `tests/knowledgeRepository.test.js` (ergänzt), `tests/iservSync.test.js`, `tests/useKnowledge.test.jsx` (ergänzt), `tests/settingsIserv.test.jsx`, `tests/planScreenIserv.test.jsx` | Tests |

---

### Task 1: PC — reine Helfer für Fristen, Fach und Pfade

**Files:**
- Create: `C:\Antigravity\AUTOMATISIERUNG\core\iserv_rows.py`
- Test: `C:\Antigravity\AUTOMATISIERUNG\tests\test_iserv_rows.py`

**Interfaces:**
- Produces (Task 2, Task 3 verwenden genau diese Namen):
  - `task_id_of(raw: dict) -> str` — `raw["url"]`, sonst `raw["title"]`, sonst `""`
  - `parse_deadline(text: str) -> Optional[str]` — ISO-Datum `YYYY-MM-DD` oder `None`
  - `pick_subject(headers: List[str], texts: List[str], title: str = "", deadline_index: int = 2) -> str`
  - `task_hash(task_id: str) -> str` — 16 Hex-Zeichen
  - `safe_filename(name: str) -> str`

- [ ] **Step 1: Failing test schreiben**

`tests/test_iserv_rows.py`:

```python
from core.iserv_rows import parse_deadline, pick_subject, safe_filename, task_hash, task_id_of


def test_parse_deadline_reads_german_date():
    assert parse_deadline("Do, 24.09.2026 14:30") == "2026-09-24"


def test_parse_deadline_expands_two_digit_year():
    assert parse_deadline("24.9.26") == "2026-09-24"


def test_parse_deadline_rejects_impossible_date():
    assert parse_deadline("31.02.2026") is None


def test_parse_deadline_without_date_is_none():
    assert parse_deadline("") is None
    assert parse_deadline("bald") is None


def test_pick_subject_uses_subject_column():
    headers = ["Titel", "Kurs", "Abgabe"]
    texts = ["Blatt 3", "Mathe LK", "24.09.2026"]
    assert pick_subject(headers, texts, "Blatt 3") == "Mathe LK"


def test_pick_subject_without_matching_header_is_empty():
    headers = ["Titel", "Status", "Abgabe"]
    texts = ["Blatt 3", "offen", "24.09.2026"]
    assert pick_subject(headers, texts, "Blatt 3") == ""


def test_pick_subject_ignores_title_and_deadline_column():
    headers = ["Kurs", "Titel", "Tag"]
    texts = ["Blatt 3", "Blatt 3", "24.09.2026"]
    assert pick_subject(headers, texts, "Blatt 3") == ""


def test_pick_subject_survives_short_row():
    assert pick_subject(["Titel", "Kurs"], ["Blatt 3"], "Blatt 3") == ""


def test_task_id_prefers_url_then_title():
    assert task_id_of({"url": "https://x/1", "title": "A"}) == "https://x/1"
    assert task_id_of({"title": "A"}) == "A"
    assert task_id_of({}) == ""


def test_task_hash_is_stable_and_short():
    assert task_hash("abc") == task_hash("abc")
    assert len(task_hash("abc")) == 16
    assert task_hash("abc") != task_hash("abd")


def test_safe_filename_replaces_unsafe_characters():
    assert safe_filename("Blatt 3 äöü.pdf") == "Blatt_3____.pdf"


def test_safe_filename_never_yields_path_traversal_or_empty_name():
    assert safe_filename("..") == "datei"
    assert safe_filename("") == "datei"
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `cd /c/Antigravity/AUTOMATISIERUNG && python -m pytest tests/test_iserv_rows.py -q`
Expected: FAIL mit `ModuleNotFoundError: No module named 'core.iserv_rows'`

- [ ] **Step 3: Minimal implementieren**

`core/iserv_rows.py`:

```python
"""Reine Helfer für die IServ-Aufgabenliste. Importiert bewusst nichts aus
config, damit Tests die .env nie laden."""
import hashlib
import re
from datetime import date
from typing import List, Optional

_DATE = re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})")
_SUBJECT_HEADER = re.compile(r"\b(kurse?|fach|fächer|tags?)\b", re.IGNORECASE)


def task_id_of(raw: dict) -> str:
    """Eindeutige ID einer Aufgabe der Liste (URL, sonst Titel)."""
    return raw.get("url") or raw.get("title") or ""


def parse_deadline(text: str) -> Optional[str]:
    """Erstes dd.mm.yyyy (oder dd.mm.yy) im Text als ISO-Datum, sonst None."""
    match = _DATE.search(text or "")
    if not match:
        return None
    day, month, year = (int(part) for part in match.groups())
    if year < 100:
        year += 2000
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def pick_subject(headers: List[str], texts: List[str], title: str = "", deadline_index: int = 2) -> str:
    """Fach einer Listenzeile: erste Spalte mit Kurs/Fach/Tag im Kopf, die weder
    die Frist- noch die Titelspalte ist. Ohne Treffer bleibt das Fach leer."""
    for index, header in enumerate(headers):
        if index == deadline_index or index >= len(texts):
            continue
        if _SUBJECT_HEADER.search(header) and texts[index] and texts[index] != title:
            return texts[index]
    return ""


def task_hash(task_id: str) -> str:
    return hashlib.sha1(task_id.encode("utf-8")).hexdigest()[:16]


def safe_filename(name: str) -> str:
    """Storage-tauglicher Dateiname. Zwei Anhänge, die nach der Bereinigung gleich
    heißen, teilen sich einen Pfad (ponytail: Index voranstellen, falls das je vorkommt)."""
    return re.sub(r"[^A-Za-z0-9._-]", "_", name or "").lstrip(".") or "datei"
```

- [ ] **Step 4: Test laufen lassen, muss bestehen**

Run: `cd /c/Antigravity/AUTOMATISIERUNG && python -m pytest tests/test_iserv_rows.py -q`
Expected: `12 passed`

- [ ] **Step 5: Kein Commit**

`AUTOMATISIERUNG` hat keinen Commit auf `master`, die Dateien bleiben unversioniert (Global Constraints).

---

### Task 2: PC — `NotesSync` (Login, Upload, Upsert)

**Files:**
- Create: `C:\Antigravity\AUTOMATISIERUNG\output\notes_sync.py`
- Test: `C:\Antigravity\AUTOMATISIERUNG\tests\test_notes_sync.py`

**Interfaces:**
- Consumes (Task 1): `parse_deadline`, `safe_filename`, `task_hash`, `task_id_of` aus `core.iserv_rows`. `core.models.Attachment` hat `filename`, `mime_type`, `file_data` (Base64 oder `None`), `size_bytes`; `core.models.SchulTask` hat `description` und `attachments`.
- Produces (Task 3 verwendet genau diese Namen):
  - `NotesSync(url: str, anon_key: str, email: str, password: str, max_attachment_mb: int = 20, client: Optional[httpx.AsyncClient] = None)`
  - `NotesSync.configured -> bool`
  - `async NotesSync.push(entries: List[dict], get_task: Callable[[str], Optional[SchulTask]]) -> int` — Anzahl übertragener Zeilen, `0` bei Fehler oder fehlender Konfiguration, wirft nie
  - `build_row(user_id, task_id, entry, description, attachments) -> dict`

- [ ] **Step 1: Failing test schreiben**

`tests/test_notes_sync.py`:

```python
import asyncio
import base64
import json

import httpx

from core.models import Attachment, SchulTask
from output.notes_sync import NotesSync

URL = "https://proj.supabase.co"
ENTRY = {"title": "Blatt 3", "deadline": "Do, 24.09.2026", "url": "https://iserv/ex/1", "subject": "Mathe"}
TASK_ID = ENTRY["url"]


def make_task(description="Beschreibung", attachments=()):
    return SchulTask(
        id=TASK_ID, url=TASK_ID, title="T", deadline="24.09.2026",
        description=description, attachments=list(attachments),
    )


def attachment(name="Blatt.pdf", data=b"pdf"):
    return Attachment(
        url="u", filename=name, extension="pdf", mime_type="application/pdf",
        file_data=base64.b64encode(data).decode() if data is not None else None,
        size_bytes=len(data or b""),
    )


class Backend:
    """Zeichnet Requests auf und antwortet wie Supabase."""

    def __init__(self, known=None, upload_response=None):
        self.known = known or []
        self.upload_response = upload_response or (lambda: httpx.Response(200, json={}))
        self.requests = []

    def __call__(self, request):
        self.requests.append(request)
        path = request.url.path
        if path == "/auth/v1/token":
            return httpx.Response(200, json={"access_token": "tok", "user": {"id": "uid"}})
        if path == "/rest/v1/iserv_tasks" and request.method == "GET":
            return httpx.Response(200, json=self.known)
        if path == "/rest/v1/iserv_tasks" and request.method == "POST":
            return httpx.Response(201)
        if path.startswith("/storage/v1/object/notesapp-iserv/"):
            return self.upload_response()
        return httpx.Response(404)

    def calls(self):
        return [(r.method, r.url.path) for r in self.requests]

    def uploads(self):
        return [path for _, path in self.calls() if path.startswith("/storage/")]

    def rows(self):
        post = next(r for r in self.requests if r.method == "POST" and r.url.path == "/rest/v1/iserv_tasks")
        return json.loads(post.content)


def run(handler, entries, tasks, **kwargs):
    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            sync = NotesSync(URL, "anon", "a@b.de", "pw", client=client, **kwargs)
            return await sync.push(entries, tasks.get)

    return asyncio.run(go())


def test_push_logs_in_uploads_then_upserts():
    backend = Backend()
    assert run(backend, [ENTRY], {TASK_ID: make_task(attachments=[attachment()])}) == 1
    calls = backend.calls()
    assert calls[0] == ("POST", "/auth/v1/token")
    assert ("GET", "/rest/v1/iserv_tasks") in calls
    assert backend.uploads()[0].startswith("/storage/v1/object/notesapp-iserv/uid/")
    assert calls[-1] == ("POST", "/rest/v1/iserv_tasks")


def test_row_carries_deadline_subject_and_description():
    backend = Backend()
    run(backend, [ENTRY], {TASK_ID: make_task(description="Löse Seite 10")})
    row = backend.rows()[0]
    assert row["user_id"] == "uid"
    assert row["id"] == TASK_ID
    assert row["due"] == "2026-09-24"
    assert row["subject"] == "Mathe"
    assert row["deadline_raw"] == "Do, 24.09.2026"
    assert row["description"] == "Löse Seite 10"
    assert row["attachments"] == []


def test_upsert_uses_notesapp_profile_and_merge():
    backend = Backend()
    run(backend, [ENTRY], {TASK_ID: make_task()})
    post = next(r for r in backend.requests if r.method == "POST" and r.url.path == "/rest/v1/iserv_tasks")
    assert post.headers["content-profile"] == "notesapp"
    assert "merge-duplicates" in post.headers["prefer"]
    assert post.url.params["on_conflict"] == "user_id,id"
    assert post.headers["authorization"] == "Bearer tok"


def test_entry_without_task_in_db_is_still_synced():
    backend = Backend()
    assert run(backend, [ENTRY], {}) == 1
    assert backend.rows()[0]["description"] == ""


def test_uploaded_attachment_is_listed_with_its_path():
    backend = Backend()
    run(backend, [ENTRY], {TASK_ID: make_task(attachments=[attachment("Blatt 3.pdf")])})
    [stored] = backend.rows()[0]["attachments"]
    assert stored["filename"] == "Blatt 3.pdf"
    assert stored["path"].startswith("uid/") and stored["path"].endswith("/Blatt_3.pdf")
    assert stored["size_bytes"] == 3


def test_known_attachment_is_not_uploaded_again():
    tasks = {TASK_ID: make_task(attachments=[attachment()])}
    first = Backend()
    run(first, [ENTRY], tasks)
    path = first.rows()[0]["attachments"][0]["path"]

    second = Backend(known=[{"attachments": [{"path": path}]}])
    run(second, [ENTRY], tasks)
    assert second.uploads() == []
    assert second.rows()[0]["attachments"][0]["path"] == path


def test_duplicate_upload_response_counts_as_success():
    duplicate = lambda: httpx.Response(400, json={"statusCode": "409", "error": "Duplicate"})
    backend = Backend(upload_response=duplicate)
    run(backend, [ENTRY], {TASK_ID: make_task(attachments=[attachment()])})
    assert backend.rows()[0]["attachments"][0]["path"] is not None


def test_failed_upload_leaves_null_path_and_keeps_other_attachments():
    calls = {"count": 0}

    def flaky():
        calls["count"] += 1
        return httpx.Response(500 if calls["count"] == 1 else 200, json={})

    backend = Backend(upload_response=flaky)
    tasks = {TASK_ID: make_task(attachments=[attachment("a.pdf"), attachment("b.pdf")])}
    run(backend, [ENTRY], tasks)
    paths = [a["path"] for a in backend.rows()[0]["attachments"]]
    assert paths[0] is None
    assert paths[1] is not None


def test_attachment_without_data_gets_null_path_and_no_upload():
    backend = Backend()
    run(backend, [ENTRY], {TASK_ID: make_task(attachments=[attachment("gross.pdf", data=None)])})
    assert backend.uploads() == []
    assert backend.rows()[0]["attachments"][0]["path"] is None


def test_oversized_attachment_is_skipped():
    backend = Backend()
    tasks = {TASK_ID: make_task(attachments=[attachment("gross.pdf", data=b"x" * 2048)])}
    run(backend, [ENTRY], tasks, max_attachment_mb=0)
    assert backend.uploads() == []
    assert backend.rows()[0]["attachments"][0]["path"] is None


def test_unconfigured_sync_makes_no_request():
    backend = Backend()

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(backend)) as client:
            return await NotesSync("", "", "", "", client=client).push([ENTRY], {}.get)

    assert asyncio.run(go()) == 0
    assert backend.requests == []


def test_empty_list_makes_no_request():
    backend = Backend()
    assert run(backend, [], {}) == 0
    assert backend.requests == []


def test_failed_login_returns_zero_without_raising():
    deny = lambda request: httpx.Response(400, json={"error": "invalid_grant"})
    assert run(deny, [ENTRY], {}) == 0


def test_network_error_never_raises():
    def offline(request):
        raise httpx.ConnectError("offline")

    assert run(offline, [ENTRY], {}) == 0
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `cd /c/Antigravity/AUTOMATISIERUNG && python -m pytest tests/test_notes_sync.py -q`
Expected: FAIL mit `ModuleNotFoundError: No module named 'output.notes_sync'`

- [ ] **Step 3: Implementieren**

`output/notes_sync.py`:

```python
"""Überträgt die IServ-Aufgabenliste in den privaten Supabase-Speicher der Notizen-App.

Nur stdlib und httpx. Die Zugangsdaten kommen von außen, damit Tests die .env nie laden.
Logs enthalten niemals Titel, Beschreibungen, Dateinamen oder Pfade."""
import base64
import logging
from datetime import datetime, timezone
from typing import Callable, Dict, List, Optional, Set

import httpx

from core.iserv_rows import parse_deadline, safe_filename, task_hash, task_id_of

logger = logging.getLogger("schulpilot.notes_sync")

BUCKET = "notesapp-iserv"


def _describe(exc: Exception) -> str:
    """Nur Typ und Statuscode: der Text einer httpx-Exception enthält die URL samt Dateiname."""
    if isinstance(exc, httpx.HTTPStatusError):
        return f"HTTP {exc.response.status_code}"
    return type(exc).__name__


def _is_duplicate(response: httpx.Response) -> bool:
    """Supabase Storage meldet 'existiert schon' je nach Version als HTTP 409
    oder als HTTP 400 mit statusCode 409 im Body."""
    if response.status_code == 409:
        return True
    try:
        return str(response.json().get("statusCode")) == "409"
    except Exception:
        return False


def build_row(user_id: str, task_id: str, entry: dict, description: str, attachments: List[dict]) -> dict:
    deadline = entry.get("deadline") or ""
    return {
        "user_id": user_id,
        "id": task_id,
        "title": entry.get("title") or task_id,
        "subject": entry.get("subject") or "",
        "due": parse_deadline(deadline),
        "deadline_raw": deadline,
        "url": entry.get("url") or "",
        "description": description or "",
        "attachments": attachments,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


class NotesSync:
    def __init__(
        self,
        url: str,
        anon_key: str,
        email: str,
        password: str,
        max_attachment_mb: int = 20,
        client: Optional[httpx.AsyncClient] = None,
    ):
        self.url = url.rstrip("/")
        self.anon_key = anon_key
        self.email = email
        self.password = password
        self.max_attachment_mb = max_attachment_mb
        self._client = client

    @property
    def configured(self) -> bool:
        return all((self.url, self.anon_key, self.email, self.password))

    async def push(self, entries: List[dict], get_task: Callable[[str], Optional[object]]) -> int:
        """Überträgt die Liste des aktuellen Durchlaufs. Wirft nie: die Discord-Pipeline
        läuft auch dann weiter, wenn die Cloud nicht erreichbar ist."""
        if not self.configured:
            logger.debug("Notes-Sync nicht konfiguriert, übersprungen.")
            return 0
        if not entries:
            return 0

        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(timeout=60)
        try:
            token, user_id = await self._login(client)
            known = await self._known_paths(client, token)
            rows = []
            for entry in entries:
                task_id = task_id_of(entry)
                if not task_id:
                    continue
                task = get_task(task_id)
                attachments = await self._store_attachments(
                    client, token, user_id, task_id, task.attachments if task else [], known
                )
                rows.append(build_row(user_id, task_id, entry, task.description if task else "", attachments))
            if rows:
                await self._upsert(client, token, rows)
            logger.info("Notes-Sync: %d Aufgabe(n) übertragen.", len(rows))
            return len(rows)
        except Exception as exc:
            logger.warning("Notes-Sync fehlgeschlagen: %s", _describe(exc))
            return 0
        finally:
            if owns_client:
                await client.aclose()

    def _headers(self, token: str) -> Dict[str, str]:
        return {"apikey": self.anon_key, "Authorization": f"Bearer {token}"}

    async def _login(self, client: httpx.AsyncClient):
        response = await client.post(
            f"{self.url}/auth/v1/token",
            params={"grant_type": "password"},
            headers={"apikey": self.anon_key},
            json={"email": self.email, "password": self.password},
        )
        response.raise_for_status()
        data = response.json()
        return data["access_token"], data["user"]["id"]

    async def _known_paths(self, client: httpx.AsyncClient, token: str) -> Set[str]:
        """Pfade, die schon in der Cloud stehen, damit keine PDF bei jedem Lauf neu hochgeladen wird."""
        response = await client.get(
            f"{self.url}/rest/v1/iserv_tasks",
            params={"select": "attachments"},
            headers={**self._headers(token), "Accept-Profile": "notesapp"},
        )
        response.raise_for_status()
        return {
            item["path"]
            for row in response.json()
            for item in (row.get("attachments") or [])
            if item.get("path")
        }

    async def _store_attachments(self, client, token, user_id, task_id, attachments, known) -> List[dict]:
        limit = self.max_attachment_mb * 1024 * 1024
        stored = []
        for attachment in attachments:
            path = f"{user_id}/{task_hash(task_id)}/{safe_filename(attachment.filename)}"
            if path in known:
                available = True
            elif attachment.file_data and attachment.size_bytes <= limit:
                available = await self._upload(client, token, path, attachment)
            else:
                available = False
            stored.append(
                {
                    "filename": attachment.filename,
                    "path": path if available else None,
                    "size_bytes": attachment.size_bytes,
                }
            )
        return stored

    async def _upload(self, client, token, path, attachment) -> bool:
        try:
            response = await client.post(
                f"{self.url}/storage/v1/object/{BUCKET}/{path}",
                headers={
                    **self._headers(token),
                    "Content-Type": attachment.mime_type or "application/octet-stream",
                },
                content=base64.b64decode(attachment.file_data),
            )
        except Exception as exc:
            logger.warning("Anhang-Upload fehlgeschlagen: %s", _describe(exc))
            return False
        if response.is_success or _is_duplicate(response):
            return True
        logger.warning("Anhang-Upload fehlgeschlagen: HTTP %s", response.status_code)
        return False

    async def _upsert(self, client, token, rows: List[dict]) -> None:
        response = await client.post(
            f"{self.url}/rest/v1/iserv_tasks",
            params={"on_conflict": "user_id,id"},
            headers={
                **self._headers(token),
                "Content-Profile": "notesapp",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            json=rows,
        )
        response.raise_for_status()
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `cd /c/Antigravity/AUTOMATISIERUNG && python -m pytest tests -q`
Expected: `26 passed` (12 aus Task 1, 14 aus Task 2)

- [ ] **Step 5: Kein Commit** (siehe Task 1, Step 5)

---

### Task 3: PC — Fetcher, Settings und Orchestrator verdrahten

**Files:**
- Modify: `C:\Antigravity\AUTOMATISIERUNG\config\settings.py`
- Modify: `C:\Antigravity\AUTOMATISIERUNG\input\iserv_fetcher.py`
- Modify: `C:\Antigravity\AUTOMATISIERUNG\scheduler\orchestrator.py`

**Interfaces:**
- Consumes (Task 1, 2): `pick_subject`, `task_id_of`, `NotesSync(url, anon_key, email, password, max_attachment_mb)`, `NotesSync.push(entries, get_task)`.
- Produces: `IServFetcher.last_list: List[dict]` (Schlüssel `title`, `deadline`, `url`, `subject`), `Orchestrator.notes_sync`.

Diese Aufgabe hat keinen Unit-Test: Fetcher und Orchestrator importieren `config.settings` (lädt die `.env`) und Playwright. Geprüft wird per Syntax-Check und Lesen der Änderung; die echte Abnahme macht Luca.

- [ ] **Step 1: Settings-Felder ergänzen**

In `config/settings.py` nach dem Block `# Obsidian` (Zeile `obsidian_vault_path: ...`) einfügen:

```python
    # Supabase (Sync in die Notizen-App, optional: leer = kein Push)
    supabase_url: str = ""
    supabase_anon_key: SecretStr = SecretStr("")
    supabase_email: str = ""
    supabase_password: SecretStr = SecretStr("")

```

- [ ] **Step 2: Fetcher — Import und `last_list`**

In `input/iserv_fetcher.py`:

Nach `from core.database import Database` einfügen:
```python
from core.iserv_rows import pick_subject, task_id_of
```

In `__init__` nach `self.login_url_part = "/login"`:
```python
        # Vollständige Liste des letzten Durchlaufs (auch bekannte Aufgaben), für den Cloud-Sync.
        self.last_list: List[dict] = []
```

In `fetch_new_tasks` direkt nach `logger.info("Start IServ Fetch")`:
```python
        self.last_list = []
```

Die Zeile
```python
                raw_exercises = await self._scrape_list(page)
```
ersetzen durch
```python
                raw_exercises = await self._scrape_list(page)
                self.last_list = raw_exercises
```

Die Zeile
```python
                    task_id = raw.get("url") or raw.get("title")
```
ersetzen durch
```python
                    task_id = task_id_of(raw)
```

- [ ] **Step 3: Fetcher — Fach aus den Spaltenköpfen**

In `_scrape_list` den Anfang

```python
        exercises = []
        try:
            # Versuche zuerst die IServ 3 Tabelle (table.table)
            try:
                await page.wait_for_selector("table.table", timeout=5_000)
                rows = await page.query_selector_all("table.table tbody tr")
```

ersetzen durch

```python
        exercises = []
        headers: List[str] = []
        try:
            # Versuche zuerst die IServ 3 Tabelle (table.table)
            try:
                await page.wait_for_selector("table.table", timeout=5_000)
                rows = await page.query_selector_all("table.table tbody tr")
                # Spaltenköpfe sind UI-Labels, keine Inhalte: daraus wird die Fach-Spalte gewählt.
                headers = [(await th.inner_text()).strip() for th in await page.query_selector_all("table.table thead th")]
```

und die Zeile

```python
                exercises.append({"title": title, "deadline": deadline, "url": url})
```

ersetzen durch

```python
                exercises.append(
                    {
                        "title": title,
                        "deadline": deadline,
                        "url": url,
                        "subject": pick_subject(headers, texts, title),
                    }
                )
```

- [ ] **Step 4: Orchestrator — Push vor dem Early-Return**

In `scheduler/orchestrator.py` nach `from input.iserv_fetcher import IServFetcher` einfügen:
```python
from output.notes_sync import NotesSync
```

In `__init__` nach `self.iserv = IServFetcher(self.db)`:
```python
        self.notes_sync = NotesSync(
            url=settings.supabase_url,
            anon_key=settings.supabase_anon_key.get_secret_value(),
            email=settings.supabase_email,
            password=settings.supabase_password.get_secret_value(),
            max_attachment_mb=settings.max_attachment_mb,
        )
```

In `run_sync_pipeline` nach `new_tasks = await self.iserv.fetch_new_tasks()` einfügen:
```python

        # Vor dem Early-Return: auch ein Lauf ohne neue Aufgaben muss geänderte
        # Fristen und Fächer in die App bringen. push() wirft nie.
        await self.notes_sync.push(self.iserv.last_list, self.db.get_task_by_id)
```

- [ ] **Step 5: Prüfen**

Run:
```bash
cd /c/Antigravity/AUTOMATISIERUNG && python -m py_compile config/settings.py input/iserv_fetcher.py scheduler/orchestrator.py output/notes_sync.py core/iserv_rows.py && echo SYNTAX_OK
grep -n "last_list\|task_id_of\|pick_subject\|notes_sync" input/iserv_fetcher.py scheduler/orchestrator.py
python -m pytest tests -q
```
Expected: `SYNTAX_OK`; `grep` zeigt `last_list` an drei Stellen im Fetcher (Init, Reset, Zuweisung), `task_id_of` und `pick_subject` je einmal im Import und einmal in der Nutzung, `notes_sync` im Orchestrator in `__init__` und in `run_sync_pipeline` **vor** `if not new_tasks:`; `26 passed`.

Lies außerdem die Reihenfolge in `run_sync_pipeline` einmal durch: `fetch_new_tasks` → `push` → `if not new_tasks:`.

- [ ] **Step 6: Kein Commit** (siehe Task 1, Step 5)

---

### Task 4: Cloud — SQL für Tabelle und Bucket

**Files:**
- Create: `C:\Antigravity\NotesAPP\supabase\iserv_tasks.sql`

**Interfaces:**
- Produces: Tabelle `notesapp.iserv_tasks` mit den Spalten `user_id, id, title, subject, due, deadline_raw, url, description, attachments, updated_at`, Bucket `notesapp-iserv`. Task 2 (PC) und Task 6 (App) lesen und schreiben genau diese Spalten.

- [ ] **Step 1: SQL schreiben**

`supabase/iserv_tasks.sql`:

```sql
-- IServ-Aufgaben, die das PC-Script (SchulPilot) für die Notizen-App bereitstellt.
-- Einmal im Supabase-Dashboard (SQL-Editor) ausführen, danach den gemeinsamen
-- Account unter Authentication anlegen (Auto Confirm User).

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

alter table notesapp.iserv_tasks enable row level security;

drop policy if exists "own iserv tasks" on notesapp.iserv_tasks;
create policy "own iserv tasks"
  on notesapp.iserv_tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant all on notesapp.iserv_tasks to authenticated;

-- Privater Bucket für die Anhänge, Ordner = user_id.
insert into storage.buckets (id, name, public)
values ('notesapp-iserv', 'notesapp-iserv', false)
on conflict (id) do nothing;

drop policy if exists "own iserv files read" on storage.objects;
create policy "own iserv files read"
  on storage.objects for select
  using (bucket_id = 'notesapp-iserv' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own iserv files write" on storage.objects;
create policy "own iserv files write"
  on storage.objects for insert
  with check (bucket_id = 'notesapp-iserv' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own iserv files update" on storage.objects;
create policy "own iserv files update"
  on storage.objects for update
  using (bucket_id = 'notesapp-iserv' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own iserv files delete" on storage.objects;
create policy "own iserv files delete"
  on storage.objects for delete
  using (bucket_id = 'notesapp-iserv' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Gegenlesen**

Prüfe gegen `supabase/notesapp_schema.sql`: gleiche Policy-Form, Schema `notesapp` (das der Client bereits benutzt und das damit im Dashboard exponiert ist). Es gibt keinen Test, das SQL kann hier nicht ausgeführt werden.

- [ ] **Step 3: Commit**

```bash
cd /c/Antigravity/NotesAPP
git add supabase/iserv_tasks.sql
git commit -m "$(cat <<'EOF'
feat(supabase): table and bucket for IServ tasks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: App — Repository kennt IServ-Termine

**Files:**
- Modify: `C:\Antigravity\NotesAPP\src\knowledge\knowledgeRepository.js:22-23` (`eventKey`) und `:95-105` (Aufbau in `mergeFindings`)
- Test: `C:\Antigravity\NotesAPP\tests\knowledgeRepository.test.js` (am Dateiende ergänzen)

**Interfaces:**
- Produces (Task 6, 7, 9 verwenden diese Form): ein Event mit `iservId` hat zusätzlich `url: string`, `description: string`, `attachments: [{filename, path, size_bytes}]`. Sein Schlüssel ist `iserv|<iservId>`; Titel und Frist werden beim erneuten Merge aktualisiert, `done` bleibt.

- [ ] **Step 1: Failing test schreiben**

Am Ende von `tests/knowledgeRepository.test.js` anhängen (`repo` und `hausaufgabe` sind dort schon definiert):

```js
describe("knowledge repository — IServ-Termine", () => {
  const iserv = (overrides = {}) => ({
    kind: "homework",
    title: "Blatt 3",
    subject: "Mathe",
    due: "2026-09-24",
    iservId: "https://iserv/ex/1",
    url: "https://iserv/ex/1",
    description: "Löse Seite 10",
    attachments: [{ filename: "Blatt.pdf", path: "u/h/Blatt.pdf", size_bytes: 3 }],
    ...overrides,
  });

  it("legt einen IServ-Termin mit Beschreibung und Anhängen an", () => {
    const repository = repo();
    repository.mergeFindings({ events: [iserv()], sourceNoteId: "iserv" });
    expect(repository.read().events[0]).toMatchObject({
      sourceNoteId: "iserv",
      iservId: "https://iserv/ex/1",
      url: "https://iserv/ex/1",
      description: "Löse Seite 10",
      attachments: [{ filename: "Blatt.pdf", path: "u/h/Blatt.pdf" }],
    });
  });

  it("aktualisiert Titel und Frist am selben Termin und behält das Häkchen", () => {
    const repository = repo();
    repository.mergeFindings({ events: [iserv()], sourceNoteId: "iserv" });
    const [first] = repository.read().events;
    repository.setEventDone(first.id, true);

    const result = repository.mergeFindings({
      events: [iserv({ title: "Blatt 3 (neu)", due: "2026-09-25" })],
      sourceNoteId: "iserv",
    });

    expect(result.addedEvents).toBe(0);
    const events = repository.read().events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: first.id,
      title: "Blatt 3 (neu)",
      due: "2026-09-25",
      done: true,
    });
  });

  it("verwechselt einen Scan-Termin nicht mit einem IServ-Termin gleichen Titels", () => {
    const repository = repo();
    repository.mergeFindings({ events: [hausaufgabe], sourceNoteId: "note-1" });
    repository.mergeFindings({
      events: [iserv({ title: hausaufgabe.title, due: hausaufgabe.due, subject: hausaufgabe.subject })],
      sourceNoteId: "iserv",
    });
    expect(repository.read().events).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `cd /c/Antigravity/NotesAPP && npx vitest run tests/knowledgeRepository.test.js`
Expected: FAIL in „legt einen IServ-Termin … an" (`iservId`, `description` fehlen) und in „aktualisiert Titel und Frist …" (zwei Events statt einem).

- [ ] **Step 3: Implementieren**

In `src/knowledge/knowledgeRepository.js` die Zeilen

```js
const eventKey = (event) =>
  `${event.kind}|${normalizeKey(event.subject)}|${event.due}|${normalizeKey(event.title)}`;
```

ersetzen durch

```js
// IServ-Termine sind über ihre IServ-ID eindeutig: ändert sich Titel oder Frist,
// wird derselbe Termin aktualisiert statt ein zweiter angelegt.
const eventKey = (event) =>
  event.iservId
    ? `iserv|${event.iservId}`
    : `${event.kind}|${normalizeKey(event.subject)}|${event.due}|${normalizeKey(event.title)}`;
```

Im Aufbau der Events in `mergeFindings` die Zeilen

```js
          sourceNoteId,
          done: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));
        const mergedTerms
```

ersetzen durch

```js
          sourceNoteId,
          ...(raw.iservId
            ? {
                iservId: raw.iservId,
                url: raw.url,
                description: raw.description,
                attachments: raw.attachments,
              }
            : {}),
          done: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));
        const mergedTerms
```

- [ ] **Step 4: Test laufen lassen, muss bestehen**

Run: `cd /c/Antigravity/NotesAPP && npx vitest run tests/knowledgeRepository.test.js`
Expected: alle Tests PASS (die bestehenden und die drei neuen)

- [ ] **Step 5: Commit**

```bash
cd /c/Antigravity/NotesAPP
git add src/knowledge/knowledgeRepository.js tests/knowledgeRepository.test.js
git commit -m "$(cat <<'EOF'
feat(knowledge): merge IServ events by their IServ id

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: App — Client, Zugangsdaten und Pull

**Files:**
- Create: `C:\Antigravity\NotesAPP\src\lib\iservClient.js`
- Create: `C:\Antigravity\NotesAPP\src\ink\iservSettings.js`
- Create: `C:\Antigravity\NotesAPP\src\knowledge\iservSync.js`
- Modify: `C:\Antigravity\NotesAPP\src\documents\exportDocument.js:47` (`saveAndShare` exportieren)
- Test: `C:\Antigravity\NotesAPP\tests\iservSync.test.js`

**Interfaces:**
- Consumes (Task 5): `repository.mergeFindings({ events, sourceNoteId })` gibt `{ addedEvents, addedTerms }` zurück. Tabelle und Bucket aus Task 4.
- Produces:
  - `iservClient` — Supabase-Client oder `null`, wenn `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` fehlen
  - `loadIservCredentials(): Promise<{email, password} | null>`, `saveIservCredentials({email, password}): Promise<void>`
  - `ISERV_SOURCE_ID = "iserv"`, `ISERV_BUCKET = "notesapp-iserv"`
  - `rowToEvent(row): object | null`
  - `pullIservEvents({ client, credentials }): Promise<object[]>`
  - `syncIserv({ repository, client?, loadCredentials? }): Promise<number | null>` — Anzahl neuer Termine, `null` wenn nichts eingerichtet ist, wirft bei Netzwerk- oder Loginfehlern
  - `openIservAttachment({ client, attachment, share? }): Promise<void>`

- [ ] **Step 1: Failing test schreiben**

`tests/iservSync.test.js`:

```js
import { describe, expect, it, vi } from "vitest";
import {
  ISERV_BUCKET,
  openIservAttachment,
  pullIservEvents,
  rowToEvent,
  syncIserv,
} from "../src/knowledge/iservSync.js";
import { createKnowledgeRepository } from "../src/knowledge/knowledgeRepository.js";

const row = (overrides = {}) => ({
  id: "https://iserv/ex/1",
  title: "Blatt 3",
  subject: "Mathe",
  due: "2026-09-24",
  url: "https://iserv/ex/1",
  description: "Löse Seite 10",
  attachments: [{ filename: "Blatt.pdf", path: "u/h/Blatt.pdf", size_bytes: 3 }],
  ...overrides,
});

const credentials = { email: "a@b.de", password: "pw" };

function fakeClient({ session = null, rows = [], signInError = null, queryError = null } = {}) {
  const order = vi.fn(async () => ({ data: rows, error: queryError }));
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  const schema = vi.fn(() => ({ from }));
  const signInWithPassword = vi.fn(async () => ({ error: signInError }));
  const getSession = vi.fn(async () => ({ data: { session } }));
  return { client: { auth: { getSession, signInWithPassword }, schema }, signInWithPassword, schema, from };
}

function memoryRepository() {
  const values = new Map();
  return createKnowledgeRepository(
    { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    { now: () => 1 },
  );
}

describe("rowToEvent", () => {
  it("macht aus einer Zeile eine Hausaufgabe", () => {
    expect(rowToEvent(row())).toEqual({
      kind: "homework",
      title: "Blatt 3",
      subject: "Mathe",
      due: "2026-09-24",
      iservId: "https://iserv/ex/1",
      url: "https://iserv/ex/1",
      description: "Löse Seite 10",
      attachments: [{ filename: "Blatt.pdf", path: "u/h/Blatt.pdf", size_bytes: 3 }],
    });
  });

  it("verwirft Zeilen ohne Titel", () => {
    expect(rowToEvent(row({ title: "  " }))).toBeNull();
  });

  it("verwirft Zeilen ohne lesbare Frist", () => {
    expect(rowToEvent(row({ due: null }))).toBeNull();
    expect(rowToEvent(row({ due: "" }))).toBeNull();
  });

  it("verträgt fehlende Anhänge", () => {
    expect(rowToEvent(row({ attachments: null })).attachments).toEqual([]);
  });
});

describe("pullIservEvents", () => {
  it("meldet sich an, wenn keine Sitzung besteht", async () => {
    const { client, signInWithPassword } = fakeClient({ rows: [row()] });
    const events = await pullIservEvents({ client, credentials });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "a@b.de", password: "pw" });
    expect(events).toHaveLength(1);
  });

  it("meldet sich nicht erneut an, wenn eine Sitzung besteht", async () => {
    const { client, signInWithPassword } = fakeClient({ session: {}, rows: [row()] });
    await pullIservEvents({ client, credentials });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("liest die Tabelle notesapp.iserv_tasks", async () => {
    const { client, schema, from } = fakeClient({ session: {} });
    await pullIservEvents({ client, credentials });
    expect(schema).toHaveBeenCalledWith("notesapp");
    expect(from).toHaveBeenCalledWith("iserv_tasks");
  });

  it("wirft bei einem Loginfehler", async () => {
    const { client } = fakeClient({ signInError: new Error("Invalid login") });
    await expect(pullIservEvents({ client, credentials })).rejects.toThrow("Invalid login");
  });

  it("wirft bei einem Lesefehler", async () => {
    const { client } = fakeClient({ session: {}, queryError: new Error("offline") });
    await expect(pullIservEvents({ client, credentials })).rejects.toThrow("offline");
  });

  it("lässt Zeilen ohne Frist aus", async () => {
    const { client } = fakeClient({ session: {}, rows: [row(), row({ id: "x", due: null })] });
    expect(await pullIservEvents({ client, credentials })).toHaveLength(1);
  });
});

describe("syncIserv", () => {
  it("gibt null zurück, wenn nichts eingerichtet ist", async () => {
    const repository = memoryRepository();
    const { client } = fakeClient();
    expect(await syncIserv({ repository, client, loadCredentials: async () => null })).toBeNull();
    expect(await syncIserv({ repository, client: null, loadCredentials: async () => credentials })).toBeNull();
    expect(
      await syncIserv({ repository, client, loadCredentials: async () => ({ email: "a@b.de", password: "" }) }),
    ).toBeNull();
  });

  it("trägt Zeilen als Termine ein und zählt nur neue", async () => {
    const repository = memoryRepository();
    const { client } = fakeClient({ session: {}, rows: [row()] });
    const options = { repository, client, loadCredentials: async () => credentials };

    expect(await syncIserv(options)).toBe(1);
    expect(repository.read().events[0]).toMatchObject({
      sourceNoteId: "iserv",
      iservId: "https://iserv/ex/1",
      kind: "homework",
    });
    expect(await syncIserv(options)).toBe(0);
  });
});

describe("openIservAttachment", () => {
  const client = (download) => ({ storage: { from: vi.fn(() => ({ download })) } });

  it("lädt den Anhang aus dem Bucket und reicht ihn ans Teilen-Menü", async () => {
    const blob = new Blob(["x"]);
    const download = vi.fn(async () => ({ data: blob, error: null }));
    const share = vi.fn(async () => {});
    const fake = client(download);

    await openIservAttachment({
      client: fake,
      attachment: { filename: "Blatt 1.pdf", path: "u/h/Blatt_1.pdf" },
      share,
    });

    expect(fake.storage.from).toHaveBeenCalledWith(ISERV_BUCKET);
    expect(download).toHaveBeenCalledWith("u/h/Blatt_1.pdf");
    expect(share).toHaveBeenCalledWith(blob, "Blatt 1.pdf");
  });

  it("bereinigt Zeichen, die kein Dateiname enthalten darf", async () => {
    const share = vi.fn(async () => {});
    const download = vi.fn(async () => ({ data: new Blob(["x"]), error: null }));
    await openIservAttachment({
      client: client(download),
      attachment: { filename: "a/b:c.pdf", path: "u/h/a_b_c.pdf" },
      share,
    });
    expect(share.mock.calls[0][1]).toBe("a_b_c.pdf");
  });

  it("wirft, wenn der Anhang keinen Pfad hat", async () => {
    await expect(
      openIservAttachment({ client: {}, attachment: { filename: "x.pdf", path: null }, share: vi.fn() }),
    ).rejects.toThrow();
  });

  it("wirft, wenn der Download scheitert", async () => {
    const download = vi.fn(async () => ({ data: null, error: new Error("nicht gefunden") }));
    await expect(
      openIservAttachment({
        client: client(download),
        attachment: { filename: "x.pdf", path: "u/h/x.pdf" },
        share: vi.fn(),
      }),
    ).rejects.toThrow("nicht gefunden");
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `cd /c/Antigravity/NotesAPP && npx vitest run tests/iservSync.test.js`
Expected: FAIL mit `Failed to resolve import "../src/knowledge/iservSync.js"`

- [ ] **Step 3: Client schreiben**

`src/lib/iservClient.js`:

```js
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Eigener Client mit eigenem Speicherschlüssel: die anonyme Sitzung aus
// supabaseClient.js (Untis-Spiegel, Backups) darf durch den Account-Login nicht
// ersetzt werden, sonst liefen beide danach unter einer anderen user_id.
export const iservClient =
  url && anonKey ? createClient(url, anonKey, { auth: { storageKey: "notes.iserv-auth" } }) : null;
```

- [ ] **Step 4: Zugangsdaten schreiben**

`src/ink/iservSettings.js`:

```js
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";

const STORAGE_KEY = "notes.iservCredentials";

// Wie bei den Untis-Zugangsdaten: nativ im Keystore, im Browser in localStorage.
// Anders als dort gibt es keinen Cloud-Spiegel, der Account soll nirgends in der
// Cloud liegen, in die er selbst den Zugang öffnet.
const isNative = () => typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();

export async function loadIservCredentials() {
  try {
    if (isNative()) {
      const { value } = await SecureStoragePlugin.get({ key: STORAGE_KEY });
      return value ? JSON.parse(value) : null;
    }
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveIservCredentials(credentials) {
  try {
    if (isNative()) {
      await SecureStoragePlugin.set({ key: STORAGE_KEY, value: JSON.stringify(credentials) });
      return;
    }
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(credentials));
  } catch {
    // Speicher voll oder gesperrt: die Zugangsdaten überleben dann die Sitzung nicht.
  }
}
```

- [ ] **Step 5: `saveAndShare` exportieren**

In `src/documents/exportDocument.js` Zeile 47 ändern:

```js
async function saveAndShare(blob, filename) {
```
zu
```js
export async function saveAndShare(blob, filename) {
```

- [ ] **Step 6: Pull schreiben**

`src/knowledge/iservSync.js`:

```js
import { iservClient } from "../lib/iservClient.js";
import { loadIservCredentials } from "../ink/iservSettings.js";

export const ISERV_SOURCE_ID = "iserv";
export const ISERV_BUCKET = "notesapp-iserv";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Eine Zeile aus notesapp.iserv_tasks als Termin der Terminplanung. Ohne Titel
// oder lesbare Frist lässt sich nichts einplanen.
export function rowToEvent(row) {
  const title = String(row?.title ?? "").trim();
  const due = String(row?.due ?? "");
  if (!row?.id || !title || !ISO_DATE.test(due)) return null;
  return {
    kind: "homework",
    title,
    subject: String(row.subject ?? "").trim(),
    due,
    iservId: String(row.id),
    url: String(row.url ?? ""),
    description: String(row.description ?? ""),
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
  };
}

async function ensureSession(client, credentials) {
  const { data } = await client.auth.getSession();
  if (data?.session) return;
  const { error } = await client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  if (error) throw error;
}

export async function pullIservEvents({ client, credentials }) {
  await ensureSession(client, credentials);
  const { data, error } = await client
    .schema("notesapp")
    .from("iserv_tasks")
    .select("*")
    .order("due", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToEvent).filter(Boolean);
}

// Rückgabe: Anzahl neuer Termine, oder null, wenn nichts eingerichtet ist.
// Wirft bei Login- oder Netzwerkfehlern, der Aufrufer entscheidet, wie das angezeigt wird.
export async function syncIserv({
  repository,
  client = iservClient,
  loadCredentials = loadIservCredentials,
} = {}) {
  const credentials = await loadCredentials();
  if (!client || !credentials?.email || !credentials?.password) return null;
  const events = await pullIservEvents({ client, credentials });
  return repository.mergeFindings({ events, sourceNoteId: ISERV_SOURCE_ID }).addedEvents;
}

// Lädt den Anhang aus dem privaten Bucket und reicht ihn ans Teilen-Menü des
// Systems. saveAndShare kommt per dynamischem Import, damit dieses Modul
// (und seine Tests) jspdf und die Capacitor-Plugins nicht mitladen.
export async function openIservAttachment({ client, attachment, share }) {
  if (!attachment?.path) throw new Error("Anhang nicht verfügbar.");
  const { data, error } = await client.storage.from(ISERV_BUCKET).download(attachment.path);
  if (error || !data) throw error || new Error("Download fehlgeschlagen.");
  const shareFile = share || (await import("../documents/exportDocument.js")).saveAndShare;
  await shareFile(data, String(attachment.filename || "Anhang").replace(/[\\/:*?"<>|]+/g, "_"));
}
```

- [ ] **Step 7: Tests laufen lassen, müssen bestehen**

Run: `cd /c/Antigravity/NotesAPP && npx vitest run tests/iservSync.test.js`
Expected: alle Tests PASS

- [ ] **Step 8: Commit**

```bash
cd /c/Antigravity/NotesAPP
git add src/lib/iservClient.js src/ink/iservSettings.js src/knowledge/iservSync.js src/documents/exportDocument.js tests/iservSync.test.js
git commit -m "$(cat <<'EOF'
feat(iserv): pull IServ tasks from Supabase into the knowledge repository

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: App — `useKnowledge` zieht IServ-Termine

**Files:**
- Modify: `C:\Antigravity\NotesAPP\src\hooks\useKnowledge.js`
- Test: `C:\Antigravity\NotesAPP\tests\useKnowledge.test.jsx` (am Ende von `describe("useKnowledge", …)` ergänzen)

**Interfaces:**
- Consumes (Task 6): eine Funktion `syncIserv({ repository }) -> Promise<number | null>`.
- Produces (Task 9 verwendet): `useKnowledge({ …, syncIserv })` gibt zusätzlich `iservState: "off" | "ok" | "error"` zurück. `syncIserv` läuft einmal beim Einhängen und in `refreshPlan` vor `buildPlan`. Ohne den Parameter ändert sich nichts.

- [ ] **Step 1: Failing tests schreiben**

In `tests/useKnowledge.test.jsx` vor der letzten Zeile `});` (das schließt `describe("useKnowledge"`) einfügen:

```jsx
  describe("IServ", () => {
    const iservEvent = {
      kind: "homework",
      title: "Blatt 3",
      subject: "Mathe",
      due: "2099-01-01",
      iservId: "https://iserv/ex/1",
    };
    const seed = (extra = {}) =>
      globalThis.localStorage.setItem(
        KNOWLEDGE_STORAGE_KEY,
        JSON.stringify({ version: 1, events: [], terms: [], settings: { autoScan: false }, ...extra }),
      );

    it("holt IServ-Termine beim Einhängen und verwirft einen älteren Plan", async () => {
      seed({ plan: { generatedFor: "2026-01-01", days: [] } });
      const syncIserv = vi.fn(
        async ({ repository }) =>
          repository.mergeFindings({ events: [iservEvent], sourceNoteId: "iserv" }).addedEvents,
      );

      const { result } = renderHook(() => useKnowledge({ notes: [], subjects: [], syncIserv }));

      await waitFor(() => expect(result.current.iservState).toBe("ok"));
      expect(result.current.events).toHaveLength(1);
      expect(result.current.plan).toBeNull();
    });

    it("behält den Plan, wenn der Pull nichts Neues bringt", async () => {
      seed({ plan: { generatedFor: "2026-01-01", days: [] } });
      const syncIserv = vi.fn(async () => 0);

      const { result } = renderHook(() => useKnowledge({ notes: [], subjects: [], syncIserv }));

      await waitFor(() => expect(result.current.iservState).toBe("ok"));
      expect(result.current.plan).toEqual({ generatedFor: "2026-01-01", days: [] });
    });

    it("meldet 'off', wenn nichts eingerichtet ist", async () => {
      seed();
      const syncIserv = vi.fn(async () => null);
      const { result } = renderHook(() => useKnowledge({ notes: [], subjects: [], syncIserv }));
      await waitFor(() => expect(syncIserv).toHaveBeenCalled());
      expect(result.current.iservState).toBe("off");
    });

    it("meldet 'error' bei einem Fehler und plant trotzdem", async () => {
      seed();
      const syncIserv = vi.fn(async () => {
        throw new Error("offline");
      });
      const { result } = renderHook(() => useKnowledge({ notes: [], subjects: [], syncIserv }));
      await waitFor(() => expect(result.current.iservState).toBe("error"));

      await act(async () => {
        await result.current.refreshPlan();
      });

      expect(requestCompletion).toHaveBeenCalled();
      expect(result.current.plan).toEqual(expect.objectContaining({ days: expect.any(Array) }));
    });

    it("holt IServ-Termine vor dem Berechnen des Plans", async () => {
      seed();
      const order = [];
      const syncIserv = vi.fn(async () => {
        order.push("sync");
        return 0;
      });
      requestCompletion.mockImplementationOnce(async () => {
        order.push("plan");
        return { content: '{"days":{}}' };
      });
      const { result } = renderHook(() => useKnowledge({ notes: [], subjects: [], syncIserv }));
      await waitFor(() => expect(syncIserv).toHaveBeenCalledTimes(1));
      order.length = 0;

      await act(async () => {
        await result.current.refreshPlan();
      });

      expect(order).toEqual(["sync", "plan"]);
    });

    it("bleibt 'off' und ruft nichts auf, wenn kein syncIserv übergeben wird", async () => {
      seed();
      const { result } = renderHook(() => useKnowledge({ notes: [], subjects: [] }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(result.current.iservState).toBe("off");
    });
  });
```

- [ ] **Step 2: Tests laufen lassen, müssen fehlschlagen**

Run: `cd /c/Antigravity/NotesAPP && npx vitest run tests/useKnowledge.test.jsx`
Expected: die fünf neuen Tests FAIL (`iservState` ist `undefined`), die bestehenden PASS

- [ ] **Step 3: Implementieren**

In `src/hooks/useKnowledge.js`:

Signatur — die Zeilen

```js
  repository = browserKnowledgeRepository,
  commentRepository = browserCommentRepository,
} = {}) {
```
ersetzen durch
```js
  repository = browserKnowledgeRepository,
  commentRepository = browserCommentRepository,
  syncIserv = null,
} = {}) {
```

Nach `const [isPlanning, setPlanning] = useState(false);` einfügen:
```js
  const [iservState, setIservState] = useState("off");
```

Nach `subjectsRef.current = subjects;` einfügen:
```js
  const syncIservRef = useRef(syncIserv);
  syncIservRef.current = syncIserv;
```

Direkt vor `const refreshPlan = useCallback(` einfügen:

```js
  // Holt die IServ-Termine. Wirft nie: ein Netzwerkfehler darf Scan und Plan nicht aufhalten.
  // ponytail: kein Timeout, ergänzen, falls der Pull auf dem Tablet je hängt.
  const pullIserv = useCallback(async () => {
    const sync = syncIservRef.current;
    if (!sync) return 0;
    try {
      const added = await sync({ repository });
      setIservState(added === null ? "off" : "ok");
      return added || 0;
    } catch {
      setIservState("error");
      return 0;
    } finally {
      setState(repository.read());
    }
  }, [repository]);

```

In `refreshPlan` die Zeilen

```js
    setPlanning(true);
    const today = isoDate(Date.now());
```
ersetzen durch
```js
    setPlanning(true);
    // Nur awaiten, wenn es etwas zu holen gibt: ohne syncIserv läuft buildPlan synchron an.
    if (syncIservRef.current) await pullIserv();
    const today = isoDate(Date.now());
```
und die Abhängigkeiten von `refreshPlan` von `[repository]` zu `[repository, pullIserv]` ändern (die Zeile `  }, [repository]);` am Ende von `refreshPlan`, nicht die von `setEventDone`).

Den Mount-Effekt

```js
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!repository.read().settings.autoScan) return;
    scanNow();
  }, [repository, scanNow]);
```
ersetzen durch
```js
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (syncIservRef.current) {
      // Ein Plan von vor dem Pull kennt die neuen Aufgaben nicht. Er ist abgeleitet
      // und wird verworfen, der Plan-Bildschirm baut ihn beim Öffnen neu.
      void pullIserv().then((added) => {
        if (added > 0) {
          repository.savePlan(null);
          setState(repository.read());
        }
      });
    }
    if (!repository.read().settings.autoScan) return;
    scanNow();
  }, [repository, scanNow, pullIserv]);
```

Im Rückgabeobjekt nach `isPlanning,` einfügen:
```js
    iservState,
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `cd /c/Antigravity/NotesAPP && npx vitest run tests/useKnowledge.test.jsx`
Expected: alle Tests PASS, auch „speichert den erneuerten Plan und spiegelt ihn im Hook-Zustand" (der wartet synchron auf den Aufruf von `requestCompletion`, deshalb das `if (syncIservRef.current)` vor dem `await`)

- [ ] **Step 5: Commit**

```bash
cd /c/Antigravity/NotesAPP
git add src/hooks/useKnowledge.js tests/useKnowledge.test.jsx
git commit -m "$(cat <<'EOF'
feat(knowledge): pull IServ events on mount and before planning

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: App — Einstellungen für den IServ-Sync-Account

**Files:**
- Modify: `C:\Antigravity\NotesAPP\src\components\Settings.jsx` (Import bei Zeile 23, State bei Zeile 171, Markup nach Zeile 941)
- Test: `C:\Antigravity\NotesAPP\tests\settingsIserv.test.jsx`

**Interfaces:**
- Consumes (Task 6): `loadIservCredentials`, `saveIservCredentials`.
- Produces: Eingabefelder mit `data-testid="iserv-email-input"` und `data-testid="iserv-password-input"`.

- [ ] **Step 1: Failing test schreiben**

`tests/settingsIserv.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: vi.fn(async () => ({ content: '{"homework":[],"exams":[],"terms":[]}' })),
}));

import Settings from "../src/components/Settings.jsx";

beforeEach(() => {
  globalThis.localStorage.clear();
});

async function openNetwork() {
  render(<Settings onBack={() => {}} />);
  fireEvent.click(screen.getByText("KI & Netzwerk"));
  // loadIservCredentials ist asynchron: erst danach speichern Änderungen.
  await act(async () => {});
}

describe("Settings — IServ-Sync-Account", () => {
  it("zeigt Felder für E-Mail und Passwort", async () => {
    await openNetwork();
    expect(screen.getByTestId("iserv-email-input")).toHaveAttribute("type", "email");
    expect(screen.getByTestId("iserv-password-input")).toHaveAttribute("type", "password");
  });

  it("speichert die Zugangsdaten lokal", async () => {
    await openNetwork();
    fireEvent.change(screen.getByTestId("iserv-email-input"), { target: { value: "luca@example.de" } });
    fireEvent.change(screen.getByTestId("iserv-password-input"), { target: { value: "geheim" } });

    await waitFor(() =>
      expect(JSON.parse(globalThis.localStorage.getItem("notes.iservCredentials"))).toEqual({
        email: "luca@example.de",
        password: "geheim",
      }),
    );
  });

  it("füllt gespeicherte Zugangsdaten wieder ein", async () => {
    globalThis.localStorage.setItem(
      "notes.iservCredentials",
      JSON.stringify({ email: "luca@example.de", password: "geheim" }),
    );
    await openNetwork();
    await waitFor(() => expect(screen.getByTestId("iserv-email-input")).toHaveValue("luca@example.de"));
    expect(screen.getByTestId("iserv-password-input")).toHaveValue("geheim");
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `cd /c/Antigravity/NotesAPP && npx vitest run tests/settingsIserv.test.jsx`
Expected: FAIL mit „Unable to find an element by: [data-testid="iserv-email-input"]"

- [ ] **Step 3: Implementieren**

In `src/components/Settings.jsx`:

Nach dem Import-Block von `untisSettings.js` (Zeilen 20–23) einfügen:
```js
import { loadIservCredentials, saveIservCredentials } from "../ink/iservSettings.js";
```

Nach dem Effekt `saveUntisCredentials(...)` (endet mit `}, [untisSchool, untisServer, untisUsername, untisPassword]);`) einfügen:

```js

  // IServ-Sync-Account (Supabase) — dieselbe Ablage wie die Untis-Zugangsdaten,
  // nativ verschlüsselt, ohne Cloud-Spiegel.
  const [iservEmail, setIservEmail] = useState("");
  const [iservPassword, setIservPassword] = useState("");
  const iservLoadedRef = useRef(false);

  useEffect(() => {
    loadIservCredentials().then((stored) => {
      setIservEmail(stored?.email || "");
      setIservPassword(stored?.password || "");
      iservLoadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!iservLoadedRef.current) return;
    saveIservCredentials({ email: iservEmail, password: iservPassword });
  }, [iservEmail, iservPassword]);
```

Im Markup direkt **nach** dem schließenden `</div>` der WebUntis-`settings-group` (die Zeile mit 12 Leerzeichen `            </div>` unmittelbar vor `          </div>\n        )}\n      </main>`) einfügen:

```jsx

            <div className="settings-section-caption" style={{ marginTop: 20 }}>
              ISERV-SYNC
            </div>
            <p className="settings-detail-copy" style={{ marginBottom: 12 }}>
              Gemeinsamer Account, mit dem das PC-Script die IServ-Aufgaben ablegt und die App sie liest.
            </p>
            <div className="settings-group">
              <div className="settings-control-row">
                <div>
                  <div className="settings-control-title">E-Mail</div>
                </div>
                <input
                  type="email"
                  className="settings-text-input"
                  value={iservEmail}
                  onChange={(e) => setIservEmail(e.target.value)}
                  autoComplete="username"
                  data-testid="iserv-email-input"
                />
              </div>
              <div className="settings-control-row">
                <div>
                  <div className="settings-control-title">Passwort</div>
                </div>
                <input
                  type="password"
                  className="settings-text-input"
                  value={iservPassword}
                  onChange={(e) => setIservPassword(e.target.value)}
                  autoComplete="current-password"
                  data-testid="iserv-password-input"
                />
              </div>
            </div>
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `cd /c/Antigravity/NotesAPP && npx vitest run tests/settingsIserv.test.jsx tests/settingsKnowledge.test.jsx`
Expected: alle Tests PASS

- [ ] **Step 5: Commit**

```bash
cd /c/Antigravity/NotesAPP
git add src/components/Settings.jsx tests/settingsIserv.test.jsx
git commit -m "$(cat <<'EOF'
feat(settings): IServ sync account fields

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: App — Aufgabenliste im Plan-Bildschirm und Verdrahtung in der Bibliothek

**Files:**
- Create: `C:\Antigravity\NotesAPP\src\components\IservTaskList.jsx`
- Modify: `C:\Antigravity\NotesAPP\src\components\UpcomingCard.jsx:6` (`formatDue` exportieren)
- Modify: `C:\Antigravity\NotesAPP\src\components\PlanScreen.jsx`
- Modify: `C:\Antigravity\NotesAPP\src\components\Library.jsx` (Import bei Zeile 58, `sourceNoteTitles` bei Zeile 3307, `useKnowledge` bei Zeile 3312)
- Modify: `C:\Antigravity\NotesAPP\src\styles\main.css` (am Dateiende anhängen)
- Test: `C:\Antigravity\NotesAPP\tests\planScreenIserv.test.jsx`

**Interfaces:**
- Consumes (Task 6, 7): `syncIserv`, `openIservAttachment({ client, attachment })`, `iservClient`; `useKnowledge` gibt `events`, `setEventDone(id, done)`, `iservState` zurück; Events mit `iservId`, `description`, `attachments`.
- Produces: `IservTaskList({ events, onDone, onOpenAttachment })`, `formatDue(due)`.

- [ ] **Step 1: Failing test schreiben**

`tests/planScreenIserv.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: vi.fn(async () => ({ content: '{"days":{}}' })),
}));
vi.mock("../src/knowledge/iservSync.js", () => ({
  syncIserv: vi.fn(async () => 0),
  openIservAttachment: vi.fn(async () => {}),
}));

import PlanScreen from "../src/components/PlanScreen.jsx";
import { openIservAttachment, syncIserv } from "../src/knowledge/iservSync.js";
import { KNOWLEDGE_STORAGE_KEY } from "../src/knowledge/knowledgeRepository.js";
import { isoDate } from "../src/knowledge/studyPlan.js";

const available = { filename: "Blatt 3.pdf", path: "u/h/Blatt_3.pdf", size_bytes: 3 };
const missing = { filename: "Gross.pdf", path: null, size_bytes: 0 };
const iservEvent = {
  id: "e1",
  kind: "homework",
  title: "Blatt 3",
  subject: "Mathe",
  due: "2099-09-24",
  done: false,
  sourceNoteId: "iserv",
  iservId: "https://iserv/ex/1",
  description: "Löse Seite 10",
  attachments: [available, missing],
};

function seed(events) {
  globalThis.localStorage.setItem(
    KNOWLEDGE_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      events,
      terms: [],
      // Ein Plan von heute: der Bildschirm soll ihn nicht neu berechnen.
      plan: { generatedFor: isoDate(Date.now()), days: [] },
      settings: { autoScan: false },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.localStorage.clear();
});

describe("PlanScreen — IServ-Aufgaben", () => {
  it("zeigt offene IServ-Aufgaben mit Fach und Beschreibung", () => {
    seed([iservEvent]);
    render(<PlanScreen onBack={() => {}} />);
    expect(screen.getByText("IServ-Aufgaben")).toBeInTheDocument();
    expect(screen.getByText("Blatt 3")).toBeInTheDocument();
    expect(screen.getByText(/^Mathe · /)).toBeInTheDocument();
    expect(screen.getByText("Löse Seite 10")).toBeInTheDocument();
  });

  it("zeigt keine Aufgaben, die nicht aus IServ kommen", () => {
    seed([{ ...iservEvent, id: "e2", title: "Aus dem Scan", iservId: undefined, sourceNoteId: "note-1" }]);
    render(<PlanScreen onBack={() => {}} />);
    expect(screen.queryByText("Aus dem Scan")).not.toBeInTheDocument();
  });

  it("öffnet einen verfügbaren Anhang über das Teilen-Menü", () => {
    seed([iservEvent]);
    render(<PlanScreen onBack={() => {}} />);
    fireEvent.click(screen.getByText("Blatt 3.pdf"));
    expect(openIservAttachment).toHaveBeenCalledWith(expect.objectContaining({ attachment: available }));
  });

  it("deaktiviert einen Anhang ohne Pfad", () => {
    seed([iservEvent]);
    render(<PlanScreen onBack={() => {}} />);
    expect(screen.getByText("Gross.pdf (nicht verfügbar)")).toBeDisabled();
  });

  it("meldet, wenn ein Anhang nicht geöffnet werden konnte", async () => {
    openIservAttachment.mockRejectedValueOnce(new Error("offline"));
    seed([iservEvent]);
    render(<PlanScreen onBack={() => {}} />);
    fireEvent.click(screen.getByText("Blatt 3.pdf"));
    expect(await screen.findByText("Anhang konnte nicht geöffnet werden.")).toBeInTheDocument();
  });

  it("hakt eine Aufgabe ab und blendet sie aus", () => {
    seed([iservEvent]);
    render(<PlanScreen onBack={() => {}} />);
    fireEvent.click(screen.getByText("Erledigt"));
    expect(screen.queryByText("Blatt 3")).not.toBeInTheDocument();
    const stored = JSON.parse(globalThis.localStorage.getItem(KNOWLEDGE_STORAGE_KEY));
    expect(stored.events[0].done).toBe(true);
  });

  it("meldet einen nicht erreichbaren Sync", async () => {
    syncIserv.mockRejectedValueOnce(new Error("offline"));
    seed([]);
    render(<PlanScreen onBack={() => {}} />);
    expect(await screen.findByText("IServ-Sync nicht erreichbar.")).toBeInTheDocument();
  });

  it("blendet den Abschnitt ohne Aufgaben und ohne Fehler aus", async () => {
    seed([]);
    render(<PlanScreen onBack={() => {}} />);
    await waitFor(() => expect(syncIserv).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("IServ-Aufgaben")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `cd /c/Antigravity/NotesAPP && npx vitest run tests/planScreenIserv.test.jsx`
Expected: FAIL (kein Abschnitt „IServ-Aufgaben", `getByText("IServ-Aufgaben")` findet nichts)

- [ ] **Step 3: `formatDue` exportieren**

In `src/components/UpcomingCard.jsx` Zeile 6 ändern:
```js
function formatDue(due) {
```
zu
```js
export function formatDue(due) {
```

- [ ] **Step 4: Liste schreiben**

`src/components/IservTaskList.jsx`:

```jsx
import React from "react";
import { formatDue } from "./UpcomingCard.jsx";

// Offene IServ-Aufgaben zum Aufklappen: Beschreibung, Anhänge, Abhaken.
// Natives <details>, damit Tastatur und Screenreader ohne eigenen Code funktionieren.
export default function IservTaskList({ events, onDone, onOpenAttachment }) {
  return events.map((event) => (
    <details className="plan-term iserv-task" key={event.id} data-testid={`iserv-task-${event.id}`}>
      <summary className="iserv-task-summary">
        <span className="plan-term-name">{event.title}</span>
        <span className="plan-block-meta">
          {[event.subject || "Ohne Fach", formatDue(event.due)].join(" · ")}
        </span>
      </summary>
      <div className="iserv-task-content">
        {event.description && <div className="iserv-task-body">{event.description}</div>}
        {event.attachments?.length > 0 && (
          <ul className="iserv-task-files">
            {event.attachments.map((attachment, index) => (
              <li key={`${event.id}-${index}`}>
                <button
                  type="button"
                  className="plan-chip"
                  disabled={!attachment.path}
                  onClick={() => onOpenAttachment(attachment)}
                >
                  {attachment.path ? attachment.filename : `${attachment.filename} (nicht verfügbar)`}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="plan-chip iserv-task-done" onClick={() => onDone(event.id, true)}>
          Erledigt
        </button>
      </div>
    </details>
  ));
}
```

- [ ] **Step 5: PlanScreen verdrahten**

In `src/components/PlanScreen.jsx`:

Imports — nach `import { isoDate } from "../knowledge/studyPlan.js";` einfügen:
```jsx
import { openIservAttachment, syncIserv } from "../knowledge/iservSync.js";
import { iservClient } from "../lib/iservClient.js";
```
und nach `import { browserNoteRepository } from "../storage/noteRepository.js";`:
```jsx
import IservTaskList from "./IservTaskList.jsx";
```

Die Zeilen
```jsx
  const knowledge = useKnowledge({ notes, subjects: [] });
```
und
```jsx
  const { plan, refreshPlan, isPlanning, terms } = knowledge;
```
ersetzen durch
```jsx
  const knowledge = useKnowledge({ notes, subjects: [], syncIserv });
  const [attachmentError, setAttachmentError] = useState(false);
```
und
```jsx
  const { plan, refreshPlan, isPlanning, terms, events, setEventDone, iservState } = knowledge;

  const iservEvents = useMemo(
    () =>
      events
        .filter((event) => event.iservId && !event.done)
        .sort((left, right) => left.due.localeCompare(right.due)),
    [events],
  );

  const openAttachment = (attachment) => {
    setAttachmentError(false);
    openIservAttachment({ client: iservClient, attachment }).catch(() => setAttachmentError(true));
  };
```
(Die zwei Ersatztexte stehen nacheinander an der Stelle der beiden alten Zeilen; `const [query, setQuery]` und `const [subjectFilter, …]` stehen dazwischen und bleiben.)

Die rechte Spalte — den Beginn

```jsx
        <section className="plan-column" aria-labelledby="plan-glossary-title">
          <h2 className="plan-section-title" id="plan-glossary-title">Glossar</h2>
```
ersetzen durch

```jsx
        <div className="plan-column">
          {(iservEvents.length > 0 || iservState === "error") && (
            <section className="iserv-section" aria-labelledby="plan-iserv-title">
              <h2 className="plan-section-title" id="plan-iserv-title">IServ-Aufgaben</h2>
              {iservState === "error" && (
                <div className="plan-hint" role="status">IServ-Sync nicht erreichbar.</div>
              )}
              {attachmentError && (
                <div className="plan-hint" role="status">Anhang konnte nicht geöffnet werden.</div>
              )}
              <IservTaskList
                events={iservEvents}
                onDone={setEventDone}
                onOpenAttachment={openAttachment}
              />
            </section>
          )}
          <section aria-labelledby="plan-glossary-title">
          <h2 className="plan-section-title" id="plan-glossary-title">Glossar</h2>
```

und das Ende der Datei

```jsx
          ))}
        </section>
      </div>
    </main>
```
ersetzen durch
```jsx
          ))}
          </section>
        </div>
      </div>
    </main>
```

- [ ] **Step 6: Bibliothek verdrahten**

In `src/components/Library.jsx`:

Nach `import useKnowledge from "../hooks/useKnowledge.js";` (Zeile 58) einfügen:
```jsx
import { syncIserv } from "../knowledge/iservSync.js";
```

Die Zeilen 3307–3312
```jsx
  const sourceNoteTitles = Object.fromEntries(
    knowledgeNotes
      .filter((note) => note.id && note.title)
      .map((note) => [note.id, note.title]),
  );
  const knowledge = useKnowledge({ notes: knowledgeNotes, subjects: untisSubjects });
```
ersetzen durch
```jsx
  const sourceNoteTitles = {
    ...Object.fromEntries(
      knowledgeNotes
        .filter((note) => note.id && note.title)
        .map((note) => [note.id, note.title]),
    ),
    iserv: "IServ",
  };
  const knowledge = useKnowledge({ notes: knowledgeNotes, subjects: untisSubjects, syncIserv });
```

- [ ] **Step 7: Stile anhängen**

Am Ende von `src/styles/main.css` anhängen:

```css

/* IServ-Aufgaben im Plan-Bildschirm: die Karten erben .plan-term. */
.iserv-section {
  margin-bottom: 22px;
}

.iserv-task {
  padding: 0;
}

.iserv-task-summary {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-height: 44px;
  padding: 11px 13px;
  list-style: none;
  cursor: pointer;
}

.iserv-task-summary::-webkit-details-marker {
  display: none;
}

.iserv-task-summary:focus-visible {
  outline: 2px solid #8ad4ff;
  outline-offset: -2px;
  border-radius: 14px;
}

.iserv-task-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 13px 12px;
}

.iserv-task-body {
  font: 500 12.5px/1.45 "Manrope", sans-serif;
  color: rgba(255, 255, 255, 0.8);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.iserv-task-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.iserv-task-files .plan-chip:disabled {
  opacity: 0.45;
  cursor: default;
}

.iserv-task-done {
  align-self: flex-start;
}
```

- [ ] **Step 8: Tests laufen lassen, müssen bestehen**

Run: `cd /c/Antigravity/NotesAPP && npx vitest run tests/planScreenIserv.test.jsx tests/planScreen.test.jsx tests/upcomingCard.test.jsx`
Expected: alle Tests PASS. Die bestehenden PlanScreen-Tests suchen per Text, die Umstellung von `section.plan-column` auf `div.plan-column` mit zwei inneren Sections ändert daran nichts.

- [ ] **Step 9: Commit**

```bash
cd /c/Antigravity/NotesAPP
git add src/components/IservTaskList.jsx src/components/UpcomingCard.jsx src/components/PlanScreen.jsx src/components/Library.jsx src/styles/main.css tests/planScreenIserv.test.jsx
git commit -m "$(cat <<'EOF'
feat(plan): IServ task list with description and attachments

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Gesamtprüfung

**Files:** keine Änderungen, nur Prüfung.

- [ ] **Step 1: Alle betroffenen App-Tests**

Run:
```bash
cd /c/Antigravity/NotesAPP && npx vitest run tests/knowledgeRepository.test.js tests/iservSync.test.js tests/useKnowledge.test.jsx tests/settingsIserv.test.jsx tests/settingsKnowledge.test.jsx tests/planScreen.test.jsx tests/planScreenIserv.test.jsx tests/upcomingCard.test.jsx tests/studyPlan.test.js tests/scanRun.test.js tests/documentScan.test.js
```
Expected: alle PASS

- [ ] **Step 2: Gesamte App-Suite**

Run: `cd /c/Antigravity/NotesAPP && npm test`
Expected: PASS. Schlägt etwas fehl, prüfe zuerst, ob die Datei mit Lucas uncommitteten Änderungen zusammenhängt (`git status --short`: `notePreview.js`, `useLiquidGlass.js`, `liquidGlassRecapture.test.js`). Solche Fehler sind nicht Teil dieser Arbeit, melde sie ohne sie zu beheben. Fehler in den Dateien dieses Plans behebst du.

- [ ] **Step 3: Build**

Run: `cd /c/Antigravity/NotesAPP && npm run build`
Expected: Build ohne Fehler (die Warnung zu einem dynamischen Import von `exportDocument.js`, der auch statisch importiert wird, ist erwartet und harmlos)

- [ ] **Step 4: PC-Tests und Syntax**

Run:
```bash
cd /c/Antigravity/AUTOMATISIERUNG && python -m pytest tests -q && python -m py_compile config/settings.py input/iserv_fetcher.py scheduler/orchestrator.py output/notes_sync.py core/iserv_rows.py && echo SYNTAX_OK
```
Expected: `26 passed`, `SYNTAX_OK`

- [ ] **Step 5: Datenschutz-Gegenprobe im PC-Code**

Run: `cd /c/Antigravity/AUTOMATISIERUNG && grep -n "logger\." output/notes_sync.py`
Expected: jede Log-Zeile enthält höchstens Zähler, Statuscodes oder Exception-Typen, niemals `title`, `description`, `filename`, `path` oder `url`. Steht dort etwas anderes, korrigiere es.

- [ ] **Step 6: Git-Stand**

Run: `cd /c/Antigravity/NotesAPP && git status --short && git log --oneline -8`
Expected: die Commits aus Task 4 bis 9 stehen oben; in `git status` bleiben nur Luca eigene Änderungen (`notePreview.js`, `useLiquidGlass.js`, `liquidGlassRecapture.test.js`, Bilder, `scratch/`).

---

## Abnahme durch Luca

Das kann kein Agent erledigen (echtes IServ, echtes Supabase, deine Zugangsdaten):

1. `supabase/iserv_tasks.sql` im Supabase-Dashboard (SQL-Editor) ausführen.
2. Unter Authentication einen Account anlegen, mit „Auto Confirm User".
3. In `C:\Antigravity\AUTOMATISIERUNG\.env` eintragen: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_EMAIL`, `SUPABASE_PASSWORD`.
4. In der App unter Einstellungen → „KI & Netzwerk" → „ISERV-SYNC" denselben Account eintragen.
5. APK neu bauen und installieren (Skill `update-tablet-app`).
6. `python main.py --sync` ausführen, die App öffnen und prüfen: Aufgaben in „Bald fällig" und im Plan, Beschreibung klappt auf, ein Anhang öffnet das Teilen-Menü.
7. Die Annahmen aus Spec Abschnitt 7 prüfen: steht bei den Aufgaben ein Fach, oder „Ohne Fach"? Stimmen die Fristen?

## Self-Review gegen die Spec

| Spec | Task |
|---|---|
| 3.1 Tabelle, RLS, Bucket, Policies | 4 |
| 3.2 Settings-Felder | 3 (Step 1) |
| 3.2 Fetcher `last_list`, `pick_subject` | 1, 3 (Step 2, 3) |
| 3.2 `NotesSync`: Login, bekannte Pfade, Upload, Upsert, wirft nie | 2 |
| 3.2 Push vor dem Early-Return | 3 (Step 4) |
| 3.3 eigener Client, `storageKey` | 6 (Step 3) |
| 3.3 Zugangsdaten ohne Cloud-Spiegel | 6 (Step 4) |
| 3.3 Settings-Abschnitt | 8 |
| 3.3 `rowToEvent`, `pullIservEvents`, `openIservAttachment` | 6 |
| 3.3 `eventKey`, Durchreichfelder | 5 |
| 3.3 Hook: `syncIserv`, Mount, vor `buildPlan`, Plan `null`, `iservState` | 7 |
| 3.3 Library: `syncIserv`, Quelle „IServ" | 9 (Step 6) |
| 3.3 PlanScreen-Abschnitt, `<details>`, deaktivierte Anhänge, Fehlerzeile | 9 |
| 4 Fehlerverhalten | 2 (PC-Tabelle), 6, 7, 9 |
| 5 Datenschutz (Logs) | 2, 10 (Step 5) |
| 6 Tests | in jedem Task |
| 8 Einrichtung | Abnahme |
