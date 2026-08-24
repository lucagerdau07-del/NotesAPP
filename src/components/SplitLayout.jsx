import { useState, useRef } from 'react';
import DocumentView from './DocumentView';
import WritingZone from './WritingZone';
import useInkDocument from '../hooks/useInkDocument';
import useFocusBox from '../hooks/useFocusBox';

export default function SplitLayout({ activeTab, onBack, documentId }) {
  const [color, setColor] = useState('#EFECE4');
  const [isEraser, setIsEraser] = useState(false);
  const [lineWidth, setLineWidth] = useState(3);
  const [eraserWidth, setEraserWidth] = useState(15);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [paperStyle, setPaperStyle] = useState('lined');
  const [showPageBreaks, setShowPageBreaks] = useState(true);
  const [layoutMode, setLayoutMode] = useState('full'); // 'full' | 'split'
  const [tool, setTool] = useState('pen'); // 'pen' | 'highlighter' | 'fountain' | 'pencil'

  const toolState = {
    color, setColor,
    rawColor: color,
    tool, setTool,
    isEraser, setIsEraser,
    lineWidth,
    rawLineWidth: lineWidth,
    setLineWidth,
    eraserWidth, setEraserWidth,
    isSelectMode, setIsSelectMode,
    paperStyle, setPaperStyle,
    showPageBreaks, setShowPageBreaks,
    layoutMode, setLayoutMode
  };

  const inkController = useInkDocument({ documentId });
  const focusBoxState = useFocusBox();
  const padActionsRef = useRef(null);

  if (activeTab === 'smartCanvas') {
    return (
      <div className={`split-layout ${layoutMode === 'split' ? '' : 'full-mode'}`}>
        <DocumentView inkController={inkController} toolState={toolState} focusBoxState={focusBoxState} toolbarState={toolState} padActionsRef={padActionsRef} onBack={onBack} />
        {layoutMode === 'split' && (
          <WritingZone inkController={inkController} toolState={toolState} focusBoxState={focusBoxState} toolbarState={toolState} padActionsRef={padActionsRef} />
        )}
      </div>
    );
  }
  return <div>Delegation Mode (TBD)</div>;
}
