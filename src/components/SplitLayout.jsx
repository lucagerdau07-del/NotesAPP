import DocumentView from './DocumentView';
import WritingZone from './WritingZone';
import useCanvas from '../hooks/useCanvas';
import useMasterCanvas from '../hooks/useMasterCanvas';
import useFocusBox from '../hooks/useFocusBox';

export default function SplitLayout({ activeTab }) {
  const masterCanvasState = useMasterCanvas();
  const focusBoxState = useFocusBox();
  const canvasState = useCanvas(masterCanvasState, focusBoxState);

  if (activeTab === 'smartCanvas') {
    return (
      <div className="split-layout">
        <DocumentView canvasState={canvasState} masterCanvasState={masterCanvasState} focusBoxState={focusBoxState} />
        <WritingZone canvasState={canvasState} masterCanvasState={masterCanvasState} focusBoxState={focusBoxState} />
      </div>
    );
  }
  return <div>Delegation Mode (TBD)</div>;
}
