"use client";

import { useRef, useState, useCallback, type ReactNode } from "react";
import { haptic } from "@/lib/haptics";

interface Props {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}

export function PullToRefresh({ onRefresh, children }: Props) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullY, setPullY] = useState(0);
  const startY = useRef(0);

  const threshold = 80;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // The window scrolls, not this container — gate on the real scroll position.
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling || refreshing) return;
      // Abort if the page has scrolled away from the top mid-gesture.
      if (window.scrollY > 0) {
        setPulling(false);
        setPullY(0);
        return;
      }
      const dy = Math.max(0, e.touches[0].clientY - startY.current);
      setPullY(Math.min(dy * 0.5, 120));
    },
    [pulling, refreshing]
  );

  const onTouchEnd = useCallback(async () => {
    if (!pulling) return;
    if (pullY >= threshold && !refreshing) {
      setRefreshing(true);
      haptic("light");
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    setPulling(false);
    setPullY(0);
  }, [pulling, pullY, refreshing, onRefresh]);

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex justify-center items-center overflow-hidden transition-all"
        style={{ height: pullY > 10 ? pullY : 0, opacity: pullY / threshold }}
      >
        <div
          className={`w-6 h-6 border-2 border-accent border-t-transparent rounded-full ${refreshing ? "animate-spin" : ""}`}
          style={{ transform: refreshing ? undefined : `rotate(${pullY * 3}deg)` }}
        />
      </div>
      {children}
    </div>
  );
}
