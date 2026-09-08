"use client";

import { useRef, useState, useCallback, type ReactNode } from "react";

interface Props {
  onDelete: () => void;
  children: ReactNode;
}

export function SwipeToDelete({ onDelete, children }: Props) {
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef(false);

  const threshold = -80;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    locked.current = false;
    setSwiping(true);
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!swiping) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;
      if (!locked.current) {
        if (Math.abs(dy) > Math.abs(dx)) {
          setSwiping(false);
          return;
        }
        locked.current = true;
      }
      if (dx < 0) setOffsetX(Math.max(dx, -120));
    },
    [swiping]
  );

  const onTouchEnd = useCallback(() => {
    if (offsetX <= threshold) {
      setOffsetX(-120);
    } else {
      setOffsetX(0);
    }
    setSwiping(false);
  }, [offsetX]);

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 w-[120px] flex items-center justify-center bg-down/80 text-white text-xs font-semibold">
        <button onClick={() => { onDelete(); setOffsetX(0); }} className="w-full h-full flex items-center justify-center">
          Delete
        </button>
      </div>
      <div
        className="relative bg-bg"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? "none" : "transform 0.3s ease",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
