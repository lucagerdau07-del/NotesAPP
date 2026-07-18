import { useState, useRef } from 'react';
import DocumentView from './DocumentView';
import WritingZone from './WritingZone';
import useMasterCanvas from '../hooks/useMasterCanvas';
import useFocusBox from '../hooks/useFocusBox';

export default function SplitLayout({ activeTab }) {
  const [color, setColor] = useState('#2C2825');
  const [isEraser, setIsEraser] = useState(false);
  const [lineWidth, setLineWidth] = useState(3);
  const [eraserWidth, setEraserWidth] = useState(15);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isCollegeBlock, setIsCollegeBlock] = useState(false);

  const toolbarState = {
    color, setColor,
    isEraser, setIsEraser,
    lineWidth, setLineWidth,
    eraserWidth, setEraserWidth,
    isSelectMode, setIsSelectMode,
    isCollegeBlock, setIsCollegeBlock
  };

  const masterCanvasState = useMasterCanvas();
  const focusBoxState = useFocusBox();
  const padActionsRef = useRef(null);

  if (activeTab === 'smartCanvas') {
    return (
      <div className="split-layout">
        <DocumentView masterCanvasState={masterCanvasState} focusBoxState={focusBoxState} toolbarState={toolbarState} padActionsRef={padActionsRef} />
        <WritingZone masterCanvasState={masterCanvasState} focusBoxState={focusBoxState} toolbarState={toolbarState} padActionsRef={padActionsRef} />
      </div>
    );
  }
  return <div>Delegation Mode (TBD)</div>;
}
