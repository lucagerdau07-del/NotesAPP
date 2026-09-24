import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('../src/agent/agentClient.js', () => ({
  requestCompletion: vi.fn(async () => ({ content: '{"homework":[],"exams":[],"terms":[]}' })),
}));

vi.mock('@ybouane/liquidglass', () => ({
  LiquidGlass: { init: vi.fn(() => Promise.resolve({ destroy: vi.fn(), markChanged: vi.fn() })) },
}))

import App from '../src/App';

// A new note is only listed in the library once edited; renaming counts.
function renameOpenNote(name) {
  fireEvent.click(document.querySelector('.editor-title'));
  const input = document.querySelector('.editor-title-input');
  fireEvent.change(input, { target: { value: name } });
  fireEvent.blur(input);
}

describe('App Component', () => {
  it('marks exactly three direct Library controls for WebGL glass', () => {
    render(<App />)
    const root = screen.getByTestId('liquid-glass-root')
    const controls = root.querySelectorAll(':scope > [data-liquid-glass-control]')
    expect([...controls].map(node => node.dataset.liquidGlassControl)).toEqual([
      'navigation', 'search', 'view-sort',
    ])
    expect(screen.getByTestId('new-note-btn')).not.toHaveAttribute('data-liquid-glass-control')
  })

  it('renders the library without crashing', () => {
    render(<App />);
    expect(screen.getByText('Bibliothek')).toBeInTheDocument();
  });

  it('opens the editor from a note and can return to the library', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Neue Notiz'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    expect(screen.getByTestId('document-view')).toBeInTheDocument();
    expect(screen.queryByText('Bibliothek')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Zurück zur Bibliothek'));
    expect(screen.getByText('Bibliothek')).toBeInTheDocument();
  });

  it('switches one shared editor rail between browser and assistant', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('Neue Notiz'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));

    const rail = screen.getByTestId('editor-sidebar');
    fireEvent.click(screen.getByTitle('Browser'));
    expect(rail).toHaveAttribute('data-mode', 'browser');
    // Browser/assistant panels are lazy-loaded on first open.
    expect(await screen.findByTestId('browser-panel')).not.toHaveAttribute('hidden');

    fireEvent.click(screen.getByTitle('KI-Assistent'));
    expect(rail).toHaveAttribute('data-mode', 'agent');
    expect(screen.getByTestId('browser-panel')).toHaveAttribute('hidden');
  });

  it('keeps browser and assistant state while switching modes', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('Neue Notiz'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));

    fireEvent.click(screen.getByTitle('Browser'));
    fireEvent.change(await screen.findByLabelText('Adresse oder Google-Suche'), {
      target: { value: 'photosynthese lernen' },
    });
    fireEvent.click(screen.getByTitle('KI-Assistent'));
    fireEvent.change(await screen.findByLabelText('Nachricht an den KI-Assistenten'), {
      target: { value: 'Merke diesen Entwurf' },
    });
    fireEvent.click(screen.getByTitle('Browser'));

    expect(screen.getByLabelText('Adresse oder Google-Suche')).toHaveValue('photosynthese lernen');
    fireEvent.click(screen.getByTitle('KI-Assistent'));
    expect(screen.getByLabelText('Nachricht an den KI-Assistenten')).toHaveValue('Merke diesen Entwurf');
  });

  it('lets the shared rail be resized by its drag handle and remembers the width', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('Neue Notiz'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    fireEvent.click(screen.getByTitle('Browser'));
    await screen.findByTestId('browser-panel');

    const rail = screen.getByTestId('editor-sidebar');
    fireEvent.pointerDown(screen.getByRole('separator', { name: 'Seitenfenster-Breite ändern' }), {
      pointerId: 1,
      clientX: 520,
    });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 640 });
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 640 });

    expect(rail).toHaveStyle({ width: '632px' });
    expect(globalThis.localStorage.getItem('notes.editor.rail-width')).toBe('632');
  });

  it('passes a stable generated ID to a newly opened note', () => {
    const { rerender } = render(<App />);
    fireEvent.click(screen.getByTestId('new-note-btn'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));

    const documentId = screen.getByTestId('document-view').getAttribute('data-document-id');
    expect(documentId).toBeTruthy();
    expect(documentId).not.toBe('undefined');

    rerender(<App />);
    expect(screen.getByTestId('document-view')).toHaveAttribute('data-document-id', documentId);
  });

  it('does not list a new note that was never edited', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('new-note-btn'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    fireEvent.click(screen.getByTitle('Zurück zur Bibliothek'));
    expect(globalThis.localStorage.getItem('notes.notes.v1') || '').not.toContain('"id"');
  });

  it('reopens an existing note with the same document ID', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('new-note-btn'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    renameOpenNote('Ableitungsregeln');
    const documentId = screen.getByTestId('document-view').getAttribute('data-document-id');

    fireEvent.click(screen.getByTitle('Zurück zur Bibliothek'));
    fireEvent.click(screen.getByText('Ableitungsregeln'));

    expect(screen.getByTestId('document-view')).toHaveAttribute('data-document-id', documentId);
  });

  it('opens the settings screen from the library and navigates through palm settings and advanced view', async () => {
    render(<App />);

    // Click settings button at bottom of sidebar rail
    const settingsBtn = screen.getByTestId('settings-nav-btn');
    fireEvent.click(settingsBtn);

    // Settings screen is lazy-loaded on first open.
    expect(await screen.findByTestId('settings-screen')).toBeInTheDocument();
    expect(screen.getAllByText('Palm-Schutz').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Neu kalibrieren')).toBeInTheDocument();

    // Toggle Auto-Improve switch
    const autoSwitch = screen.getByTestId('auto-improve-switch');
    expect(autoSwitch.classList.contains('on')).toBe(true);
    fireEvent.click(autoSwitch);
    expect(autoSwitch.classList.contains('on')).toBe(false);

    // Open Advanced Settings subpage
    const advBtn = screen.getByTestId('advanced-settings-btn');
    fireEvent.click(advBtn);

    expect(screen.getByText('Erweiterte Einstellungen')).toBeInTheDocument();
    expect(screen.getByTestId('slider-detection-strength')).toBeInTheDocument();

    // Test slider change
    const slider = screen.getByTestId('slider-detection-strength');
    fireEvent.change(slider, { target: { value: '75' } });
    expect(slider.value).toBe('75');

    // Return back to Library with Fertig button
    fireEvent.click(screen.getByText('Fertig'));
    expect(screen.getByText('Bibliothek')).toBeInTheDocument();
  });

  it('opens the plan screen from the library and returns', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('open-plan-btn'));
    // Plan screen is lazy-loaded on first open.
    expect(await screen.findByTestId('plan-screen')).toBeInTheDocument();
    expect(screen.queryByText('Bibliothek')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zurück zur Bibliothek' }));
    expect(screen.getByText('Bibliothek')).toBeInTheDocument();
  });

  it('switches between masonry grid and list view and handles sorting', () => {
    render(<App />);

    // Initially in masonry grid mode
    expect(screen.getByTestId('masonry-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('list-view')).not.toBeInTheDocument();

    // Switch to list view
    const listBtn = screen.getByTestId('view-list-btn');
    fireEvent.click(listBtn);
    expect(screen.getByTestId('list-view')).toBeInTheDocument();
    expect(screen.queryByTestId('masonry-grid')).not.toBeInTheDocument();

    // Switch back to masonry grid view
    const masonryBtn = screen.getByTestId('view-masonry-btn');
    fireEvent.click(masonryBtn);
    expect(screen.getByTestId('masonry-grid')).toBeInTheDocument();

    // Trigger sort
    const sortBtn = screen.getByTestId('view-sort-btn');
    fireEvent.click(sortBtn);
    expect(screen.getByTestId('sort-toast')).toBeInTheDocument();
    expect(screen.getByText('Sortierung: Titel (A–Z)')).toBeInTheDocument();
  });

  it('filters notes when selecting a subject', () => {
    render(<App />);

    // Create a Mathe note
    fireEvent.click(screen.getByTestId('subject-tile-mathe'));
    fireEvent.click(screen.getByTestId('new-note-btn'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    renameOpenNote('Ableitungsregeln');
    fireEvent.click(screen.getByTitle('Zurück zur Bibliothek'));

    // Create a Chemie note
    fireEvent.click(screen.getByTestId('subject-tile-chemie'));
    fireEvent.click(screen.getByTestId('new-note-btn'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    renameOpenNote('Titrationskurve');
    fireEvent.click(screen.getByTitle('Zurück zur Bibliothek'));

    // Click Mathe subject tile - only the Mathe note should be shown
    fireEvent.click(screen.getByTestId('subject-tile-mathe'));
    expect(screen.getByText('Ableitungsregeln')).toBeInTheDocument();
    expect(screen.queryByText('Titrationskurve')).not.toBeInTheDocument();

    // Reset via the folder back button
    fireEvent.click(screen.getByTitle('Zurück zur Übersicht'));
    expect(screen.getByText('Titrationskurve')).toBeInTheDocument();
  });

  it('opens up to three documents side by side in split view and enforces the limit', async () => {
    render(<App />);

    // Two notes created and persisted ahead of time so the split picker has
    // something to offer once we're inside the workspace (going back to the
    // library would close the whole workspace, so this has to happen first).
    fireEvent.click(screen.getByText('Neue Notiz'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    renameOpenNote('Notiz A');
    fireEvent.click(screen.getByTitle('Zurück zur Bibliothek'));

    fireEvent.click(screen.getByText('Neue Notiz'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    renameOpenNote('Notiz C');
    fireEvent.click(screen.getByTitle('Zurück zur Bibliothek'));

    fireEvent.click(screen.getByText('Neue Notiz'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    renameOpenNote('Notiz B');

    // A single pane has no close button, only the option to split.
    expect(screen.queryByTestId('split-close-pane-btn')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-pane-count', '1');

    fireEvent.click(screen.getByTestId('split-add-btn'));
    fireEvent.click(await screen.findByText('Notiz A'));

    expect(screen.getByTestId('workspace')).toHaveAttribute('data-pane-count', '2');
    expect(screen.getAllByTestId('document-view')).toHaveLength(2);
    expect(screen.getAllByTestId('split-close-pane-btn')).toHaveLength(2);
    // Only the newly added (now focused) pane shows a tool rail - the other
    // pane's rail, colors and side panels stay hidden instead of being
    // duplicated.
    expect(
      screen.getAllByTestId('editor-sidebar').filter((el) => el.dataset.railVisible === 'true'),
    ).toHaveLength(1);

    fireEvent.click(screen.getAllByTestId('split-add-btn')[0]);
    fireEvent.click(await screen.findByText('Notiz C'));

    expect(screen.getByTestId('workspace')).toHaveAttribute('data-pane-count', '3');
    expect(screen.getAllByTestId('document-view')).toHaveLength(3);
    // A fourth document can't be added - the limit is three panes.
    for (const btn of screen.getAllByTestId('split-add-btn')) expect(btn).toBeDisabled();
    expect(
      screen.getAllByTestId('editor-sidebar').filter((el) => el.dataset.railVisible === 'true'),
    ).toHaveLength(1);

    fireEvent.click(screen.getAllByTestId('split-close-pane-btn')[0]);
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-pane-count', '2');

    fireEvent.click(screen.getAllByTestId('split-close-pane-btn')[0]);
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-pane-count', '1');
    expect(screen.queryByTestId('split-close-pane-btn')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Zurück zur Bibliothek'));
    expect(screen.getByText('Bibliothek')).toBeInTheDocument();
  });

  it('moves the single tool rail to whichever pane is clicked into', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('Neue Notiz'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    renameOpenNote('Notiz A');
    fireEvent.click(screen.getByTitle('Zurück zur Bibliothek'));

    fireEvent.click(screen.getByText('Neue Notiz'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    renameOpenNote('Notiz B');

    fireEvent.click(screen.getByTestId('split-add-btn'));
    fireEvent.click(await screen.findByText('Notiz A'));

    const panes = screen.getAllByTestId(/^workspace-pane-/);
    expect(panes).toHaveLength(2);
    const sidebars = () => screen.getAllByTestId('editor-sidebar');

    // Notiz A was just added, so its pane is focused and shows the rail.
    expect(sidebars()[0]).toHaveAttribute('data-rail-visible', 'false');
    expect(sidebars()[1]).toHaveAttribute('data-rail-visible', 'true');

    // Clicking into the first pane (Notiz B) moves the rail there instead.
    fireEvent.pointerDown(panes[0]);
    expect(sidebars()[0]).toHaveAttribute('data-rail-visible', 'true');
    expect(sidebars()[1]).toHaveAttribute('data-rail-visible', 'false');
  });

  it('does not offer an already-open document as a split-screen option', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('Neue Notiz'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    renameOpenNote('Notiz B');

    fireEvent.click(screen.getByTestId('split-add-btn'));
    const picker = await screen.findByTestId('split-picker');
    // Notiz B is already open in the only pane, so it must not be offered
    // again - the picker only excludes it if the workspace tells it what's
    // already open.
    expect(within(picker).queryByText('Notiz B')).not.toBeInTheDocument();
  });
});
