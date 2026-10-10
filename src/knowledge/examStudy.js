// Eigenes fold: sources.js zieht OCR und Speicher mit, studyPlan.js soll leicht bleiben.
const fold = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

// Das Klausur-Dashboard (event.study): Themen mit Selbsteinschätzung, Karten,
// Quiz und Formelblatt. Reine Funktionen: Inhalt vom Modell wird hier hart
// gekürzt und geprüft, ids vergibt die App. Fortschritt (level, box, tries,
// hits) hängt am Eintrag und überlebt ein Ersetzen des Inhalts.
export const LIMITS = {
  call: { topics: 12, cards: 30, quiz: 15, sheet: 8 },
  total: { topics: 12, cards: 60, quiz: 30, sheet: 8 },
  chars: { topic: 60, front: 120, back: 240, question: 200, option: 80, why: 160, sheetTitle: 60, sheetText: 300 },
};

export const LEVEL_LABELS = ["Weiß ich nicht", "Unsicher", "Gut", "Sicher"];
// Tage, nach denen eine Karte je Box wieder fällig ist (Box 0 immer).
const BOX_DAYS = [0, 1, 3, 7];
const WEAK_QUOTE = 0.5;

const clip = (value, limit) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
const list = (value) => (Array.isArray(value) ? value : []);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function isoOf(timestamp) {
  const date = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const dayNumber = (iso) => {
  const [year, month, day] = String(iso).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
};

export const emptyStudy = (now = 0) => ({ v: 1, at: now, topics: [], cards: [], quiz: [], sheet: [] });

// Ohne Inhalt gibt es kein Dashboard.
export const hasStudy = (study) =>
  Boolean(study) && (study.topics?.length > 0 || study.cards?.length > 0 || study.quiz?.length > 0 || study.sheet?.length > 0);

export const studyCounts = (study) => ({
  topics: study?.topics?.length || 0,
  cards: study?.cards?.length || 0,
  quiz: study?.quiz?.length || 0,
  sheet: study?.sheet?.length || 0,
});

function nextCounter(items, prefix) {
  const numbers = items.map((item) => Number(String(item.id).slice(prefix.length))).filter(Number.isFinite);
  return Math.max(0, ...numbers) + 1;
}

/**
 * Macht aus der Modellausgabe ein gültiges Dashboard.
 * @param input {topics, cards, quiz, sheet} wie vom Modell geliefert
 * @param existing vorhandenes event.study oder null
 * @param mode "add" hängt an und überspringt Doppelte, "replace" ersetzt und
 *   behält den Fortschritt gleicher Einträge.
 */
export function normalizeStudy(input, existing = null, mode = "add", now = Date.now()) {
  const base = existing && mode === "add" ? existing : emptyStudy(now);
  const old = existing || emptyStudy(now);
  const call = LIMITS.call;
  const total = LIMITS.total;
  const chars = LIMITS.chars;

  const topics = [...list(base.topics)];
  const topicKeys = new Set(topics.map((topic) => fold(topic.title)));
  let topicCounter = nextCounter(topics, "t");
  for (const raw of list(input?.topics).slice(0, call.topics)) {
    const title = clip(typeof raw === "string" ? raw : raw?.title, chars.topic);
    if (!title || topicKeys.has(fold(title)) || topics.length >= total.topics) continue;
    topicKeys.add(fold(title));
    const previous = old.topics.find((topic) => fold(topic.title) === fold(title));
    topics.push({ id: `t${topicCounter}`, title, level: previous?.level ?? null });
    topicCounter += 1;
  }
  const topicId = (title) => topics.find((topic) => fold(topic.title) === fold(clip(title, chars.topic)))?.id ?? null;

  const cards = [...list(base.cards)];
  const cardKeys = new Set(cards.map((card) => fold(card.front)));
  let cardCounter = nextCounter(cards, "c");
  for (const raw of list(input?.cards).slice(0, call.cards)) {
    const front = clip(raw?.front, chars.front);
    const back = clip(raw?.back, chars.back);
    if (!front || !back || cardKeys.has(fold(front)) || cards.length >= total.cards) continue;
    cardKeys.add(fold(front));
    const previous = old.cards.find((card) => fold(card.front) === fold(front));
    cards.push({
      id: `c${cardCounter}`,
      topic: topicId(raw?.topic),
      front,
      back,
      box: previous?.box ?? 0,
      seenAt: previous?.seenAt ?? 0,
    });
    cardCounter += 1;
  }

  const quiz = [...list(base.quiz)];
  const quizKeys = new Set(quiz.map((entry) => fold(entry.q)));
  let quizCounter = nextCounter(quiz, "q");
  for (const raw of list(input?.quiz).slice(0, call.quiz)) {
    const q = clip(raw?.q, chars.question);
    const opts = list(raw?.opts).map((option) => clip(option, chars.option)).filter(Boolean).slice(0, 4);
    const right = Number(raw?.right);
    if (!q || opts.length < 2 || !Number.isInteger(right) || right < 0 || right >= opts.length) continue;
    if (quizKeys.has(fold(q)) || quiz.length >= total.quiz) continue;
    quizKeys.add(fold(q));
    const previous = old.quiz.find((entry) => fold(entry.q) === fold(q));
    quiz.push({
      id: `q${quizCounter}`,
      topic: topicId(raw?.topic),
      q,
      opts,
      right,
      why: clip(raw?.why, chars.why),
      tries: previous?.tries ?? 0,
      hits: previous?.hits ?? 0,
    });
    quizCounter += 1;
  }

  const sheet = [...list(base.sheet)];
  const sheetKeys = new Set(sheet.map((entry) => fold(entry.title)));
  for (const raw of list(input?.sheet).slice(0, call.sheet)) {
    const title = clip(raw?.title, chars.sheetTitle);
    const text = clip(raw?.text, chars.sheetText);
    if (!title || !text || sheetKeys.has(fold(title)) || sheet.length >= total.sheet) continue;
    sheetKeys.add(fold(title));
    sheet.push({ title, text });
  }

  return { v: 1, at: now, topics, cards, quiz, sheet };
}

// Je Thema die Quoten, die es gibt (0 bis 1): Einstufung, Karten, Fragen.
function topicQuotes(study, topic) {
  const quotes = [];
  if (topic.level != null) quotes.push(topic.level / 3);
  const seen = study.cards.filter((card) => card.topic === topic.id && card.seenAt > 0);
  if (seen.length) quotes.push(mean(seen.map((card) => card.box / 3)));
  const tried = study.quiz.filter((entry) => entry.topic === topic.id && entry.tries > 0);
  if (tried.length) quotes.push(tried.reduce((s, e) => s + e.hits, 0) / tried.reduce((s, e) => s + e.tries, 0));
  return quotes;
}

/** Bereitschaft in Prozent oder null, solange nichts bewertet ist. */
export function readiness(study) {
  if (!study) return null;
  const parts = [];
  const rated = study.topics.filter((topic) => topic.level != null);
  if (rated.length) parts.push([0.4, mean(rated.map((topic) => topic.level / 3))]);
  const seen = study.cards.filter((card) => card.seenAt > 0);
  if (seen.length) parts.push([0.3, mean(seen.map((card) => card.box / 3))]);
  const tried = study.quiz.filter((entry) => entry.tries > 0);
  if (tried.length) {
    parts.push([0.3, tried.reduce((s, e) => s + e.hits, 0) / tried.reduce((s, e) => s + e.tries, 0)]);
  }
  if (parts.length === 0) return null;
  const weight = parts.reduce((sum, [w]) => sum + w, 0);
  return Math.round((parts.reduce((sum, [w, value]) => sum + w * value, 0) / weight) * 100);
}

/** Titel der schwächsten Themen, schlechtestes zuerst. */
export function weakTopics(study, limit = 3) {
  if (!study) return [];
  return study.topics
    .map((topic) => {
      const quotes = topicQuotes(study, topic);
      const weak = (topic.level != null && topic.level <= 1) || quotes.some((quote) => quote < WEAK_QUOTE);
      return { title: topic.title, weak, score: quotes.length ? mean(quotes) : 1 };
    })
    .filter((entry) => entry.weak)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((entry) => entry.title);
}

/** Fällige Karten: ungesehen oder Box 0 zuerst, dann nach Alter. */
export function dueCards(study, today) {
  if (!study) return [];
  const todayNumber = dayNumber(today);
  return study.cards
    .filter((card) => {
      if (!card.seenAt || card.box === 0) return true;
      return todayNumber - dayNumber(isoOf(card.seenAt)) >= BOX_DAYS[Math.min(3, card.box)];
    })
    .sort((a, b) => a.box - b.box || a.seenAt - b.seenAt);
}

const touch = (study, now, patch) => ({ ...study, ...patch, at: now });

export function setLevel(study, topicId, level, now = Date.now()) {
  const value = level == null ? null : Math.min(3, Math.max(0, Math.round(Number(level))));
  return touch(study, now, {
    topics: study.topics.map((topic) => (topic.id === topicId ? { ...topic, level: value } : topic)),
  });
}

export const cycleLevel = (level) => (level == null ? 0 : level >= 3 ? null : level + 1);

export function rateCard(study, cardId, known, now = Date.now()) {
  return touch(study, now, {
    cards: study.cards.map((card) =>
      card.id === cardId ? { ...card, box: known ? Math.min(3, card.box + 1) : 0, seenAt: now } : card,
    ),
  });
}

export function answerQuestion(study, questionId, choice, now = Date.now()) {
  const entry = study.quiz.find((item) => item.id === questionId);
  if (!entry) return { study, correct: null };
  const correct = Number(choice) === entry.right;
  return {
    correct,
    study: touch(study, now, {
      quiz: study.quiz.map((item) =>
        item.id === questionId ? { ...item, tries: item.tries + 1, hits: item.hits + (correct ? 1 : 0) } : item,
      ),
    }),
  };
}

// "62%, schwach: Kettenregel, Produktregel" oder "noch nicht begonnen".
export function studyStatus(study, weakLimit = 2) {
  const percent = readiness(study);
  if (percent === null) return "noch nicht begonnen";
  const weak = weakTopics(study, weakLimit);
  return `${percent}%${weak.length ? `, schwach: ${weak.join(", ")}` : ""}`;
}

// Für die Planer (examPrep, examNeed, buildPlan): eine Zeile, leer ohne Daten.
export function studyHint(study) {
  const percent = readiness(study);
  if (percent === null) return "";
  const weak = weakTopics(study, 3);
  return `Lernstand: ${percent} % bereit${weak.length ? `, schwach: ${weak.join(", ")}` : ""}`;
}

// Für list_tasks bei enger Auswahl: ausführlicher als studyStatus.
export function studyDetail(study) {
  if (!hasStudy(study)) return "";
  const seen = study.cards.filter((card) => card.seenAt > 0);
  const known = seen.filter((card) => card.box >= 2).length;
  const tried = study.quiz.filter((entry) => entry.tries > 0);
  const hits = tried.reduce((sum, entry) => sum + entry.hits, 0);
  const tries = tried.reduce((sum, entry) => sum + entry.tries, 0);
  const rated = study.topics
    .map((topic) => `${topic.title} ${topic.level == null ? "?" : `${topic.level}/3`}`)
    .join(", ");
  return [
    `Dashboard: ${studyStatus(study, 3)}`,
    rated ? `Themen: ${rated}` : "",
    study.cards.length ? `Karten: ${known}/${study.cards.length} sicher` : "",
    study.quiz.length ? `Fragen: ${hits}/${tries} richtig` : "",
  ]
    .filter(Boolean)
    .join(". ");
}
