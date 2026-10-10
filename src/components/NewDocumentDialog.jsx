import React, { useState } from "react";
import { X } from "lucide-react";
import {
  PAGE_FORMATS,
  BACKGROUND_PRESETS,
  RULING_PRESETS,
} from "../documents/pageStyles.js";

const RULING_LABELS = { blank: "Blanko", lined: "Liniert", grid: "Kariert", dotted: "Punktraster" };
const FORMAT_LABELS = {
  "a4-portrait": "A4 Hochformat",
  "a4-landscape": "A4 Querformat",
  square: "Quadratisch",
};

export default function NewDocumentDialog({ open, subject = "", onCreate, onClose }) {
  const [pageKind, setPageKind] = useState("page");
  const [format, setFormat] = useState("a4-portrait");
  const [background, setBackground] = useState("dark");
  const [ruling, setRuling] = useState("lined");
  const [title, setTitle] = useState("");

  if (!open) return null;

  const defaultTitle = subject ? `Neue ${subject}-Notiz` : "Neue Notiz";

  const submit = () => {
    onCreate?.({
      title: title.trim() || defaultTitle,
      subject: subject || "",
      pageKind,
      format,
      background,
      ruling,
    });
  };

  const optionButtonStyle = (active) => ({
    flex: 1,
    padding: "8px 6px",
    borderRadius: 10,
    fontSize: 12,
    border: active ? "2px solid #3E7BD8" : "1px solid rgba(255,255,255,.15)",
    background: active ? "rgba(62,123,216,.15)" : "transparent",
    color: "#FFFFFF",
    cursor: "pointer",
  });

  return (
    <div
      data-testid="new-document-dialog"
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
          width: 440,
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
          <span style={{ font: '700 18px "Bricolage Grotesque",sans-serif' }}>Neues Dokument</span>
          <button
            data-testid="new-doc-cancel"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#FFFFFF", cursor: "pointer" }}
          >
            <X size={18} />
          </button>
        </div>

        <input
          data-testid="new-doc-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={defaultTitle}
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
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>Seitentyp</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["page", "whiteboard"].map((kind) => (
              <button
                key={kind}
                data-testid={`new-doc-kind-${kind}`}
                onClick={() => setPageKind(kind)}
                style={optionButtonStyle(pageKind === kind)}
              >
                {kind === "page" ? "Normal" : "Whiteboard"}
              </button>
            ))}
          </div>
        </div>

        {pageKind === "page" && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>Format</div>
              <div style={{ display: "flex", gap: 8 }}>
                {Object.keys(PAGE_FORMATS).map((id) => (
                  <button
                    key={id}
                    data-testid={`new-doc-format-${id}`}
                    onClick={() => setFormat(id)}
                    style={optionButtonStyle(format === id)}
                  >
                    {FORMAT_LABELS[id]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>Hintergrundfarbe</div>
          <div style={{ display: "flex", gap: 8 }}>
            {BACKGROUND_PRESETS.map((preset) => (
              <button
                key={preset.id}
                data-testid={`new-doc-background-${preset.id}`}
                onClick={() => setBackground(preset.id)}
                title={preset.label}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: preset.css,
                  border:
                    background === preset.id
                      ? "2px solid #3E7BD8"
                      : "1px solid rgba(255,255,255,.25)",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>

        {pageKind === "page" && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>Linierung</div>
              <div style={{ display: "flex", gap: 8 }}>
                {RULING_PRESETS.map((id) => (
                  <button
                    key={id}
                    data-testid={`new-doc-ruling-${id}`}
                    onClick={() => setRuling(id)}
                    style={optionButtonStyle(ruling === id)}
                  >
                    {RULING_LABELS[id]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <button
          data-testid="new-doc-submit"
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
          Erstellen
        </button>
      </div>
    </div>
  );
}
