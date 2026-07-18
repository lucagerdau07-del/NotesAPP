import { useCallback, useRef } from 'react';

export default function useLongPress(onLongPress, onClick, { delay = 400 } = {}) {
  const timeout = useRef(null);
  const target = useRef(null);

  const start = useCallback(
    (event) => {
      if (event.target) {
        target.current = event.target;
      }
      timeout.current = setTimeout(() => {
        onLongPress(event);
        target.current = null;
      }, delay);
    },
    [onLongPress, delay]
  );

  const clear = useCallback(
    (event, shouldTriggerClick = true) => {
      if (timeout.current) {
        clearTimeout(timeout.current);
        timeout.current = null;
        if (shouldTriggerClick && target.current) {
          onClick(event);
        }
        target.current = null;
      }
    },
    [onClick]
  );

  return {
    onPointerDown: (e) => start(e),
    onPointerUp: (e) => clear(e, true),
    onPointerLeave: (e) => clear(e, false),
    onPointerCancel: (e) => clear(e, false),
  };
}
