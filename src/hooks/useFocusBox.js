import { useState } from 'react';

const useFocusBox = () => {
  const [focusBox, setFocusBox] = useState({
    x: 50,
    y: 50,
    width: 250,
    height: 100
  });

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
