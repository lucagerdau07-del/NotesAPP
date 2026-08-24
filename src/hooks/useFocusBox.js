import { useEffect, useState } from 'react';

function defaultFocusBox(pageId) {
  return {
    pageId: String(pageId),
    x: 50,
    y: 50,
    width: 250,
    height: 100,
  };
}

const useFocusBox = (pageId = 'page-1') => {
  const activePageId = String(pageId);
  const [focusBox, setFocusBox] = useState(() => defaultFocusBox(activePageId));

  useEffect(() => {
    setFocusBox(defaultFocusBox(activePageId));
  }, [activePageId]);

  const handleDrag = (dx, dy) => {
    setFocusBox((prev) => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy
    }));
  };

  return { focusBox, setFocusBox, handleDrag };
};

export default useFocusBox;
