import { useState } from "react";

function defaultFocusBox(pageId) {
  return {
    pageId: String(pageId),
    x: 50,
    y: 50,
    width: 250,
    height: 100,
  };
}

function normalizePageIds(pageIds) {
  const values = Array.isArray(pageIds) ? pageIds : [pageIds ?? "page-1"];
  return [...new Set(values.map(String).filter(Boolean))];
}

const useFocusBox = (pageIds = ["page-1"]) => {
  const livePageIds = normalizePageIds(pageIds);
  const fallbackPageId = livePageIds[0];
  const [storedFocusBox, setFocusBox] = useState(() =>
    fallbackPageId ? defaultFocusBox(fallbackPageId) : null,
  );
  let focusBox = storedFocusBox;

  if (focusBox && !livePageIds.includes(focusBox.pageId)) {
    focusBox = fallbackPageId ? defaultFocusBox(fallbackPageId) : null;
    setFocusBox(focusBox);
  }

  const handleDrag = (dx, dy) => {
    setFocusBox((prev) =>
      prev
        ? {
            ...prev,
            x: prev.x + dx,
            y: prev.y + dy,
          }
        : prev,
    );
  };

  return { focusBox, setFocusBox, handleDrag };
};

export default useFocusBox;
