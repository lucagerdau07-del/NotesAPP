import React, { useState } from "react";
import { X } from "lucide-react";
import { FOLDER_ICONS, FOLDER_ICON_KEYS, FOLDER_COLORS } from "./folderIcons.js";

export default function FolderDialog({ mode = "create", initial, onSubmit, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [color, setColor] = useState(initial?.color || FOLDER_COLORS[0]);
  const [icon, setIcon] = useState(initial?.icon || FOLDER_ICON_KEYS[0]);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit?.({ name: name.trim(), color, icon });
  };

  return (
    <div
      data-testid="folder-dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 380,
          maxWidth: "90vw",
          borderRadius: 20,
          background: "#18181C",
          color: "#FFFFFF",
          padding: 24,
          boxShadow: "0 40px 90px -20px rgba(0,0,0,.8)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ font: '700 18px "Bricolage Grotesque",sans-serif' }}>
            {mode === "rename" ? "Ordner bearbeiten" : "Neuer Ordner"}
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#FFFFFF", cursor: "pointer" }}
          >
            <X size={18} />
          </button>
        </div>

        <input
          data-testid="folder-dialog-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ordnername"
          autoFocus
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.15)",
            background: "rgba(255,255,255,.06)",
            color: "#FFFFFF",
            font: "500 14px sans-serif",
          }}
        />

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>Farbe</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {FOLDER_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                title={c}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: c,
                  border: color === c ? "2px solid #FFFFFF" : "1px solid rgba(255,255,255,.25)",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>Icon</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {FOLDER_ICON_KEYS.map((key) => {
              const Icon = FOLDER_ICONS[key];
              return (
                <button
                  key={key}
                  onClick={() => setIcon(key)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: icon === key ? "2px solid #3E7BD8" : "1px solid rgba(255,255,255,.15)",
                    background: icon === key ? "rgba(62,123,216,.15)" : "transparent",
                    color: "#FFFFFF",
                    cursor: "pointer",
                  }}
                >
                  <Icon size={17} />
                </button>
              );
            })}
          </div>
        </div>

        <button
          data-testid="folder-dialog-submit"
          onClick={submit}
          style={{
            width: "100%",
            padding: "12px 0",
            borderRadius: 12,
            border: "none",
            background: "#FFFFFF",
            color: "#08080A",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {mode === "rename" ? "Speichern" : "Erstellen"}
        </button>
      </div>
    </div>
  );
}
