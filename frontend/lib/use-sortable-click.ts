import { useEffect, useRef } from "react";

/** Fire onClick only when the pointer interaction was a click, not a drag. */
export function useSortableClickHandler(isDragging: boolean, onClick?: () => void) {
  const skipClickRef = useRef(false);

  useEffect(() => {
    if (isDragging) {
      skipClickRef.current = true;
    }
  }, [isDragging]);

  return () => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    onClick?.();
  };
}

export function stopDragPropagation(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}
