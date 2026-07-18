import DocumentView from './DocumentView';
import WritingZone from './WritingZone';
import useCanvas from '../hooks/useCanvas';

export default function SplitLayout({ activeTab }) {
  const canvasState = useCanvas();

  if (activeTab === 'smartCanvas') {
    return (
      <div className="split-layout">
        <DocumentView canvasState={canvasState} />
        <WritingZone canvasState={canvasState} />
      </div>
    );
  }
  return <div>Delegation Mode (TBD)</div>;
}
