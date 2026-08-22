import React, { useState } from 'react';
import { Sparkles, Share, MoreHorizontal } from 'lucide-react';
import './styles/main.css';
import SplitLayout from './components/SplitLayout';
import Library from './components/Library';
import Settings from './components/Settings';

export default function App() {
  const [screen, setScreen] = useState('library');
  const [activeNote, setActiveNote] = useState(null);
  const activeTab = 'smartCanvas';

  const openNote = (note) => {
    setActiveNote(note);
    setScreen('editor');
  };

  if (screen === 'settings') {
    return <Settings onBack={() => setScreen('library')} />;
  }

  if (screen === 'library') {
    return <Library onOpenNote={openNote} onOpenSettings={() => setScreen('settings')} />;
  }

  return (
    <div className="editor-shell">
      <div className="liquid-fluted-bg" />
      <div className="editor-title-pill">
        <span className="editor-title">{activeNote?.title || 'Neue Notiz'}</span>
        {activeNote?.subject && (
          <>
            <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,.14)' }} />
            <span className="editor-subject">{activeNote.subject} · Seite 1</span>
          </>
        )}
      </div>
      <div className="editor-actions-pill">
        <button className="editor-ai-btn" title="Erklären (KI)">
          <Sparkles size={14} />
        </button>
        <button className="rail-btn" title="Teilen">
          <Share size={16} />
        </button>
        <button className="rail-btn" title="Mehr">
          <MoreHorizontal size={16} />
        </button>
      </div>
      <div className="editor-body">
        <SplitLayout activeTab={activeTab} onBack={() => setScreen('library')} />
      </div>
    </div>
  );
}
