# IServ über den HF-Space Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die App holt IServ-Aufgaben samt Status (erledigt/abgelaufen) und Anhängen direkt vom HF-Space, ohne PC-Script und ohne Supabase.

**Architecture:** Der Space (Express + Puppeteer, bestehender Fetcher) bekommt zwei token-geschützte Routen unter `/api/notes/iserv/`. Die App ersetzt ihren Supabase-Pull durch einen `fetch` dorthin und hakt Aufgaben ab, deren IServ-Status geschlossen ist.

**Tech Stack:** Node 24 + Express 5 + Puppeteer (Space, `node --test`), React/Vite + vitest (App).

**Spec:** `docs/superpowers/specs/2026-10-10-iserv-via-hf-space-design.md`

## Global Constraints

- Space-Checkout: `C:\Antigravity\app-backend-temp`. Dort nur committen, **nicht pushen** (Space bedient auch Muse und SchoolMind; Push erst nach Freigabe).
- Bestehendes Verhalten von `fetchIServTasks`, `/api/iserv`, `/iserv/tasks` bleibt unverändert.
- Neue Routen schließen bei fehlendem `NOTES_ACCESS_TOKEN` (< 16 Zeichen) mit 503.
- Fehlerantworten tragen nur einen Code, nie Schuldomain oder Aufgabentext. Es wird nichts geloggt außer Fehlertyp und Aufgaben-ID.
- App: `iservId` bleibt die volle Aufgaben-URL; der Schlüssel nutzt die Zahl hinter `/exercise/show/`.
- Texte der App deutsch, Kommentare im Stil der Dateien (deutsch in der App, englisch im Space).

---

### Task 1: Space-Parser (`expired`, Anhangslinks, Fristtext)

**Files:**
- Modify: `C:\Antigravity\app-backend-temp\src\api\iserv-parse.js`
- Test: `C:\Antigravity\app-backend-temp\tests\iserv-parse.test.mjs`

**Interfaces:**
- Produces: `parseListHtml(html)` liefert je Aufgabe zusätzlich `expired: boolean`.
- Produces: `parseAttachmentLinks(html) -> [{ href, filename }]` (läuft im Browser: `page.evaluate`).
- Produces: `isoFromText(text) -> 'yyyy-mm-dd[Thh:mm]' | null` (reines Node, kein Browser).

- [ ] **Step 1: Tests anpassen/ergänzen** in `tests/iserv-parse.test.mjs`

Import-Zeile ersetzen:

```js
import { isoFromText, parseAttachmentLinks, parseListHtml, parseTaskHtml } from '../src/api/iserv-parse.js';
```

Die drei bestehenden `deepEqual`-Erwartungen der Listen bekommen `expired: false`:

```js
test('older list: tags, start and due by header and data-sort, done by the status title', async () => {
  assert.deepEqual(await list(LIST_OLDER), {
    101: { tags: 'Mathe', start: '2026-10-01', due: '2026-10-10T23:59', done: false, expired: false },
    102: { tags: '', start: '2026-10-02', due: '2026-10-15T12:00', done: false, expired: false },
    103: { tags: 'Englisch', start: '2026-09-28', due: '2026-10-05T08:00', done: true, expired: false },
  });
});

test('current list: the column after the due date (teacher feedback) is never taken for tags', async () => {
  assert.deepEqual(await list(LIST_CURRENT), {
    201: { tags: '', start: null, due: '2026-10-10T23:59', done: true, expired: false },
    202: { tags: 'Physik', start: null, due: '2026-10-12T08:00', done: false, expired: false },
  });
});
```

Neue Tests am Dateiende:

```js
test('status icon "Abgelaufen" marks the task expired, not done', async () => {
  const html = `<table><thead><tr><th></th><th>Aufgabe</th><th>Abgabetermin</th></tr></thead><tbody>
${ROW({ status: 'Abgelaufen', id: 301, title: 'Alt', due: '20260920120000', tags: 'Mathe' })}</tbody></table>`;
  const result = await list(html);
  assert.equal(result[301].expired, true);
  assert.equal(result[301].done, false);
});

test('attachment links: the download link of each row, the name from the name link, menu toggles skipped', async () => {
  const html = `<form name="iserv_exercise_attachment"><table><tbody>
<tr><td><a class="text-break-word" href="/iserv/fs/file/exercise/1">Blatt.pdf</a></td></tr>
<tr><td><a class="text-break-word" href="/iserv/fs/view/9">Bild.png</a></td><td><a data-toggle="dropdown" href="/">⋮</a>
<ul><li><a href="/iserv/fs/download/9">Herunterladen</a></li></ul></td></tr></tbody></table></form>
<form name="submission"><a href="/iserv/fs/file/own/2">Eigene.docx</a></form>`;
  assert.deepEqual(await page.evaluate(parseAttachmentLinks, html), [
    { href: '/iserv/fs/file/exercise/1', filename: 'Blatt.pdf' },
    { href: '/iserv/fs/download/9', filename: 'Bild.png' },
  ]);
});

test('a page without the provided-files form has no attachment links', async () => {
  assert.deepEqual(await page.evaluate(parseAttachmentLinks, PAGE_WITHOUT_FILES), []);
});

test('isoFromText reads dd.mm.yyyy with an optional time', () => {
  assert.equal(isoFromText('Do, 24.09.2026 14:30 Uhr'), '2026-09-24T14:30');
  assert.equal(isoFromText('5.10.2026'), '2026-10-05');
  assert.equal(isoFromText('Morgen'), null);
  assert.equal(isoFromText(undefined), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run (in `C:\Antigravity\app-backend-temp`): `node --test tests/iserv-parse.test.mjs`
Expected: FAIL (`isoFromText`/`parseAttachmentLinks` not exported, `expired` missing).

- [ ] **Step 3: Implementation** in `src/api/iserv-parse.js`

In `parseListHtml`, below `const doneRe = ...` add and use:

```js
  const expiredRe = /abgelaufen|expired/i;
