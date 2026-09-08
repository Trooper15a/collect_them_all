"use client";

import { useRef, useState, useCallback, type ReactNode } from "react";

interface Props {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}

export function PullToRefresh({ onRefresh, children }: Props) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullY, setPullY] = useState(0);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const threshold = 80;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling || refreshing) return;
      const dy = Math.max(0, e.touches[0].clientY - startY.current);
      setPullY(Math.min(dy * 0.5, 120));
    },
    [pulling, refreshing]
  );

  const onTouchEnd = useCallback(async () => {
    if (!pulling) return;
    if (pullY >= threshold && !refreshing) {
      setRefreshing(true);
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
      ref={containerRef}
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
