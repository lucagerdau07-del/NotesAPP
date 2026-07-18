import React, { useState } from 'react';
import './styles/main.css';
import SplitLayout from './components/SplitLayout';
import TabBar from './components/TabBar';

export default function App() {
  const [activeTab, setActiveTab] = useState('smartCanvas');

  return (
    <div>
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <SplitLayout activeTab={activeTab} />
    </div>
  );
}
