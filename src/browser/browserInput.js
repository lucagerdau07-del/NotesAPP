const DOMAIN =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i;
const HTTP = /^https?:$/i;

export function resolveBrowserInput(input) {
  const value = String(input ?? "").trim();
  if (!value) return "";

  try {
    const parsed = new URL(value);
    return HTTP.test(parsed.protocol) ? parsed.href : "";
  } catch {
    if (DOMAIN.test(value)) return new URL(`https://${value}`).href;
    return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  }
}

export function isInternalBrowserUrl(input) {
  try {
    return HTTP.test(new URL(input).protocol);
  } catch {
    return false;
  }
}

export function toExternalBrowserUrl(input) {
  if (!isInternalBrowserUrl(input)) return null;
  return new URL(input).href;
}
