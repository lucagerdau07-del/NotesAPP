import React, { useState, useRef, useEffect } from "react";
import {
  ChevronLeft,
  Plus,
  PenLine,
  Folder,
  Wifi,
  RotateCcw,
  X,
  ShieldCheck,
  Check,
} from "lucide-react";
import useLiquidGlass from "../hooks/useLiquidGlass";
import {
  loadPalmProfile,
  palmGuardFromProfile,
  PALM_PROFILE_DEFAULTS,
  savePalmProfile,
} from "../ink/palmSettings.js";
import {
  loadUntisCredentials,
  saveUntisCredentials,
} from "../ink/untisSettings.js";
import { loadAgentConfig, saveAgentConfig } from "../agent/agentSettings.js";
import { createInputState, reducePointerInput } from "../ink/inputPolicy.js";

/* The settings top bar is a floating control bar, same family as the Library's
   pills — the content boxes below it stay CSS glass. */
const TOPBAR_GLASS_CONFIG = { cornerRadius: 24, zRadius: 22 };
const SIDEBAR_GLASS_CONFIG = { cornerRadius: 22, zRadius: 22 };

export default function Settings({ onBack }) {
  const glassRootRef = useRef(null);
  const [activeNav, setActiveNav] = useState("palm");
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [autoImprove, setAutoImprove] = useState(true);
  const [safetyMode, setSafetyMode] = useState(false);

  // Advanced sliders — these are the palm guard's calibration knobs, not
  // cosmetics: contact geometry is reported in CSS px and differs per panel.
  const storedProfile = useRef(loadPalmProfile()).current;
  const [detectionStrength, setDetectionStrength] = useState(storedProfile.detectionStrength);
  const [smallContacts, setSmallContacts] = useState(storedProfile.smallContacts);
  const [contactWindow, setContactWindow] = useState(storedProfile.contactWindow);

  useEffect(() => {
    savePalmProfile({ detectionStrength, smallContacts, contactWindow });
  }, [detectionStrength, smallContacts, contactWindow]);

  // Agent backend — the OpenRouter key stays in the Hugging Face Space secret,
  // so only the proxy address and its optional access key live here.
  const storedAgent = useRef(loadAgentConfig()).current;
  const [agentUrl, setAgentUrl] = useState(storedAgent.baseUrl);
  const [agentKey, setAgentKey] = useState(storedAgent.accessKey);

  useEffect(() => {
    saveAgentConfig({ baseUrl: agentUrl, accessKey: agentKey });
  }, [agentUrl, agentKey]);

  // WebUntis credentials — stored locally, sent to the proxy backend per request.
  const storedUntis = useRef(loadUntisCredentials()).current;
  const [untisSchool, setUntisSchool] = useState(storedUntis?.school || "");
  const [untisServer, setUntisServer] = useState(storedUntis?.server || "");
  const [untisUsername, setUntisUsername] = useState(storedUntis?.username || "");
  const [untisPassword, setUntisPassword] = useState(storedUntis?.password || "");

  useEffect(() => {
    saveUntisCredentials({
      school: untisSchool,
      server: untisServer,
      username: untisUsername,
      password: untisPassword,
    });
  }, [untisSchool, untisServer, untisUsername, untisPassword]);

  // Modals & Overlays
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState(1);
  const [isTestAreaOpen, setIsTestAreaOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const testCanvasRef = useRef(null);
  const testInputRef = useRef(createInputState());

  useLiquidGlass(glassRootRef, `${activeNav}:${isAdvanced}`);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2000);
  };

  const handleResetProfile = () => {
    setDetectionStrength(PALM_PROFILE_DEFAULTS.detectionStrength);
    setSmallContacts(PALM_PROFILE_DEFAULTS.smallContacts);
    setContactWindow(PALM_PROFILE_DEFAULTS.contactWindow);
    setAutoImprove(true);
    setSafetyMode(false);
    showToast("Profil auf Standardwerte zurückgesetzt");
  };

  // Test Canvas Handlers — routed through the real guard with the live slider
  // values, so this surface answers the question it is labelled with instead of
  // drawing whatever touches it.
  const testContext = (event) => {
    const canvas = testCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      ctx: canvas.getContext("2d"),
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
      scale: scaleX,
    };
  };

  const routeTestPointer = (event, phase) => {
    const routed = reducePointerInput(
      testInputRef.current,
      {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        timeStamp: event.timeStamp,
        width: event.width,
        height: event.height,
        phase,
      },
      "stylus",
      palmGuardFromProfile({ detectionStrength, smallContacts, contactWindow }),
    );
    testInputRef.current = routed.state;
    return routed.intent;
  };

  const handlePointerDown = (e) => {
    const target = testContext(e);
    if (!target) return;
    const intent = routeTestPointer(e, "down");
    if (intent !== "start-draw" && intent !== "replace-draw") {
      // Mark what was rejected: a guard that works otherwise looks like a dead
      // canvas, and there would be nothing to calibrate against.
      const radius = Math.max(8, ((e.width || 0) * target.scale) / 2);
      target.ctx.beginPath();
      target.ctx.arc(target.x, target.y, radius, 0, Math.PI * 2);
      target.ctx.strokeStyle = "rgba(255,69,58,.85)";
      target.ctx.lineWidth = 1.5;
      target.ctx.stroke();
      return;
    }
    target.ctx.beginPath();
    target.ctx.moveTo(target.x, target.y);
  };

  const handlePointerMove = (e) => {
    if (routeTestPointer(e, "move") !== "continue-draw") return;
    const target = testContext(e);
    if (!target) return;
    target.ctx.strokeStyle = "#0a84ff";
    target.ctx.lineWidth = 3;
    target.ctx.lineCap = "round";
    target.ctx.lineTo(target.x, target.y);
    target.ctx.stroke();
  };

  const handlePointerUp = (e) => {
    routeTestPointer(e, e.type === "pointercancel" ? "cancel" : "up");
  };

  const clearTestCanvas = () => {
    const canvas = testCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // The shell is the LiquidGlass root: the library refracts a root's non-glass
  // children, so the bar can only pick up the settings content behind it if
  // they share this root.
  return (
    <div
      ref={glassRootRef}
      className="settings-shell"
      data-testid="settings-screen"
    >
      {/* Capturable backdrop for the top bar's shader — same reeded scene the
          Library root uses. Without a child to rasterise there is nothing
          behind the bar to refract and it renders as flat white. */}
      <div className="liquid-glass-scene" aria-hidden="true" />

      {/* Topbar */}
      <header
        className="settings-topbar"
        data-liquid-glass-control="settings-topbar"
        data-config={JSON.stringify(TOPBAR_GLASS_CONFIG)}
      >
        <button className="settings-back-btn" onClick={onBack} title="Zurück">
          <ChevronLeft size={20} />
          <span className="settings-title">Einstellungen</span>
        </button>
        <button className="settings-done-btn" onClick={onBack}>
          Fertig
        </button>
      </header>

      {/* Sidebar and content are direct children of the shell (no wrapper),
          because a LiquidGlass element has to be a direct child of its root. */}
      <aside
        className="settings-sidebar"
        data-liquid-glass-control="settings-sidebar"
        data-config={JSON.stringify(SIDEBAR_GLASS_CONFIG)}
      >
        <div className="settings-nav-label">APP</div>
        <button
          className={`settings-nav-item ${activeNav === "general" ? "active" : ""}`}
          onClick={() => {
            setActiveNav("general");
            setIsAdvanced(false);
          }}
        >
          <Plus size={15} />
          <span>Allgemein</span>
        </button>
        <button
          className={`settings-nav-item ${activeNav === "writing" ? "active" : ""}`}
          onClick={() => {
            setActiveNav("writing");
            setIsAdvanced(false);
          }}
        >
          <PenLine size={15} />
          <span>Schreiben</span>
        </button>
        <button
          className={`settings-nav-item ${activeNav === "palm" ? "active" : ""}`}
          onClick={() => {
            setActiveNav("palm");
          }}
        >
          <ShieldCheck size={15} />
          <span>Palm-Schutz</span>
        </button>
        <button
          className={`settings-nav-item ${activeNav === "files" ? "active" : ""}`}
          onClick={() => {
            setActiveNav("files");
            setIsAdvanced(false);
          }}
        >
          <Folder size={15} />
          <span>Dateien</span>
        </button>

        <div className="settings-nav-label" style={{ marginTop: 16 }}>
          ONLINE
        </div>
        <button
          className={`settings-nav-item ${activeNav === "network" ? "active" : ""}`}
          onClick={() => {
            setActiveNav("network");
            setIsAdvanced(false);
          }}
        >
          <Wifi size={15} />
          <span>KI & Netzwerk</span>
        </button>
      </aside>

      {/* Content Pane */}
      <main className="settings-content">
        {activeNav === "palm" && (
          <>
            {!isAdvanced ? (
              /* 1. Palm-Schutz Standardansicht */
              <div>
                <h2 className="settings-detail-title">Palm-Schutz</h2>
                <p className="settings-detail-copy">
                  Einfache Standardansicht mit deinem persönlichen Profil.
                </p>

                <div className="settings-status">
                  <span className="settings-status-dot" />
                  <strong>Bereit</strong>
                  <span>· stabile Version 4</span>
                </div>

                <div className="settings-group">
                  {/* Row 1: Neu kalibrieren */}
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">Neu kalibrieren</div>
                      <div className="settings-row-copy">
                        Handballen, Stift und kurze Bewegungen testen
                      </div>
                    </div>
                    <button
                      className="settings-action-btn"
                      onClick={() => {
                        setIsCalibrating(true);
                        setCalibrationStep(1);
                      }}
                      data-testid="recalibrate-btn"
                    >
                      Starten
                    </button>
                  </div>

                  {/* Row 2: Profil automatisch verbessern */}
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">
                        Profil automatisch verbessern
                      </div>
                      <div className="settings-row-copy">
                        Nur eindeutige Muster; Änderungen nach der Sitzung
                      </div>
                    </div>
                    <div
                      className={`settings-switch ${autoImprove ? "on" : ""}`}
                      onClick={() => setAutoImprove(!autoImprove)}
                      data-testid="auto-improve-switch"
                    />
                  </div>

                  {/* Row 3: 25-%-Sicherheitsmodus */}
                  <div className="settings-row">
                    <div className="settings-row-main">
                      <div className="settings-row-title">
                        25-%-Sicherheitsmodus
                      </div>
                      <div className="settings-row-copy">
                        Schreibbereich rechts begrenzen
                      </div>
                    </div>
                    <div
                      className={`settings-switch ${safetyMode ? "on" : ""}`}
                      onClick={() => setSafetyMode(!safetyMode)}
                      data-testid="safety-mode-switch"
                    />
                  </div>

                  {/* Row 4: Erweiterte Einstellungen */}
                  <div
                    className="settings-row settings-row-clickable"
                    onClick={() => setIsAdvanced(true)}
                    data-testid="advanced-settings-btn"
                  >
                    <div className="settings-row-main">
                      <div className="settings-row-title">
                        Erweiterte Einstellungen
                      </div>
                      <div className="settings-row-copy">
                        Manuelle Grundtendenz, Testfläche und Profil-Reset
                      </div>
                    </div>
                    <span className="settings-chevron">›</span>
                  </div>
                </div>
              </div>
            ) : (
              /* 2. Erweiterte Einstellungen Subpage */
              <div>
                <div
                  className="settings-advanced-head"
                  onClick={() => setIsAdvanced(false)}
                >
                  <button className="settings-back-icon-btn">
                    <ChevronLeft size={20} />
                  </button>
                  <h2 className="settings-detail-title">
                    Erweiterte Einstellungen
                  </h2>
                </div>

                <p
                  className="settings-detail-copy"
                  style={{ marginBottom: 14 }}
                >
                  Manuelle Grundtendenz; die automatische Anpassung bleibt
                  innerhalb eines kleinen Bereichs darum herum.
                </p>

                <div className="settings-section-caption">ERKENNUNG</div>

                <div className="settings-group">
                  {/* Slider 1 */}
                  <div className="settings-control-row">
                    <div>
                      <div className="settings-control-title">
                        Erkennungsstärke
                      </div>
                      <div className="settings-control-copy">
                        Ausgewogen zwischen Schreiben und Blockieren
                      </div>
                    </div>
                    <div className="settings-slider-container">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={detectionStrength}
                        onChange={(e) =>
                          setDetectionStrength(Number(e.target.value))
                        }
                        className="settings-range-slider"
                        data-testid="slider-detection-strength"
                      />
                    </div>
                  </div>

                  {/* Slider 2 */}
                  <div className="settings-control-row">
                    <div>
                      <div className="settings-control-title">
                        Kleine Kontakte
                      </div>
                      <div className="settings-control-copy">
                        Kurze Handkontakte stärker berücksichtigen
                      </div>
                    </div>
                    <div className="settings-slider-container">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={smallContacts}
                        onChange={(e) =>
                          setSmallContacts(Number(e.target.value))
                        }
                        className="settings-range-slider"
                        data-testid="slider-small-contacts"
                      />
                    </div>
                  </div>

                  {/* Slider 3 */}
                  <div className="settings-control-row">
                    <div>
                      <div className="settings-control-title">
                        Kontakt-Zeitfenster
                      </div>
                      <div className="settings-control-copy">
                        {Math.round(contactWindow * 6)} ms Sperre nach dem
                        Absetzen des Stifts
                      </div>
                    </div>
                    <div className="settings-slider-container">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={contactWindow}
                        onChange={(e) =>
                          setContactWindow(Number(e.target.value))
                        }
                        className="settings-range-slider"
                        data-testid="slider-contact-window"
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="settings-actions">
                  <button
                    className="settings-secondary-btn"
                    onClick={() => setIsTestAreaOpen(true)}
                    data-testid="open-test-surface-btn"
                  >
                    Testfläche öffnen
                  </button>
                  <button
                    className="settings-secondary-btn danger"
                    onClick={handleResetProfile}
                    data-testid="reset-profile-btn"
                  >
                    Profil zurücksetzen
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {activeNav === "general" && (
          <div>
            <h2 className="settings-detail-title">Allgemein</h2>
            <p className="settings-detail-copy">
              App-Darstellung, Verhalten und Kontoeinstellungen.
            </p>
            <div className="settings-group" style={{ marginTop: 14 }}>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Erscheinungsbild</div>
                  <div className="settings-row-copy">
                    Dunkles Glasmorphism-Design aktiv
                  </div>
                </div>
                <span style={{ fontSize: 11, color: "#FFFFFF" }}>Dunkel</span>
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Sprache</div>
                  <div className="settings-row-copy">Deutsch (Deutschland)</div>
                </div>
                <span style={{ fontSize: 11, color: "#FFFFFF" }}>Deutsch</span>
              </div>
            </div>
          </div>
        )}

        {activeNav === "writing" && (
          <div>
            <h2 className="settings-detail-title">Schreiben</h2>
            <p className="settings-detail-copy">
              Stiftempfindlichkeit, Glättung und Werkzeugvoreinstellungen.
            </p>
            <div className="settings-group" style={{ marginTop: 14 }}>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">
                    Strichglättung (Bezier)
                  </div>
                  <div className="settings-row-copy">
                    Verfeinert handschriftliche Kurven automatisch
                  </div>
                </div>
                <div className="settings-switch on" />
              </div>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">
                    Druckdynamik simulieren
                  </div>
                  <div className="settings-row-copy">
                    Variiert die Strichstärke leicht nach Schreibtempo
                  </div>
                </div>
                <div className="settings-switch on" />
              </div>
            </div>
          </div>
        )}

        {activeNav === "files" && (
          <div>
            <h2 className="settings-detail-title">Dateien & Speicher</h2>
            <p className="settings-detail-copy">
              Lokale Notizdatenbank und automatische Sicherungen.
            </p>
            <div className="settings-group" style={{ marginTop: 14 }}>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Lokaler Speicher</div>
                  <div className="settings-row-copy">
                    Notizen werden lokal auf dem Gerät gesichert
                  </div>
                </div>
                <span style={{ fontSize: 11, color: "#30d158" }}>Aktiv</span>
              </div>
            </div>
          </div>
        )}

        {activeNav === "network" && (
          <div>
            <h2 className="settings-detail-title">KI & Netzwerk</h2>
            <p className="settings-detail-copy">
              Intelligente Notizenanalyse, Handschrifterkennung und Sync.
            </p>
            <div className="settings-group" style={{ marginTop: 14 }}>
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Notiz-Agent</div>
                  <div className="settings-row-copy">
                    Recherche und Zusammenfassungen im Hintergrund
                  </div>
                </div>
                <div className="settings-switch on" />
              </div>
            </div>

            <div className="settings-section-caption" style={{ marginTop: 20 }}>
              KI-BACKEND
            </div>
            <p className="settings-detail-copy" style={{ marginBottom: 12 }}>
              Chat und Agent laufen über den eigenen Server. Der OpenRouter-Schlüssel
              liegt dort als Secret und nie auf dem Tablet.
            </p>
            <div className="settings-group">
              <div className="settings-control-row">
                <div>
                  <div className="settings-control-title">Adresse</div>
                  <div className="settings-control-copy">
                    z. B. https://luca448-app-backend.hf.space/notes
                  </div>
                </div>
                <input
                  type="text"
                  className="settings-text-input"
                  value={agentUrl}
                  onChange={(e) => setAgentUrl(e.target.value)}
                  placeholder="https://…/notes"
                  data-testid="agent-url-input"
                />
              </div>
              <div className="settings-control-row">
                <div>
                  <div className="settings-control-title">Zugriffsschlüssel</div>
                  <div className="settings-control-copy">
                    Nur nötig, wenn der Server NOTES_ACCESS_TOKEN gesetzt hat
                  </div>
                </div>
                <input
                  type="password"
                  className="settings-text-input"
                  value={agentKey}
                  onChange={(e) => setAgentKey(e.target.value)}
                  data-testid="agent-key-input"
                />
              </div>
            </div>

            <div className="settings-section-caption" style={{ marginTop: 20 }}>
              WEBUNTIS
            </div>
            <p className="settings-detail-copy" style={{ marginBottom: 12 }}>
              Zugangsdaten für den Stundenplan in der Bibliothek.
            </p>
            <div className="settings-group">
              <div className="settings-control-row">
                <div>
                  <div className="settings-control-title">Schule</div>
                  <div className="settings-control-copy">
                    Schulname wie in der WebUntis-App
                  </div>
                </div>
                <input
                  type="text"
                  className="settings-text-input"
                  value={untisSchool}
                  onChange={(e) => setUntisSchool(e.target.value)}
                  placeholder="z. B. meine-schule"
                  data-testid="untis-school-input"
                />
              </div>
              <div className="settings-control-row">
                <div>
                  <div className="settings-control-title">Server</div>
                  <div className="settings-control-copy">
                    z. B. neilo.webuntis.com
                  </div>
                </div>
                <input
                  type="text"
                  className="settings-text-input"
                  value={untisServer}
                  onChange={(e) => setUntisServer(e.target.value)}
                  placeholder="server.webuntis.com"
                  data-testid="untis-server-input"
                />
              </div>
              <div className="settings-control-row">
                <div>
                  <div className="settings-control-title">Benutzername</div>
                </div>
                <input
                  type="text"
                  className="settings-text-input"
                  value={untisUsername}
                  onChange={(e) => setUntisUsername(e.target.value)}
                  autoComplete="username"
                  data-testid="untis-username-input"
                />
              </div>
              <div className="settings-control-row">
                <div>
                  <div className="settings-control-title">Passwort</div>
                </div>
                <input
                  type="password"
                  className="settings-text-input"
                  value={untisPassword}
                  onChange={(e) => setUntisPassword(e.target.value)}
                  autoComplete="current-password"
                  data-testid="untis-password-input"
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Calibration Modal */}
      {isCalibrating && (
        <div className="settings-modal-overlay">
          <div className="settings-modal-card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  font: "700 15px sans-serif",
                  color: "#FFFFFF",
                }}
              >
                Handballen-Kalibrierung
              </h3>
              <button
                onClick={() => setIsCalibrating(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#FFFFFF",
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>

            {calibrationStep === 1 && (
              <div>
                <p style={{ color: "#FFFFFF", fontSize: 13, lineHeight: 1.5 }}>
                  <strong>Schritt 1:</strong> Lege deinen Handballen in deiner
                  gewohnten Schreibhaltung auf das Display.
                </p>
                <div
                  style={{
                    height: 110,
                    borderRadius: 12,
                    background: "#121118",
                    border: "1px dashed rgba(255,255,255,.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#FFFFFF",
                    fontSize: 12,
                    margin: "14px 0",
                  }}
                >
                  Handballen hier auflegen...
                </div>
                <button
                  className="settings-action-btn"
                  style={{ width: "100%", padding: "10px 0", fontSize: 13 }}
                  onClick={() => setCalibrationStep(2)}
                >
                  Weiter zu Schritt 2
                </button>
              </div>
            )}

            {calibrationStep === 2 && (
              <div>
                <p style={{ color: "#FFFFFF", fontSize: 13, lineHeight: 1.5 }}>
                  <strong>Schritt 2:</strong> Schreibe oder zeichne ein
                  beliebiges Muster mit dem Stift.
                </p>
                <div
                  style={{
                    height: 110,
                    borderRadius: 12,
                    background: "#121118",
                    border: "1px dashed rgba(10,132,255,.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#8ac0ff",
                    fontSize: 12,
                    margin: "14px 0",
                  }}
                >
                  Stiftbewegungen erfassen...
                </div>
                <button
                  className="settings-action-btn"
                  style={{ width: "100%", padding: "10px 0", fontSize: 13 }}
                  onClick={() => {
                    setIsCalibrating(false);
                    showToast("Kalibrierung erfolgreich abgeschlossen!");
                  }}
                >
                  Kalibrierung abschließen
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Test Surface Modal */}
      {isTestAreaOpen && (
        <div className="settings-modal-overlay">
          <div className="settings-modal-card" style={{ width: 440 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  font: "700 15px sans-serif",
                  color: "#FFFFFF",
                }}
              >
                Palm-Schutz Testfläche
              </h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={clearTestCanvas}
                  style={{
                    background: "rgba(255,255,255,.12)",
                    border: "none",
                    color: "#FFFFFF",
                    padding: "4px 8px",
                    borderRadius: 8,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                  }}
                >
                  <RotateCcw size={12} /> Leeren
                </button>
                <button
                  onClick={() => setIsTestAreaOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#FFFFFF",
                    cursor: "pointer",
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <p style={{ color: "#FFFFFF", fontSize: 11, margin: "0 0 10px" }}>
              Lege die Hand auf und zeichne, um die Unterdrückung zu überprüfen:
            </p>
            <div
              style={{
                borderRadius: 14,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,.15)",
                background: "#08080A",
              }}
            >
              <canvas
                ref={testCanvasRef}
                width={400}
                height={200}
                style={{
                  width: "100%",
                  height: 200,
                  display: "block",
                  touchAction: "none",
                  cursor: "crosshair",
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />
            </div>
            <button
              className="settings-action-btn"
              style={{
                width: "100%",
                marginTop: 12,
                padding: "9px 0",
                fontSize: 12,
              }}
              onClick={() => setIsTestAreaOpen(false)}
            >
              Fertig
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="settings-toast">
          <Check size={14} color="#30d158" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
