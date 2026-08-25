export default function TabBar({ activeTab, onTabChange }) {
  return (
    <div className="tab-bar">
      <button
        className={activeTab === "smartCanvas" ? "active" : ""}
        onClick={() => onTabChange("smartCanvas")}
      >
        Smart Canvas
      </button>
      <button
        className={activeTab === "delegation" ? "active" : ""}
        onClick={() => onTabChange("delegation")}
      >
        Delegation
      </button>
    </div>
  );
}
