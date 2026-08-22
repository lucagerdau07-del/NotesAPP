import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import App from '../src/App';

describe('App Component', () => {
  it('renders the library without crashing', () => {
    render(<App />);
    expect(screen.getByText('Bibliothek')).toBeInTheDocument();
  });

  it('opens the editor from a note and can return to the library', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Neue Notiz'));
    expect(screen.getByTestId('document-view')).toBeInTheDocument();
    expect(screen.queryByText('Bibliothek')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Zurück zur Bibliothek'));
    expect(screen.getByText('Bibliothek')).toBeInTheDocument();
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

  it('filters notes and displays thematic banner when selecting a subject', () => {
    render(<App />);

    // Click Mathe subject tile
    const matheTile = screen.getByTestId('subject-tile-mathe');
    fireEvent.click(matheTile);

    // Thematic banner appears
    expect(screen.getByTestId('thematic-banner-mathe')).toBeInTheDocument();
    expect(screen.getByText('Mathematik & Analysis')).toBeInTheDocument();

    // Only Mathe notes should be shown
    expect(screen.getByText('Ableitungsregeln')).toBeInTheDocument();
    expect(screen.getByText('Integralrechnung & Stammfunktionen')).toBeInTheDocument();
    expect(screen.queryByText('Titrationskurve & Tafelbild')).not.toBeInTheDocument();

    // Click "Alle Fächer" to reset
    fireEvent.click(screen.getByTitle('Alle Fächer anzeigen'));
    expect(screen.queryByTestId('thematic-banner-mathe')).not.toBeInTheDocument();
    expect(screen.getByText('Titrationskurve & Tafelbild')).toBeInTheDocument();
  });
});
