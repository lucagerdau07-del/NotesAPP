import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('@ybouane/liquidglass', () => ({
  LiquidGlass: { init: vi.fn(() => Promise.resolve({ destroy: vi.fn(), markChanged: vi.fn() })) },
}))

import App from '../src/App';

describe('App Component', () => {
  it('marks exactly five direct Library controls for WebGL glass', () => {
    render(<App />)
    const root = screen.getByTestId('liquid-glass-root')
    const controls = root.querySelectorAll(':scope > [data-liquid-glass-control]')
    expect([...controls].map(node => node.dataset.liquidGlassControl)).toEqual([
      'navigation', 'search', 'reset', 'view-sort', 'agent',
    ])
    expect(screen.getByTestId('new-note-btn')).not.toHaveAttribute('data-liquid-glass-control')
  })

  it('keeps the agent trigger mounted while the agent panel is open', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('agent-open-btn'))

    expect(screen.getByTestId('agent-panel')).toHaveAttribute('data-open', 'true')
    expect(screen.getByTestId('agent-open-btn')).toHaveAttribute('aria-hidden', 'true')
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

  it('switches one shared editor rail between browser and assistant', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Neue Notiz'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));

    const rail = screen.getByTestId('editor-sidebar');
    fireEvent.click(screen.getByTitle('Browser'));
    expect(rail).toHaveAttribute('data-mode', 'browser');
    expect(screen.getByTestId('browser-panel')).not.toHaveAttribute('hidden');

    fireEvent.click(screen.getByTitle('KI-Assistent'));
    expect(rail).toHaveAttribute('data-mode', 'agent');
    expect(screen.getByTestId('browser-panel')).toHaveAttribute('hidden');
  });

  it('keeps browser and assistant state while switching modes', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Neue Notiz'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));

    fireEvent.click(screen.getByTitle('Browser'));
    fireEvent.change(screen.getByLabelText('Adresse oder Google-Suche'), {
      target: { value: 'photosynthese lernen' },
    });
    fireEvent.click(screen.getByTitle('KI-Assistent'));
    fireEvent.change(screen.getByLabelText('Nachricht an den KI-Assistenten'), {
      target: { value: 'Merke diesen Entwurf' },
    });
    fireEvent.click(screen.getByTitle('Browser'));

    expect(screen.getByLabelText('Adresse oder Google-Suche')).toHaveValue('photosynthese lernen');
    fireEvent.click(screen.getByTitle('KI-Assistent'));
    expect(screen.getByLabelText('Nachricht an den KI-Assistenten')).toHaveValue('Merke diesen Entwurf');
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

  it('normalizes an existing note ID to a string', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Ableitungsregeln'));

    expect(screen.getByTestId('document-view')).toHaveAttribute('data-document-id', '1');
  });

  it('opens the settings screen from the library and navigates through palm settings and advanced view', () => {
    render(<App />);

    // Click settings button at bottom of sidebar rail
    const settingsBtn = screen.getByTestId('settings-nav-btn');
    fireEvent.click(settingsBtn);

    expect(screen.getByTestId('settings-screen')).toBeInTheDocument();
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

    // Click Mathe subject tile
    const matheTile = screen.getByTestId('subject-tile-mathe');
    fireEvent.click(matheTile);

    // Only Mathe notes should be shown
    expect(screen.getByText('Ableitungsregeln')).toBeInTheDocument();
    expect(screen.getByText('Integralrechnung & Stammfunktionen')).toBeInTheDocument();
    expect(screen.queryByText('Titrationskurve & Tafelbild')).not.toBeInTheDocument();

    // Reset via the close pod
    fireEvent.click(screen.getByTitle('Schließen / Filter leeren'));
    expect(screen.getByText('Titrationskurve & Tafelbild')).toBeInTheDocument();
  });
});