```

and change the `out[m[1]] = ...` line to:

```js
    out[m[1]] = { tags: col !== -1 && col < cells.length ? tagsOf(cells[col]) : '', start, due, done: doneRe.test(titles), expired: expiredRe.test(titles) };
```

Update the doc comment line above `parseListHtml`: `Task list: { "<task id>": { tags, start, due, done, expired } }`.

Append to the file:

```js
/**
 * Provided files of a task page: [{ href, filename }]. Only the "provided files" form, never own submission or
 * teacher feedback. Per row: the download link if there is one (current versions also put a view link and a menu
 * toggle in each row), the file name from the row's name link. Port of parse_attachment_links in iserv.py.
 */
export function parseAttachmentLinks(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const form = doc.querySelector('form[name="iserv_exercise_attachment"]');
  const out = [];
  for (const row of form ? form.querySelectorAll('tr') : []) {
    const anchors = [...row.querySelectorAll('a[href]')].filter(
      (a) => !['/', '#'].includes(a.getAttribute('href')) && !a.hasAttribute('data-toggle'),
    );
    if (anchors.length === 0) continue;
    const pick = anchors.find((a) => a.getAttribute('href').includes('/download/')) || anchors[0];
    const named = row.querySelector('a.text-break-word') || pick;
    out.push({ href: pick.getAttribute('href'), filename: (named.textContent || '').replace(/\s+/g, ' ').trim() });
  }
  return out;
}

/** 'dd.mm.yyyy[ hh:mm]' somewhere in a text to 'yyyy-mm-dd[Thh:mm]', null if there is none. Plain Node, not for page.evaluate. */
export function isoFromText(text) {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/.exec(String(text || ''));
  if (!m) return null;
  const [, d, mo, y, h, mi] = m;
  const date = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return h ? `${date}T${h.padStart(2, '0')}:${mi}` : date;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/iserv-parse.test.mjs`
Expected: PASS (alle Tests).

- [ ] **Step 5: Commit**

```bash
cd /c/Antigravity/app-backend-temp
git add src/api/iserv-parse.js tests/iserv-parse.test.mjs
git commit -m "feat(iserv): expired flag, attachment links and due text parser"
```

---

### Task 2: Space-Fetcher (`fetchIServOverview`, `downloadIServFile`)

**Files:**
- Modify: `C:\Antigravity\app-backend-temp\src\api\iserv.js` (Login herausziehen, zwei Funktionen neu)

**Interfaces:**
- Consumes: `parseListHtml`, `parseTaskHtml`, `parseAttachmentLinks`, `isoFromText` aus `iserv-parse.js`.
- Produces: `fetchIServOverview(url, user, pass) -> Promise<Task[]>` mit
  `Task = { id: number, url: string, title: string, tags: string, due: string|null, done: boolean, expired: boolean, description: string, attachments: [{ filename, path }] }`.
- Produces: `downloadIServFile(url, user, pass, path) -> Promise<{ contentType: string, buffer: Buffer }>`; wirft `Error` mit `code` `refused | too_large | failed`.

Kein Unit-Test: beide Funktionen brauchen einen echten Browser und IServ. Ihre Logik, soweit rein, ist in Task 1 und 3 getestet; die Abnahme macht Luca nach dem Deploy (Spec §7).

- [ ] **Step 1: Login herausziehen (mechanisch, Verhalten gleich)**

Die Zeilen 64–103 von `fetchIServTasks` (von `const page = await browser.newPage();` bis zur schließenden `}` des Blocks „After login, ensure we are on the exercise page") wandern unverändert in eine Funktion oberhalb von `fetchIServTasks`; an ihrer Stelle steht `const page = await openExercisePage(browser, url, username, password);`. Per Skript, weil die Zeilen Leerraum am Ende haben:

```bash
cd /c/Antigravity/app-backend-temp
node -e "
const fs=require('fs');const f='src/api/iserv.js';
const src=fs.readFileSync(f,'utf8');const eol=src.includes('\r\n')?'\r\n':'\n';
const lines=src.split(eol);
const body=lines.slice(63,103);                       // Zeilen 64..103
if(!body[0].includes('browser.newPage')||!lines[102].trim().startsWith('}'))throw new Error('Zeilen verschoben');
const helper=['async function openExercisePage(browser, url, username, password) {',
  '  const exerciseUrl = \`\${url}/iserv/exercise\`;',
  ...body.map(l=>l.replace(/^  /,'')),
  '  return page;','}',''];
const call='    const page = await openExercisePage(browser, url, username, password);';
const at=lines.findIndex(l=>l.startsWith('export async function fetchIServTasks'));
const docStart=lines.lastIndexOf('/**',at);
const out=[...lines.slice(0,docStart),...helper,...lines.slice(docStart,63),call,...lines.slice(103)];
fs.writeFileSync(f,out.join(eol));
"
node --check src/api/iserv.js
```

Erwartet: kein Fehler. Danach `git diff src/api/iserv.js` ansehen: nur Verschiebung, keine Logikänderung.

- [ ] **Step 2: Neue Funktionen anhängen** an `src/api/iserv.js`

Import oben ergänzen:

```js
import { isoFromText, parseAttachmentLinks, parseListHtml, parseTaskHtml } from './iserv-parse.js';
```

(ersetzt die bestehende Import-Zeile von `parseListHtml, parseTaskHtml`.) Am Dateiende:

```js
const DETAIL_PARALLEL = 4;
const FILE_LIMIT = 25 * 1024 * 1024;
const TASK_ID = /\/exercise\/show\/(\d+)/;

