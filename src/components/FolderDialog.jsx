import React, { useState } from "react";
import { X, ImagePlus } from "lucide-react";
import { FOLDER_ICONS, FOLDER_ICON_KEYS, FOLDER_COLORS } from "./folderIcons.js";

// Downscale to a small square so the data URL stays cheap in localStorage.
function fileToThumb(file, size = 512) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

// manualCard / autoCard: the agent-facing description (knowledge/cardRepository.js).
// The generated one is only a placeholder, so it shows what the agent sees
// without becoming the user's own text.
export default function FolderDialog({ mode = "create", initial, manualCard = "", autoCard = "", onSubmit, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [color, setColor] = useState(initial?.color || FOLDER_COLORS[0]);
  const [icon, setIcon] = useState(initial?.icon || FOLDER_ICON_KEYS[0]);

  const [image, setImage] = useState(initial?.image || null);
  const [description, setDescription] = useState(manualCard);

  const pickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setImage(await fileToThumb(file).catch(() => null));
  };

  const submit = () => {
    if (!name.trim()) return;
    onSubmit?.({ name: name.trim(), color, icon, image, description: description.trim() });
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
                  onClick={() => {
                    setIcon(key);
                    setImage(null);
                  }}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: !image && icon === key ? "2px solid #3E7BD8" : "1px solid rgba(255,255,255,.15)",
                    background: !image && icon === key ? "rgba(62,123,216,.15)" : "transparent",
                    color: "#FFFFFF",
                    cursor: "pointer",
                  }}
                >
                  <Icon size={17} />
                </button>
              );
            })}
            <label
              data-testid="folder-dialog-image"
              title="Eigenes Bild"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                border: image ? "2px solid #3E7BD8" : "1px dashed rgba(255,255,255,.35)",
                cursor: "pointer",
              }}
            >
              {image ? (
                <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <ImagePlus size={17} />
              )}
              <input type="file" accept="image/*" onChange={pickImage} style={{ display: "none" }} />
            </label>
            {image && (
              <button
                onClick={() => setImage(null)}
                title="Bild entfernen"
                style={{ background: "none", border: "none", color: "#FFFFFF", opacity: 0.6, cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>Beschreibung für den Assistenten</div>
          <textarea
            data-testid="folder-dialog-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={autoCard || "Wird automatisch aus den Notizen erstellt"}
            rows={3}
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "none",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.15)",
              background: "rgba(255,255,255,.06)",
              color: "#FFFFFF",
              font: "500 13px sans-serif",
            }}
          />
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
