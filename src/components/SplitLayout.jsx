import DocumentView from './DocumentView';
import WritingZone from './WritingZone';

export default function SplitLayout({ activeTab }) {
  if (activeTab === 'smartCanvas') {
    return (
      <div className="split-layout">
        <DocumentView />
        <WritingZone />
      </div>
    );
  }
  return <div>Delegation Mode (TBD)</div>;
}