const baseOf = (url) => (url.startsWith('http') ? url : 'https://' + url).replace(/\/+$/, '');
const launch = () => puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });

/**
 * Overview for the notes app (its own client, so nothing is censored): every task of the list with status, and for
 * every open one the description and the provided files (links only, no downloads). Done and expired tasks get no
 * task page. Tasks per item: id, url, title, tags, due ('yyyy-mm-dd[Thh:mm]' | null), done, expired, description,
 * attachments [{ filename, path }]. No mock tasks.
 */
export async function fetchIServOverview(url, username, password) {
  if (!url || !username || !password) throw new Error('Missing credentials');
  const base = baseOf(url);
  const browser = await launch();
  try {
    const page = await openExercisePage(browser, base, username, password);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/exercise/show/"]')].map((a) => ({
        href: a.getAttribute('href'),
        title: a.innerText.trim(),
        deadline: (a.closest('tr')?.querySelectorAll('td')[2]?.innerText || '').trim(),
      })),
    );
    const meta = rows.length ? await page.evaluate(parseListHtml, await rawHtml(page)) : {};
    const tasks = [];
    const seen = new Set();
    for (const row of rows) {
      const id = TASK_ID.exec(row.href || '')?.[1];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const listed = meta[id] || {};
      tasks.push({
        id: Number(id),
        url: `${base}/iserv/exercise/show/${id}`,
        title: row.title,
        tags: listed.tags || '',
        due: listed.due || isoFromText(row.deadline),
        done: listed.done === true,
        expired: listed.expired === true,
        description: '',
        attachments: [],
      });
    }

    const open = tasks.filter((task) => !task.done && !task.expired);
    const fill = async (task) => {
      try {
        const html = await page.evaluate(async (u) => (await fetch(u)).text(), task.url);
        task.description = (await page.evaluate(parseTaskHtml, html)).description;
        for (const link of await page.evaluate(parseAttachmentLinks, html)) {
          const target = new URL(link.href, base);
          if (target.host === new URL(base).host) task.attachments.push({ filename: link.filename, path: target.pathname + target.search });
        }
      } catch (e) {
        console.error('IServ overview detail failed:', task.id, safeError(e));
      }
    };
    const queue = [...open];
    await Promise.all(
      Array.from({ length: DETAIL_PARALLEL }, async () => {
        for (let task = queue.shift(); task; task = queue.shift()) await fill(task);
      }),
    );
    return tasks;
  } finally {
    await browser.close();
  }
}

