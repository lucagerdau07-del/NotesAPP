import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe2,
  Home,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  RotateCw,
  Search,
  SquarePlus,
  Trash2,
  X,
} from "lucide-react";
import {
  isInternalBrowserUrl,
  resolveBrowserInput,
} from "../browser/browserInput.js";

function canonicalUrl(value) {
  return isInternalBrowserUrl(value) ? new URL(value).href : "";
}

function domainLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Webseite";
  }
}

function IconButton({ title, children, ...props }) {
  return (
    <button
      type="button"
      className="browser-icon-btn"
      title={title}
      aria-label={title}
      {...props}
    >
      {children}
    </button>
  );
}

export default function BrowserPanel({
  active = false,
  bridge,
  repository,
  initialUrl = "",
  navigationRequest = null,
  onClose,
  onFullscreenChange,
}) {
  const firstUrl = canonicalUrl(initialUrl);
  const [view, setView] = useState(firstUrl ? "page" : "home");
  const [homeTab, setHomeTab] = useState("quick");
  const [address, setAddress] = useState(firstUrl);
  const [page, setPage] = useState({
    url: firstUrl,
    title: firstUrl ? domainLabel(firstUrl) : "",
    canGoBack: false,
    canGoForward: false,
    loading: false,
  });
  const [shortcuts, setShortcuts] = useState(() => repository.listShortcuts());
  const [historyQuery, setHistoryQuery] = useState("");
  const [shortcutDialog, setShortcutDialog] = useState(null);
  const [shortcutMenu, setShortcutMenu] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewportRef = useRef(null);
  const mountedRef = useRef(false);

  const refreshShortcuts = useCallback(() => {
    setShortcuts(repository.listShortcuts());
  }, [repository]);

  const openUrl = useCallback(
    (url) => {
      const safe = canonicalUrl(url);
      if (!safe) return;
      setAddress(safe);
      setPage((current) => ({ ...current, url: safe, loading: true }));
      setError(null);
      setView("page");
      bridge.load(safe);
    },
    [bridge],
  );

  useEffect(() => {
    const unsubscribe = bridge.subscribe((event) => {
      if (event.type === "back-at-root") {
        setView("home");
        setError(null);
        return;
      }
      if (event.type === "error") {
        setError({
          url: canonicalUrl(event.url) || page.url,
          message: event.message || "Die Webseite konnte nicht geladen werden.",
        });
        setPage((current) => ({ ...current, loading: false }));
        setView("error");
        return;
      }
      if (event.type === "load-start") {
        setPage((current) => ({
          ...current,
          url: canonicalUrl(event.url) || current.url,
          loading: true,
        }));
        return;
      }
      if (event.type === "state" || event.type === "load-end") {
        setPage((current) => {
          const next = {
            ...current,
            url: canonicalUrl(event.url) || current.url,
            title: event.title || current.title,
            canGoBack: event.canGoBack ?? current.canGoBack,
            canGoForward: event.canGoForward ?? current.canGoForward,
            loading: event.type === "load-end" ? false : current.loading,
          };
          if (event.type === "load-end" && next.url) {
            repository.recordVisit({ title: next.title || next.url, url: next.url });
          }
          return next;
        });
        if (event.url) setAddress(canonicalUrl(event.url));
      }
    });

    return () => {
      unsubscribe?.();
      bridge.destroy();
    };
  }, [bridge, repository]);

  useEffect(() => {
    if (firstUrl) openUrl(firstUrl);
  }, []);

  useEffect(() => {
    if (navigationRequest?.id == null) return;
    const safe = canonicalUrl(navigationRequest.url);
    if (safe) openUrl(safe);
  }, [navigationRequest?.id, openUrl]);

  const syncFrame = useCallback(() => {
    const node = viewportRef.current;
    if (!node || !bridge.isNative) return;
    const rect = node.getBoundingClientRect();
    const frame = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
    if (!mountedRef.current) {
      mountedRef.current = true;
      bridge.mount(frame);
    } else {
      bridge.setFrame(frame);
    }
  }, [bridge]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    syncFrame();
    const observer = new ResizeObserver(syncFrame);
    observer.observe(node);
    globalThis.addEventListener?.("resize", syncFrame);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener?.("resize", syncFrame);
    };
  }, [syncFrame, isFullscreen]);

  useEffect(() => {
    const shouldShow =
      active && view === "page" && !shortcutDialog && !confirmClear;
    if (shouldShow) {
      syncFrame();
      bridge.show();
    } else {
      bridge.hide();
    }
  }, [active, bridge, confirmClear, shortcutDialog, syncFrame, view]);

  const history = useMemo(
    () => repository.listHistory(historyQuery),
    [repository, historyQuery, view, confirmClear],
  );

  const submitAddress = (event) => {
    event.preventDefault();
    const resolved = resolveBrowserInput(address);
    if (resolved) openUrl(resolved);
  };

  const showShortcutDialog = (shortcut = null) => {
    const url = shortcut?.url || page.url;
    if (!canonicalUrl(url)) return;
    setShortcutDialog({
      id: shortcut?.id,
      title: shortcut?.title || page.title || domainLabel(url),
      url,
    });
    setShortcutMenu(null);
  };

  const saveShortcut = (event) => {
    event.preventDefault();
    const resolved = resolveBrowserInput(shortcutDialog.url);
    if (!resolved) return;
    repository.saveShortcut({ ...shortcutDialog, url: resolved });
    refreshShortcuts();
    setShortcutDialog(null);
  };

  const moveShortcut = (id, delta) => {
    const index = shortcuts.findIndex((item) => item.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= shortcuts.length) return;
    const next = [...shortcuts];
    [next[index], next[target]] = [next[target], next[index]];
    repository.reorderShortcuts(next.map((item) => item.id));
    refreshShortcuts();
  };

  const goHome = () => {
    setView("home");
    setError(null);
    setShortcutMenu(null);
  };

  const retry = () => {
    setError(null);
    setView("page");
    bridge.reload();
  };

  const toggleFullscreen = () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    onFullscreenChange?.(next);
  };

  return (
    <section
      className="rail-browser"
      data-testid="browser-panel"
      data-fullscreen={isFullscreen}
      hidden={!active}
      aria-hidden={!active}
    >
      <header className="browser-toolbar">
        <IconButton title="Startseite" onClick={goHome}>
          <Home size={17} />
        </IconButton>
        <IconButton
          title="Zurück"
          disabled={!page.canGoBack}
          onClick={() => bridge.back()}
        >
          <ChevronLeft size={19} />
        </IconButton>
        <IconButton
          title="Vor"
          disabled={!page.canGoForward}
          onClick={() => bridge.forward()}
        >
          <ChevronRight size={19} />
        </IconButton>
        <form
          className="browser-address-form"
          aria-label="Browsernavigation"
          onSubmit={submitAddress}
        >
          <Search size={14} aria-hidden="true" />
          <input
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            aria-label="Adresse oder Google-Suche"
            placeholder="Adresse oder Google-Suche"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
          />
          {page.loading && <Loader2 className="browser-spin" size={14} />}
        </form>
        <IconButton
          title="Neu laden"
          disabled={!page.url}
          onClick={() => (page.loading ? bridge.stop() : bridge.reload())}
        >
          {page.loading ? <X size={16} /> : <RotateCw size={16} />}
        </IconButton>
        <IconButton
          title="Zum Schnellzugriff hinzufügen"
          disabled={!page.url}
          onClick={() => showShortcutDialog()}
        >
          <SquarePlus size={18} />
        </IconButton>
        <IconButton
          title="Im externen Browser öffnen"
          disabled={!page.url}
          onClick={() => bridge.openExternal(page.url)}
        >
          <ExternalLink size={17} />
        </IconButton>
        <IconButton
          title={isFullscreen ? "Angedockte Ansicht" : "Browser maximieren"}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </IconButton>
        <IconButton title="Browser schließen" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>

      <div className="browser-content">
        {view === "home" && (
          <div className="browser-home">
            <div className="browser-segment" role="tablist" aria-label="Browser-Startseite">
              <button
                type="button"
                role="tab"
                aria-selected={homeTab === "quick"}
                className={homeTab === "quick" ? "active" : ""}
                onClick={() => setHomeTab("quick")}
              >
                Schnellzugriff
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={homeTab === "history"}
                className={homeTab === "history" ? "active" : ""}
                onClick={() => setHomeTab("history")}
              >
                Verlauf durchsuchen
              </button>
            </div>

            {homeTab === "quick" ? (
              <section className="browser-home-section" aria-labelledby="browser-shortcuts-title">
                <div className="browser-section-head">
                  <div>
                    <span className="browser-eyebrow">STARTSEITE</span>
                    <h2 id="browser-shortcuts-title">Meine Shortcuts</h2>
                  </div>
                  <button
                    type="button"
                    className="browser-text-action"
                    disabled={!page.url}
                    onClick={() => showShortcutDialog()}
                  >
                    <SquarePlus size={16} /> Hinzufügen
                  </button>
                </div>
                {shortcuts.length === 0 ? (
                  <div className="browser-empty">
                    <Globe2 size={28} />
                    <strong>Noch keine Shortcuts</strong>
                    <span>Öffne eine Webseite und tippe oben auf Plus.</span>
                  </div>
                ) : (
                  <div className="browser-shortcut-grid">
                    {shortcuts.map((shortcut, index) => (
                      <article className="browser-shortcut" key={shortcut.id}>
                        <button
                          type="button"
                          className="browser-shortcut-open"
                          aria-label={`${shortcut.title} öffnen`}
                          onClick={() => openUrl(shortcut.url)}
                        >
                          <span className="browser-shortcut-icon" aria-hidden="true">
                            {shortcut.title.trim().slice(0, 1).toUpperCase() || <Globe2 size={19} />}
                          </span>
                          <span>{shortcut.title}</span>
                        </button>
                        <IconButton
                          title={`${shortcut.title} verwalten`}
                          onClick={() => setShortcutMenu(shortcutMenu === shortcut.id ? null : shortcut.id)}
                        >
                          <MoreHorizontal size={15} />
                        </IconButton>
                        {shortcutMenu === shortcut.id && (
                          <div className="browser-shortcut-menu" role="menu">
                            <button type="button" role="menuitem" onClick={() => showShortcutDialog(shortcut)}>Bearbeiten</button>
                            <button type="button" role="menuitem" disabled={index === 0} onClick={() => moveShortcut(shortcut.id, -1)}>Nach links</button>
                            <button type="button" role="menuitem" disabled={index === shortcuts.length - 1} onClick={() => moveShortcut(shortcut.id, 1)}>Nach rechts</button>
                            <button
                              type="button"
                              role="menuitem"
                              className="danger"
                              onClick={() => {
                                repository.removeShortcut(shortcut.id);
                                refreshShortcuts();
                                setShortcutMenu(null);
                              }}
                            >
                              Löschen
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <section className="browser-home-section" aria-labelledby="browser-history-title">
                <div className="browser-section-head">
                  <div>
                    <span className="browser-eyebrow">LETZTE 30 TAGE</span>
                    <h2 id="browser-history-title">Verlauf</h2>
                  </div>
                  <button
                    type="button"
                    className="browser-text-action danger"
                    disabled={history.length === 0}
                    onClick={() => setConfirmClear(true)}
                  >
                    <Trash2 size={15} /> Verlauf löschen
                  </button>
                </div>
                <label className="browser-history-search">
                  <Search size={15} />
                  <span className="sr-only">Verlauf durchsuchen</span>
                  <input
                    value={historyQuery}
                    onChange={(event) => setHistoryQuery(event.target.value)}
                    aria-label="Verlauf durchsuchen"
                    placeholder="Titel oder Adresse"
                  />
                </label>
                {history.length === 0 ? (
                  <div className="browser-empty compact">
                    <strong>Kein Verlauf gefunden</strong>
                    <span>Besuchte Seiten erscheinen hier für 30 Tage.</span>
                  </div>
                ) : (
                  <div className="browser-history-list">
                    {history.map((entry) => (
                      <button
                        type="button"
                        key={entry.id}
                        aria-label={`${entry.title} öffnen`}
                        onClick={() => openUrl(entry.url)}
                      >
                        <span className="browser-history-mark"><Globe2 size={16} /></span>
                        <span className="browser-history-copy">
                          <strong>{entry.title}</strong>
                          <small>{entry.url}</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {view === "error" && (
          <div className="browser-error" role="alert">
            <span className="browser-error-icon"><AlertTriangle size={24} /></span>
            <h2>Seite nicht erreichbar</h2>
            <p>{error?.message}</p>
            <small>{error?.url}</small>
            <div className="browser-error-actions">
              <button type="button" onClick={retry}>Erneut versuchen</button>
              <button type="button" onClick={() => bridge.openExternal(error?.url)}>Extern öffnen</button>
            </div>
          </div>
        )}

        <div
          ref={viewportRef}
          className="browser-viewport"
          data-testid="browser-viewport"
          hidden={view !== "page"}
        >
          {!bridge.isNative && page.url && (
            <iframe
              title={page.title || "Webseite"}
              src={page.url}
              onLoad={() => setPage((current) => ({ ...current, loading: false }))}
              onError={() => {
                setError({ url: page.url, message: "Diese Webseite blockiert die eingebettete Ansicht." });
                setView("error");
              }}
            />
          )}
        </div>
      </div>

      {shortcutDialog && (
        <div className="browser-dialog-backdrop">
          <form className="browser-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-dialog-title" onSubmit={saveShortcut}>
            <div className="browser-dialog-head">
              <h2 id="shortcut-dialog-title">{shortcutDialog.id ? "Shortcut bearbeiten" : "Shortcut hinzufügen"}</h2>
              <IconButton title="Dialog schließen" onClick={() => setShortcutDialog(null)}><X size={16} /></IconButton>
            </div>
            <label>
              <span>Name</span>
              <input
                aria-label="Shortcut-Name"
                value={shortcutDialog.title}
                onChange={(event) => setShortcutDialog((current) => ({ ...current, title: event.target.value }))}
                required
              />
            </label>
            <label>
              <span>Adresse</span>
              <input
                aria-label="Shortcut-Adresse"
                value={shortcutDialog.url}
                onChange={(event) => setShortcutDialog((current) => ({ ...current, url: event.target.value }))}
                required
                autoCapitalize="none"
              />
            </label>
            <div className="browser-dialog-actions">
              <button type="button" onClick={() => setShortcutDialog(null)}>Abbrechen</button>
              <button type="submit">Shortcut speichern</button>
            </div>
          </form>
        </div>
      )}

      {confirmClear && (
        <div className="browser-dialog-backdrop">
          <div className="browser-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-history-title">
            <h2 id="clear-history-title">Verlauf löschen?</h2>
            <p>Die besuchten Seiten werden entfernt. Logins und Shortcuts bleiben erhalten.</p>
            <div className="browser-dialog-actions">
              <button type="button" onClick={() => setConfirmClear(false)}>Abbrechen</button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  repository.clearHistory();
                  setConfirmClear(false);
                }}
              >
                Endgültig löschen
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
