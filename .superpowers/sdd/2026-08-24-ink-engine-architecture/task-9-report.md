# Task 9 Report: Stable Note IDs and Shared Controller

## Outcome

- Every opened note now receives a stable string ID. Existing numeric IDs are normalized and new notes use `crypto.randomUUID()` with a timestamp fallback.
- `App` passes the note ID to `SplitLayout`.
- `SplitLayout` creates exactly one `useInkDocument({ documentId })` controller and passes the same controller and presentation-only tool state to `DocumentView` and `WritingZone`.
- Raw color and raw tool width remain the sole presentation values. The duplicate highlighter width/color derivation was removed from active SplitLayout state; stroke style derivation remains in `useInkPointer` at stroke creation.
- `DocumentView` and `WritingZone` received only the Task 9 prop/metadata wiring needed to expose the shared controller. Their input/rendering internals remain for Tasks 10 and 11.

## TDD Evidence

1. Added integration coverage for generated IDs, normalized existing IDs, controller defaults, and both-view propagation.
2. RED: `npm test -- tests/App.test.jsx tests/SplitLayout.test.jsx` failed in 3 tests because document/controller attributes were absent.
3. GREEN: the same focused command passed 11/11 tests after the minimal implementation.

## Verification

- Focused: 2 files, 11 tests passed.
- Full suite: 15 files, 107 tests passed.
- Production build: `npm run build` completed successfully (1,787 modules transformed).
- `git diff --check`: clean.

The test runner continues to print the pre-existing jsdom `HTMLCanvasElement.getContext()` warning; it does not fail any test.

## Files Changed

- `src/App.jsx`
- `src/components/SplitLayout.jsx`
- `src/components/DocumentView.jsx` (prop/metadata wiring only)
- `src/components/WritingZone.jsx` (prop/metadata wiring only)
- `tests/App.test.jsx`
- `tests/SplitLayout.test.jsx`

## Review Fix Round 1

- Removed the obsolete `PAPER_RGB` constant and `mixOnPaper` helper/export from `SplitLayout`.
- Removed the stale `mixOnPaper` import and change-detector test. Highlighter style behavior remains covered at its sole source, `getToolStyle`, in `tests/inkDocument.test.js`.
- Strengthened the generated-note integration test to capture the first document ID, rerender the same `App` instance without opening another note, and assert the ID is unchanged.
- Mutation evidence: temporarily moving fallback ID generation into render made the strengthened test fail with two different UUIDs; restoring ID generation to `openNote` returned it to green.
- Review verification: focused suite passed 28/28 tests, full suite passed 106/106 tests, the production build succeeded, `git diff --check` was clean, and `rg` found no remaining `PAPER_RGB` or `mixOnPaper` references in `src` or `tests`.