/** One file of the school server, fetched inside the logged-in tab. Throws Error with code refused | too_large | failed. */
export async function downloadIServFile(url, username, password, path) {
  if (!url || !username || !password) throw new Error('Missing credentials');
  const base = baseOf(url);
  const browser = await launch();
  try {
    const page = await openExercisePage(browser, base, username, password);
    const result = await page.evaluate(
      async (target, limit) => {
        const res = await fetch(target);
        if (!res.ok) return { error: res.status === 401 || res.status === 403 ? 'refused' : 'failed' };
        const blob = await res.blob();
        if (blob.size > limit) return { error: 'too_large' };
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        return { contentType: blob.type || 'application/octet-stream', data: String(data).split(',')[1] || '' };
      },
      `${base}${path}`,
      FILE_LIMIT,
    );
    if (result.error) throw Object.assign(new Error(result.error), { code: result.error });
    return { contentType: result.contentType, buffer: Buffer.from(result.data, 'base64') };
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 3: Syntax prüfen und bestehende Tests laufen lassen**

Run: `node --check src/api/iserv.js && node --test tests/iserv-parse.test.mjs tests/iserv-release.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/api/iserv.js
git commit -m "feat(iserv): overview and file download for the notes app"
```

---

### Task 3: Space-Routen (`iserv-notes.js`) und Registrierung

**Files:**
- Create: `C:\Antigravity\app-backend-temp\src\api\iserv-notes.js`
- Create: `C:\Antigravity\app-backend-temp\tests\iserv-notes.test.mjs`
- Modify: `C:\Antigravity\app-backend-temp\server.js` (Import + `registerIServNotes(app);` nach `registerIServFiltered(app);`)

**Interfaces:**
- Consumes: `fetchIServOverview`, `downloadIServFile` (Task 2).
- Produces: `registerIServNotes(app, { overview?, file?, now? })`, `isSafeIServPath(path) -> boolean`.
- Produces (HTTP): `GET /api/notes/iserv/tasks` → `{ tasks, fetchedAt }`; `GET /api/notes/iserv/file?path=` → Dateibytes. Fehler `{ error: code }`.

- [ ] **Step 1: Failing test** `tests/iserv-notes.test.mjs`

```js
import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import express from 'express';
import { isSafeIServPath, registerIServNotes } from '../src/api/iserv-notes.js';

const KEY = 'k'.repeat(20);
process.env.NOTES_ACCESS_TOKEN = KEY;
process.env.ISERV_BASE_URL = 'https://schule.example';
process.env.ISERV_USERNAME = 'user';
process.env.ISERV_PASSWORD = 'pass';

let overviewCalls = 0;
let overviewImpl;
let fileImpl;
const app = express();
registerIServNotes(app, {
  overview: async (...args) => { overviewCalls += 1; return overviewImpl(...args); },
  file: async (...args) => fileImpl(...args),
});
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/notes/iserv`;
const get = (path, key = KEY) => fetch(`${base}${path}`, { headers: key ? { 'x-app-key': key } : {} });
after(() => server.close());
beforeEach(() => {
  overviewCalls = 0;
  overviewImpl = async () => [{ id: 1, url: 'https://schule.example/iserv/exercise/show/1', title: 'Blatt', done: false }];
  fileImpl = async () => ({ contentType: 'application/pdf', buffer: Buffer.from('PDF') });
});

test('isSafeIServPath only lets plain /iserv/ paths through', () => {
  assert.equal(isSafeIServPath('/iserv/fs/file/exercise/1'), true);
  assert.equal(isSafeIServPath('/iserv/fs/download/9?x=1'), true);
  for (const bad of ['/etc/passwd', '/iserv/../etc', '//evil.example/iserv/x', 'https://evil.example/iserv/x', '/iserv/a//b', '/iserv/a\\b', '', undefined]) {
    assert.equal(isSafeIServPath(bad), false, String(bad));
  }
});

test('no or short NOTES_ACCESS_TOKEN: closed with 503', async () => {
  const saved = process.env.NOTES_ACCESS_TOKEN;
  process.env.NOTES_ACCESS_TOKEN = 'short';
  try {
    assert.equal((await get('/tasks', 'short')).status, 503);
  } finally {
    process.env.NOTES_ACCESS_TOKEN = saved;
  }
});

test('missing or wrong key is refused on both routes', async () => {
  for (const path of ['/tasks', '/file?path=/iserv/x']) {
    assert.equal((await get(path, '')).status, 401);
    assert.equal((await get(path, 'x'.repeat(20))).status, 401);
  }
});

test('tasks: right key returns the list and a second call comes from the cache', async () => {
  const first = await get('/tasks');
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  const body = await first.json();
  assert.equal(body.tasks[0].title, 'Blatt');
  assert.match(body.fetchedAt, /^\d{4}-\d{2}-\d{2}T/);
  await get('/tasks');
  assert.equal(overviewCalls, 1);
});

test('tasks: a failing fetch gives only the code, never the message', async () => {
  // new app instance would be needed to bypass the cache; wait it out by injecting an expired clock
  const failing = express();
  registerIServNotes(failing, { overview: async () => { throw new Error('https://schule.example secret'); } });
  const s = failing.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${s.address().port}/api/notes/iserv/tasks`, { headers: { 'x-app-key': KEY } });
    assert.equal(r.status, 502);
    assert.equal(await r.text(), '{"error":"unreachable"}');
  } finally {
    s.close();
  }
});

test('file: unsafe path is 400, safe path streams the bytes with the content type', async () => {
  assert.equal((await get('/file?path=/etc/passwd')).status, 400);
  const ok = await get('/file?path=%2Fiserv%2Ffs%2Ffile%2Fexercise%2F1');
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await ok.arrayBuffer()).toString(), 'PDF');
});

test('file: too_large is 413, refused is 502 with its code', async () => {
  fileImpl = async () => { throw Object.assign(new Error('x'), { code: 'too_large' }); };
  const big = await get('/file?path=/iserv/fs/file/exercise/1');
  assert.equal(big.status, 413);
  assert.deepEqual(await big.json(), { error: 'too_large' });
  fileImpl = async () => { throw Object.assign(new Error('x'), { code: 'refused' }); };
  const refused = await get('/file?path=/iserv/fs/file/exercise/1');
  assert.equal(refused.status, 502);
  assert.deepEqual(await refused.json(), { error: 'refused' });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/iserv-notes.test.mjs`
Expected: FAIL (module `iserv-notes.js` fehlt).

- [ ] **Step 3: Implementation** `src/api/iserv-notes.js`

```js
// GET /api/notes/iserv/tasks and GET /api/notes/iserv/file?path=: the notes app's own view of IServ (tasks with
// status, description and provided files). IServ credentials come from the Space secrets (ISERV_BASE_URL,
// ISERV_USERNAME, ISERV_PASSWORD), never from the request. Unlike the other /api/notes routes these FAIL CLOSED:
// without a NOTES_ACCESS_TOKEN of at least 16 characters nothing is served. Errors carry a code only (the messages
// of Puppeteer and IServ quote the school domain and task text). Nothing is logged.
import { timingSafeEqual } from 'node:crypto';
import { downloadIServFile, fetchIServOverview } from './iserv.js';

const CACHE_MS = 3 * 60_000; // several opens of the app must not log in to IServ each time

/** A path on the school server: /iserv/…, no scheme or host, no dot segments, no double slash. */
export function isSafeIServPath(path) {
  return typeof path === 'string' && path.startsWith('/iserv/') && path.length <= 2000 && !/[\\\s]|\.\.|\/\//.test(path);
}

function keyOk(req) {
  const expected = Buffer.from(process.env.NOTES_ACCESS_TOKEN || '');
  const offered = [req.headers['x-app-key'], (req.headers.authorization || '').replace(/^Bearer\s+/i, '')];
  return offered.some((o) => o && Buffer.byteLength(o) === expected.length && timingSafeEqual(Buffer.from(o), expected));
}

/** true if the request may continue; otherwise the answer is already sent. */
function allowed(req, res) {
  res.set('Cache-Control', 'no-store');
  if ((process.env.NOTES_ACCESS_TOKEN || '').length < 16) return void res.status(503).json({ error: 'config' });
  if (!keyOk(req)) return void res.status(401).json({ error: 'unauthorized' });
  const { ISERV_BASE_URL: url, ISERV_USERNAME: user, ISERV_PASSWORD: pass } = process.env;
  if (!url || !user || !pass || !url.startsWith('https://')) return void res.status(503).json({ error: 'config' });
  return true;
}

export function registerIServNotes(app, { overview = fetchIServOverview, file = downloadIServFile, now = Date.now } = {}) {
  let running = Promise.resolve(); // one IServ session at a time
  let cached = null; // { at, tasks }, memory only
  const credentials = () => [process.env.ISERV_BASE_URL, process.env.ISERV_USERNAME, process.env.ISERV_PASSWORD];
  const queued = (run) => {
    const job = running.then(run, run);
    running = job.catch(() => {});
    return job;
  };

  app.get('/api/notes/iserv/tasks', async (req, res) => {
    if (!allowed(req, res)) return;
    try {
      const { at, tasks } = await queued(async () => {
        if (cached && now() - cached.at < CACHE_MS) return cached;
        cached = { at: now(), tasks: await overview(...credentials()) };
        return cached;
      });
      res.json({ tasks, fetchedAt: new Date(at).toISOString() });
    } catch {
      res.status(502).json({ error: 'unreachable' });
    }
  });

  app.get('/api/notes/iserv/file', async (req, res) => {
    if (!allowed(req, res)) return;
    const path = req.query.path;
    if (!isSafeIServPath(path)) return res.status(400).json({ error: 'bad_path' });
    try {
      const { contentType, buffer } = await queued(() => file(...credentials(), path));
      res.set('Content-Type', contentType).send(buffer);
    } catch (e) {
      const code = e?.code === 'too_large' || e?.code === 'refused' ? e.code : 'unreachable';
      res.status(code === 'too_large' ? 413 : 502).json({ error: code });
    }
  });
}
```

- [ ] **Step 4: Registrieren** in `server.js`

Nach `import { registerIServFiltered } from './src/api/iserv-filtered.js';` einfügen:

```js
import { registerIServNotes } from './src/api/iserv-notes.js';
```

und direkt unter `registerIServFiltered(app);`:

```js
registerIServNotes(app);
```

- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/iserv-notes.test.mjs tests/iserv-parse.test.mjs tests/iserv-release.test.mjs && node --check server.js`
Expected: PASS.

- [ ] **Step 6: Commit (nicht pushen)**

```bash
git add src/api/iserv-notes.js tests/iserv-notes.test.mjs server.js
git commit -m "feat(iserv): /api/notes/iserv/tasks and /file for the notes app"
```

---

### Task 4: App-Merge (Schlüssel und Status)

**Files:**
- Modify: `C:\Antigravity\NotesAPP\src\knowledge\knowledgeRepository.js`
- Test: `C:\Antigravity\NotesAPP\tests\knowledgeRepository.test.js`

**Interfaces:**
- Produces: Events mit `iservId` und `iservClosed: boolean` werden von `mergeFindings` so verarbeitet: bekannter Termin wird beim Wechsel zu geschlossen `done: true`; unbekannter geschlossener wird nicht angelegt. `iservClosed` wird am Termin gespeichert.

- [ ] **Step 1: Failing tests** am Ende von `tests/knowledgeRepository.test.js` anfügen. Vorher die Kopfzeilen der Datei ansehen und denselben Helfer zum Anlegen eines Repositories benutzen (in dieser Datei `memoryRepository()` bzw. gleichwertig); falls er anders heißt, entsprechend übernehmen:

```js
describe("mergeFindings: IServ-Status", () => {
  const task = (overrides = {}) => ({
    kind: "homework",
    title: "Blatt",
    subject: "Mathe",
    due: "2026-10-01",
    iservId: "https://schule.example/iserv/exercise/show/77",
    url: "https://schule.example/iserv/exercise/show/77",
    description: "",
    attachments: [],
    iservClosed: false,
    ...overrides,
  });

  it("hakt eine bekannte Aufgabe ab, sobald IServ sie als erledigt oder abgelaufen meldet", () => {
    const repository = memoryRepository();
    repository.mergeFindings({ events: [task()], sourceNoteId: "iserv" });
    repository.mergeFindings({ events: [task({ iservClosed: true })], sourceNoteId: "iserv" });
    expect(repository.read().events[0].done).toBe(true);
  });

  it("legt eine unbekannte, schon geschlossene Aufgabe nicht an", () => {
    const repository = memoryRepository();
    const result = repository.mergeFindings({ events: [task({ iservClosed: true })], sourceNoteId: "iserv" });
    expect(result.addedEvents).toBe(0);
    expect(repository.read().events).toHaveLength(0);
  });

  it("lässt ein Un-Häkchen stehen, solange sich der IServ-Status nicht ändert", () => {
    const repository = memoryRepository();
    repository.mergeFindings({ events: [task()], sourceNoteId: "iserv" });
    repository.mergeFindings({ events: [task({ iservClosed: true })], sourceNoteId: "iserv" });
    repository.setEventDone(repository.read().events[0].id, false);
    repository.mergeFindings({ events: [task({ iservClosed: true })], sourceNoteId: "iserv" });
    expect(repository.read().events[0].done).toBe(false);
  });

  it("nimmt ein App-Häkchen nicht zurück, wenn IServ die Aufgabe noch offen führt", () => {
    const repository = memoryRepository();
    repository.mergeFindings({ events: [task()], sourceNoteId: "iserv" });
    repository.setEventDone(repository.read().events[0].id, true);
    repository.mergeFindings({ events: [task()], sourceNoteId: "iserv" });
    expect(repository.read().events[0].done).toBe(true);
  });

  it("erkennt eine ältere Aufgabe ohne iservClosed wieder, auch bei anderer Schreibweise der Domain", () => {
    const repository = memoryRepository();
    repository.mergeFindings({
      events: [task({ iservId: "https://alt.example/iserv/exercise/show/77", iservClosed: undefined })],
      sourceNoteId: "iserv",
    });
    const result = repository.mergeFindings({ events: [task({ iservClosed: true })], sourceNoteId: "iserv" });
    expect(result.addedEvents).toBe(0);
    expect(repository.read().events).toHaveLength(1);
    expect(repository.read().events[0].done).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/knowledgeRepository.test.js`
Expected: FAIL (neue Tests).

- [ ] **Step 3: Implementation** in `knowledgeRepository.js`

`eventKey` ersetzen:

```js
// IServ-Termine sind über die Zahl ihrer Aufgaben-URL eindeutig (…/exercise/show/<id>): ändert sich Titel,
// Frist oder die Schreibweise der Domain, wird derselbe Termin aktualisiert statt ein zweiter angelegt.
const iservTaskId = (value) => /\/exercise\/show\/(\d+)/.exec(String(value))?.[1] ?? String(value);

const eventKey = (event) =>
  event.iservId
    ? `iserv|${iservTaskId(event.iservId)}`
    : `${event.kind}|${normalizeKey(event.subject)}|${event.due}|${normalizeKey(event.title)}`;
```

`mergeList` bekommt zwei optionale Hooks:

```js
  const mergeList = (existing, incoming, keyOf, build, { skip = () => false, onKnown = () => null } = {}) => {
    const byKey = new Map(existing.map((entry) => [keyOf(entry), entry]));
    let added = 0;
    for (const raw of incoming) {
      const candidate = build(raw);
      const key = keyOf(candidate);
      const previous = byKey.get(key);
      if (previous) {
        byKey.set(key, {
          ...candidate,
          id: previous.id,
          createdAt: previous.createdAt,
          ...(previous.done !== undefined ? { done: previous.done } : {}),
          // Was der Nutzer zur Klausur angegeben hat, überlebt jeden IServ-Abgleich.
          ...(previous.topic ? { topic: previous.topic } : {}),
          ...(previous.prep ? { prep: previous.prep } : {}),
          ...(previous.need ? { need: previous.need } : {}),
          ...(previous.study ? { study: previous.study } : {}),
          ...onKnown(candidate, previous),
        });
      } else if (!skip(candidate)) {
        byKey.set(key, candidate);
        added += 1;
      }
    }
    return { list: [...byKey.values()], added };
  };
```

In `mergeFindings` den Event-Aufruf erweitern: im `build` neben `done: false` das Feld

```js
          ...(raw.iservId ? { iservClosed: raw.iservClosed === true } : {}),
```

(innerhalb des bestehenden `...(raw.iservId ? { … } : {})`-Blocks bei `attachments: raw.attachments,` ergänzen: `iservClosed: raw.iservClosed === true,`) und als vierten Parameter von `mergeList(state.events, events, eventKey, build, …)`:

```js
        }), {
          // Was IServ schon als erledigt oder abgelaufen führt, kommt nicht neu in den Kalender.
          skip: (event) => event.iservClosed === true,
          // Wechselt eine bekannte Aufgabe auf geschlossen, ist sie abgehakt. Danach gilt wieder die App.
          onKnown: (event, previous) => (event.iservClosed && !previous.iservClosed ? { done: true } : null),
        });
```

(`}), {` schließt `build` und öffnet das Optionsobjekt; die Terms-Zeile bleibt ohne Optionen.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/knowledgeRepository.test.js tests/studyPlan.test.js tests/useKnowledge.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/knowledge/knowledgeRepository.js tests/knowledgeRepository.test.js
git commit -m "feat(iserv): adopt erledigt/abgelaufen as done, key IServ tasks by id"
```

---

### Task 5: App-Sync vom Space (`iservSync.js`)

**Files:**
- Modify (komplett ersetzen): `C:\Antigravity\NotesAPP\src\knowledge\iservSync.js`
- Modify (komplett ersetzen): `C:\Antigravity\NotesAPP\tests\iservSync.test.js`

**Interfaces:**
- Consumes: `loadAgentConfig()` aus `src/agent/agentSettings.js` → `{ baseUrl, accessKey }`; `saveAndShare(blob, filename)` aus `documents/exportDocument.js`.
- Produces: `taskToEvent(task)`, `pullIservEvents({ config, fetchImpl })`, `syncIserv({ repository, loadConfig, fetchImpl })` (→ Anzahl neuer Termine oder `null`), `openIservAttachment({ attachment, config, share, fetchImpl })`, `ISERV_SOURCE_ID`.

- [ ] **Step 1: Failing tests** — `tests/iservSync.test.js` komplett ersetzen:

```js
import { describe, expect, it, vi } from "vitest";
import {
  openIservAttachment,
  pullIservEvents,
  syncIserv,
  taskToEvent,
} from "../src/knowledge/iservSync.js";
import { createKnowledgeRepository } from "../src/knowledge/knowledgeRepository.js";

const config = { baseUrl: "https://space.example/api/notes/", accessKey: "k".repeat(20) };

const task = (overrides = {}) => ({
  id: 1,
  url: "https://schule.example/iserv/exercise/show/1",
  title: "Blatt 3",
  tags: "Mathe",
  due: "2026-09-24T14:30",
  done: false,
  expired: false,
  description: "Löse Seite 10",
  attachments: [{ filename: "Blatt.pdf", path: "/iserv/fs/file/exercise/1" }],
  ...overrides,
});

const jsonResponse = (body, status = 200) =>
  ({ ok: status < 400, status, json: async () => body, blob: async () => new Blob(["x"]) });

function memoryRepository() {
  const values = new Map();
  return createKnowledgeRepository(
    { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    { now: () => 1 },
  );
}

describe("taskToEvent", () => {
  it("macht aus einer Aufgabe eine Hausaufgabe mit Frist und Uhrzeit", () => {
    expect(taskToEvent(task())).toEqual({
      kind: "homework",
      title: "Blatt 3",
      subject: "Mathe",
      due: "2026-09-24",
      time: "14:30",
      iservId: "https://schule.example/iserv/exercise/show/1",
      url: "https://schule.example/iserv/exercise/show/1",
      description: "Löse Seite 10",
      attachments: [{ filename: "Blatt.pdf", path: "/iserv/fs/file/exercise/1" }],
      iservClosed: false,
    });
  });

  it("nimmt ein Datum ohne Uhrzeit ohne time", () => {
    expect(taskToEvent(task({ due: "2026-09-24" })).time).toBeUndefined();
  });

  it("meldet erledigt und abgelaufen als geschlossen", () => {
    expect(taskToEvent(task({ done: true })).iservClosed).toBe(true);
    expect(taskToEvent(task({ expired: true })).iservClosed).toBe(true);
  });

  it("verwirft Aufgaben ohne Titel, Frist oder URL", () => {
    expect(taskToEvent(task({ title: " " }))).toBeNull();
    expect(taskToEvent(task({ due: null }))).toBeNull();
    expect(taskToEvent(task({ url: "" }))).toBeNull();
  });

  it("verträgt fehlende Anhänge", () => {
    expect(taskToEvent(task({ attachments: null })).attachments).toEqual([]);
  });
});

describe("pullIservEvents", () => {
  it("fragt den Space mit dem Schlüssel und gibt die Termine zurück", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ tasks: [task(), task({ id: 2, title: "" })] }));
    const events = await pullIservEvents({ config, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://space.example/api/notes/iserv/tasks");
    expect(fetchImpl.mock.calls[0][1].headers["x-app-key"]).toBe(config.accessKey);
    expect(events).toHaveLength(1);
  });

  it("wirft bei einem Fehlerstatus", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "unreachable" }, 502));
    await expect(pullIservEvents({ config, fetchImpl })).rejects.toThrow();
  });
});

describe("syncIserv", () => {
  it("ist ohne Zugriffsschlüssel aus und fragt nicht", async () => {
    const fetchImpl = vi.fn();
    const result = await syncIserv({
      repository: memoryRepository(),
      loadConfig: () => ({ ...config, accessKey: "" }),
      fetchImpl,
    });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("trägt neue Aufgaben ein und hakt geschlossene bekannte ab", async () => {
    const repository = memoryRepository();
    const loadConfig = () => config;
    await syncIserv({
      repository,
      loadConfig,
      fetchImpl: async () => jsonResponse({ tasks: [task()] }),
    });
    expect(repository.read().events).toHaveLength(1);
    const added = await syncIserv({
      repository,
      loadConfig,
      fetchImpl: async () => jsonResponse({ tasks: [task({ expired: true }), task({ id: 9, url: "https://schule.example/iserv/exercise/show/9", expired: true })] }),
    });
    expect(added).toBe(0);
    const [event] = repository.read().events;
    expect(repository.read().events).toHaveLength(1);
    expect(event.done).toBe(true);
    expect(event.sourceNoteId).toBe("iserv");
  });

  it("wirft bei einem Fehler, damit der Hook den Zustand setzt", async () => {
    await expect(
      syncIserv({ repository: memoryRepository(), loadConfig: () => config, fetchImpl: async () => jsonResponse({}, 503) }),
    ).rejects.toThrow();
  });
});

describe("openIservAttachment", () => {
  it("lädt die Datei über den Space und reicht sie ans Teilen-Menü", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const share = vi.fn(async () => {});
    await openIservAttachment({
      attachment: { filename: "Blatt:1.pdf", path: "/iserv/fs/file/exercise/1" },
      config,
      share,
      fetchImpl,
    });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://space.example/api/notes/iserv/file?path=%2Fiserv%2Ffs%2Ffile%2Fexercise%2F1",
    );
    expect(share).toHaveBeenCalledWith(expect.any(Blob), "Blatt_1.pdf");
  });

  it("wirft ohne Pfad", async () => {
    await expect(openIservAttachment({ attachment: { filename: "x" }, config, fetchImpl: vi.fn() })).rejects.toThrow();
  });

  it("wirft, wenn der Space die Datei nicht liefert", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "refused" }, 502));
    await expect(
      openIservAttachment({ attachment: { filename: "x", path: "/iserv/x" }, config, share: vi.fn(), fetchImpl }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/iservSync.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementation** — `src/knowledge/iservSync.js` komplett:

```js
import { loadAgentConfig } from "../agent/agentSettings.js";

export const ISERV_SOURCE_ID = "iserv";

// Kaltstart des Space (Puppeteer, Anmeldung, Aufgabenseiten) dauert; danach liegt das Ergebnis dort im Cache.
const PULL_TIMEOUT_MS = 25_000;
const FILE_TIMEOUT_MS = 60_000;
const ISO_DATE = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/;

const endpoint = (config, path) => `${String(config.baseUrl).replace(/\/+$/, "")}/iserv/${path}`;
const headers = (config) => ({ "x-app-key": config.accessKey });

// Eine Aufgabe des Space als Termin der Terminplanung. Ohne Titel, URL oder lesbare Frist lässt sich nichts
// einplanen. Ohne Uhrzeit nimmt der Lernplan 23:59 an (siehe studyPlan.js).
export function taskToEvent(task) {
  const title = String(task?.title ?? "").trim();
  const url = String(task?.url ?? "");
  const due = ISO_DATE.exec(String(task?.due ?? ""));
  if (!title || !url || !due) return null;
  return {
    kind: "homework",
    title,
    subject: String(task.tags ?? "").trim(),
    due: due[1],
    ...(due[2] ? { time: due[2] } : {}),
    iservId: url,
    url,
    description: String(task.description ?? ""),
    attachments: Array.isArray(task.attachments) ? task.attachments : [],
    // erledigt oder abgelaufen: in IServ nichts mehr zu tun
    iservClosed: task.done === true || task.expired === true,
  };
}

export async function pullIservEvents({ config, fetchImpl = (...args) => fetch(...args) }) {
  const response = await fetchImpl(endpoint(config, "tasks"), {
    headers: headers(config),
    signal: AbortSignal.timeout(PULL_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`IServ ${response.status}`);
  const body = await response.json();
  return (Array.isArray(body?.tasks) ? body.tasks : []).map(taskToEvent).filter(Boolean);
}

// Rückgabe: Anzahl neuer Termine, oder null, wenn nichts eingerichtet ist (kein Zugriffsschlüssel).
// Wirft bei Netzwerk- und Serverfehlern, der Aufrufer entscheidet, wie das angezeigt wird.
export async function syncIserv({ repository, loadConfig = loadAgentConfig, fetchImpl } = {}) {
  const config = loadConfig();
  if (!config?.accessKey || !config?.baseUrl) return null;
  const events = await pullIservEvents({ config, fetchImpl });
  return repository.mergeFindings({ events, sourceNoteId: ISERV_SOURCE_ID }).addedEvents;
}

// Lädt den Anhang über den Space (er ist dort angemeldet) und reicht ihn ans Teilen-Menü des Systems.
// saveAndShare kommt per dynamischem Import, damit dieses Modul (und seine Tests) jspdf und die
// Capacitor-Plugins nicht mitladen.
export async function openIservAttachment({
  attachment,
  config = loadAgentConfig(),
  share,
  fetchImpl = (...args) => fetch(...args),
}) {
  if (!attachment?.path) throw new Error("Anhang nicht verfügbar.");
  const response = await fetchImpl(`${endpoint(config, "file")}?path=${encodeURIComponent(attachment.path)}`, {
    headers: headers(config),
    signal: AbortSignal.timeout(FILE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("Download fehlgeschlagen.");
  const data = await response.blob();
  const shareFile = share || (await import("../documents/exportDocument.js")).saveAndShare;
  await shareFile(data, String(attachment.filename || "Anhang").replace(/[\\/:*?"<>|]+/g, "_"));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/iservSync.test.js tests/knowledgeRepository.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/knowledge/iservSync.js tests/iservSync.test.js
git commit -m "feat(iserv): pull tasks, status and files from the HF space instead of Supabase"
```

---

### Task 6: Supabase-Reste aus der App entfernen

**Files:**
- Delete: `src/lib/iservClient.js`, `src/ink/iservSettings.js`, `tests/settingsIserv.test.jsx`
- Modify: `src/components/CalendarScreen.jsx` (Import und Aufruf)
- Modify: `src/components/Settings.jsx` (State, Effekte, Abschnitt „ISERV-SYNC", Import)
- Modify: `tests/calendarScreen.test.jsx` falls es `iservClient` erwartet

**Interfaces:**
- Consumes: `openIservAttachment({ attachment })` (Task 5).

- [ ] **Step 1: CalendarScreen**

In `src/components/CalendarScreen.jsx`:
- die Zeile `import { iservClient } from "../lib/iservClient.js";` löschen;
- `openIservAttachment({ client: iservClient, attachment })` → `openIservAttachment({ attachment })`.

- [ ] **Step 2: Settings**

In `src/components/Settings.jsx`:
- die Zeile `import { loadIservCredentials, saveIservCredentials } from "../ink/iservSettings.js";` löschen;
- den Block von `// IServ-Sync-Account (Supabase) …` bis einschließlich des zweiten `useEffect` mit `saveIservCredentials(...)` löschen;
- im JSX den Abschnitt von `<div className="settings-section-caption" style={{ marginTop: 20 }}>` mit Text `ISERV-SYNC` bis zum schließenden `</div>` der `settings-group` löschen (Unterschied zum Untis-Block: dieser steht direkt oberhalb und bleibt).

- [ ] **Step 3: Dateien löschen**

```bash
git rm src/lib/iservClient.js src/ink/iservSettings.js tests/settingsIserv.test.jsx
```

- [ ] **Step 4: Verbleibende Verweise suchen**

Run: `grep -rn -E "iservClient|iservSettings|loadIservCredentials|ISERV_BUCKET|iservCredentials" src tests`
Expected: keine Treffer. Treffer in Tests (z. B. `calendarScreen.test.jsx`, `useKnowledge.test.jsx`) auf die neue Signatur anpassen.

- [ ] **Step 5: Volle Testläufe**

Run: `npx vitest run`
Expected: PASS (bis auf bereits vor dieser Arbeit fehlschlagende Tests; diese vorher mit `git stash` gegenprüfen und im Bericht nennen).

Run: `npx vite build`
Expected: Build ohne Fehler (prüft, dass kein Import mehr auf gelöschte Dateien zeigt).

- [ ] **Step 6: Commit — nur die eigenen Hunks von CalendarScreen**

`src/components/CalendarScreen.jsx` trägt unabhängige, uncommittete Änderungen (entfernter `DayLessons`). Nur die eigenen zwei Hunks stagen:

```bash
git diff -U0 src/components/CalendarScreen.jsx > /tmp/cal.diff   # Hunks ansehen
# nur die Hunks mit iservClient/openIservAttachment in /tmp/cal-iserv.diff übernehmen, dann:
git apply --cached --unidiff-zero /tmp/cal-iserv.diff
git add src/components/Settings.jsx tests
git commit -m "refactor(iserv): drop Supabase account, client and settings section"
```

---

## Self-Review

- **Spec-Abdeckung:** §3 Space (Parser, Fetcher, Routen, fail-closed, Cache, Pfadprüfung, Fehlercodes) → Task 1–3. §4 App (taskToEvent, pull, sync, openAttachment, eventKey, Merge, Entfernen, CalendarScreen) → Task 4–6. §5 Fehlerverhalten → Tests in Task 3 und 5; `iservState` setzt der bestehende Hook. §6 Annahmen bleiben offen bis zur Abnahme.
- **Abweichung von der Spec:** keine; `Content-Disposition` wird nicht durchgereicht, die Spec sagt das jetzt auch.
- **Typkonsistenz:** `iservClosed` (App-intern), `done`/`expired` (Space), `path`/`filename` (Anhang), `fetchedAt` (Antwort), Fehlercodes `config | unauthorized | unreachable | bad_path | too_large | refused` über Task 2, 3, 5 gleich.
