# Task 7 — Minutenbudget je Tag

## Umsetzung

- `studyPlan.js` exportiert die vorgegebenen Zeitkonstanten, die lokale Datumsformatierung und die reine Budgetberechnung.
- Schultage erhalten 70 Minuten Sockel, Wochenenden bleiben ohne Bedarf bei null und Mittwoch bleibt ausnahmslos null.
- Offene Hausaufgaben werden bis zum Fälligkeitsdatum verteilt; überfällige Aufgaben fallen auf heute.
- Klausuren werden auf höchstens zehn Lerntage vor dem Termin verteilt, nie auf den Klausurtag selbst.
- Alle Werte sind auf 120 Minuten gedeckelt; Tagesfortschritte verwenden ausschließlich `setDate`.

## RED

`npx vitest run tests/studyPlan.test.js` vor der Implementierung:

```text
Test Files  1 failed (1)
Tests  no tests
Error: Failed to resolve import "../src/knowledge/studyPlan.js"
```

## GREEN

`npx vitest run tests/studyPlan.test.js` nach der Implementierung:

```text
Test Files  1 passed (1)
Tests  13 passed (13)
```

## Gesamtsuite

`npm test -- --run`:

```text
Test Files  55 passed (55)
Tests  448 passed (448)
```

## Selbst-Review

Keine offenen Befunde. Die ungetrackte `.npm-cache/` wurde nicht verändert oder committed.
