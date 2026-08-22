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
});
