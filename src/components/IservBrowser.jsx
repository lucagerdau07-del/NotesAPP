import React, { useEffect, useState } from "react";
import {
  chooseIservFolder,
  isImportable,
  listIserv,
  readIservFile,
} from "../documents/iservFiles";

const START_KEY = "notes.iservStartTrail";
const loadStart = () => {
  try {
    const trail = JSON.parse(localStorage.getItem(START_KEY));
    return Array.isArray(trail) && trail.length ? trail : null;
  } catch {
    return null;
  }
};
const saveStart = (trail) => {
  try {
    if (trail?.length) localStorage.setItem(START_KEY, JSON.stringify(trail));
    else localStorage.removeItem(START_KEY);
  } catch {
    // storage unavailable: the start folder just isn't remembered
  }
};

// Folder browser over the IServ provider. Starts in the remembered folder
// (Gruppen); files are read only when "Importieren" is pressed.
export default function IservBrowser({ onImport, onClose }) {
  const [trail, setTrail] = useState([]); // [{id, name}] below the root
  const [start, setStart] = useState(loadStart); // remembered start folder (same shape) or null
  const [items, setItems] = useState([]);
  const [picked, setPicked] = useState({}); // id -> item
  const [status, setStatus] = useState("loading"); // loading | ready | no-folder | error | importing

  const load = async (docId) => {
    setStatus("loading");
    try {
      const result = await listIserv(docId);
      setItems(
        [...result.items].sort((a, b) => b.isDir - a.isDir || a.name.localeCompare(b.name, "de")),
      );
      setStatus("ready");
    } catch (error) {
      setStatus(error?.message === "no-folder" ? "no-folder" : "error");
    }
  };

  useEffect(() => {
    if (!start) return void load();
    // the remembered subfolder may be gone or belong to an old root: fall back to the root
    listIserv(start.at(-1).id).then(
      (result) => {
        setTrail(start);
        setItems(result.items.sort((a, b) => b.isDir - a.isDir || a.name.localeCompare(b.name, "de")));
        setStatus("ready");
      },
      () => {
        saveStart(null);
        setStart(null);
        load();
      },
    );
  }, []);

  const open = (item) => {
    setTrail([...trail, item]);
    load(item.id);
  };
  const up = () => {
    const next = trail.slice(0, -1);
    setTrail(next);
    load(next.at(-1)?.id);
  };
  const choose = async () => {
    await chooseIservFolder(); // cancelling keeps the old folder
    saveStart(null);
    setStart(null);
    setTrail([]);
    load();
  };
  const remember = (next) => {
    saveStart(next);
    setStart(next);
  };
  const run = async () => {
    setStatus("importing");
    try {
      const files = await Promise.all(Object.values(picked).map((item) => readIservFile(item.id)));
      await onImport(files);
      onClose();
    } catch (error) {
      console.error("IServ-Import fehlgeschlagen", error);
      setStatus("error");
    }
  };

  const count = Object.keys(picked).length;
  const button = { padding: "8px 14px", borderRadius: 14, color: "#fff", cursor: "pointer" };
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center" }}
      onClick={onClose}
    >
      <div
        className="lib-glass"
        onClick={(event) => event.stopPropagation()}
        style={{ width: "min(560px, 92vw)", maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 10, padding: 18, borderRadius: 28, color: "#fff" }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {trail.length > 0 && (
            <button type="button" className="lib-file-open" style={button} onClick={up}>←</button>
          )}
          <strong style={{ flex: 1, font: '700 15px "Bricolage Grotesque",sans-serif' }}>
            IServ {trail.map((t) => `/ ${t.name}`).join(" ")}
          </strong>
          <button type="button" className="lib-file-open" style={button} onClick={choose}>Ordner ändern</button>
        </div>
        {(trail.length > 0 || start) && status === "ready" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {trail.length > 0 && JSON.stringify(trail) !== JSON.stringify(start) && (
              <button type="button" className="lib-file-open" style={button} onClick={() => remember(trail)}>
                Als Startordner merken
              </button>
            )}
            {start && (
              <button type="button" className="lib-file-open" style={button} onClick={() => remember(null)}>
                Startordner zurücksetzen
              </button>
            )}
          </div>
        )}
        <div style={{ overflowY: "auto", flex: 1, minHeight: 120 }}>
          {status === "loading" && <p>Lade…</p>}
          {status === "importing" && <p>Wird importiert…</p>}
          {status === "error" && <p>IServ ließ sich nicht lesen.</p>}
          {status === "no-folder" && (
            <button type="button" className="lib-file-open" style={button} onClick={choose}>
              IServ-Ordner wählen (z. B. „Gruppen“)
            </button>
          )}
          {status === "ready" && items.length === 0 && <p>Leer.</p>}
          {status === "ready" &&
            items.map((item) =>
              item.isDir ? (
                <div key={item.id} onClick={() => open(item)} style={{ padding: "10px 4px", cursor: "pointer" }}>
                  📁 {item.name}
                </div>
              ) : (
                <label
                  key={item.id}
                  style={{ display: "flex", gap: 8, padding: "10px 4px", opacity: isImportable(item) ? 1 : 0.4 }}
                >
                  <input
                    type="checkbox"
                    disabled={!isImportable(item)}
                    checked={Boolean(picked[item.id])}
                    onChange={() => {
                      const next = { ...picked };
                      if (next[item.id]) delete next[item.id];
                      else next[item.id] = item;
                      setPicked(next);
                    }}
                  />
                  {item.name}
                </label>
              ),
            )}
        </div>
        <button type="button" className="lib-file-open" style={button} disabled={!count || status !== "ready"} onClick={run}>
          {count ? `${count} Datei${count > 1 ? "en" : ""} importieren` : "Dateien wählen"}
        </button>
      </div>
    </div>
  );
}
