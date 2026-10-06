import { useLayoutEffect, useState } from "react";

// Width class of the element itself, not the window: a split-screen pane and
// a narrow window get the same layout. CSS keys off the [data-tier] attribute
// the caller puts on that element.
export function tierForWidth(width) {
  if (width < 480) return "xs";
  if (width < 720) return "sm";
  if (width < 1100) return "md";
  return "lg";
}

export default function useWidthTier(ref) {
  const [tier, setTier] = useState(() => tierForWidth(globalThis.innerWidth || 1280));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    // A 0 width means "not laid out" (hidden, jsdom) - keep the last tier.
    const update = () => el.clientWidth && setTier(tierForWidth(el.clientWidth));
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return tier;
}
