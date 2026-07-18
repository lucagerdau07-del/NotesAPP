import DocumentView from './DocumentView';
import WritingZone from './WritingZone';
import useMasterCanvas from '../hooks/useMasterCanvas';
import useFocusBox from '../hooks/useFocusBox';

export default function SplitLayout({ activeTab }) {
  const masterCanvasState = useMasterCanvas();
  const focusBoxState = useFocusBox();

  if (activeTab === 'smartCanvas') {
    return (
      <div className="split-layout">
        <DocumentView masterCanvasState={masterCanvasState} focusBoxState={focusBoxState} />
        <WritingZone masterCanvasState={masterCanvasState} focusBoxState={focusBoxState} />
      </div>
    );
  }
  return <div>Delegation Mode (TBD)</div>;
}
