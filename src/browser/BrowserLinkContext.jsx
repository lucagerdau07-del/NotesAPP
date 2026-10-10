import React, { createContext, useCallback, useContext } from "react";
import { isInternalBrowserUrl } from "./browserInput.js";

const BrowserLinkContext = createContext(null);

export function BrowserLinkProvider({ openLink, children }) {
  const safeOpen = useCallback((url) => {
    if (!isInternalBrowserUrl(url)) return false;
    openLink?.(url);
    return true;
  }, [openLink]);
  return <BrowserLinkContext.Provider value={safeOpen}>{children}</BrowserLinkContext.Provider>;
}

export function useBrowserLink() {
  return useContext(BrowserLinkContext);
}
