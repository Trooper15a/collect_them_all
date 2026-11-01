'use client';

import { useEffect, useState } from 'react';
import { CardImage } from '@/components/ui';

/** Resolve public catalog artwork even for deals saved before images were shown. */
export function OfferCardImage({ id, name }: { id: string; name: string }) {
  const [image, setImage] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/card-show/lookup?id=${encodeURIComponent(id)}`, { signal: controller.signal });
        const data = await response.json();
        const url = response.ok && data.card?.id === id && typeof data.card.imageUrl === 'string' ? data.card.imageUrl : null;
        if (!cancelled) setImage({ id, url });
      } catch {
        if (!cancelled) setImage({ id, url: null });
      } finally { clearTimeout(timeout); }
    })();
    return () => { cancelled = true; clearTimeout(timeout); controller.abort(); };
  }, [id]);

  const current = image?.id === id ? image : null;
  return <div className="w-24 sm:w-28 shrink-0">
    {current?.url ? <CardImage key={`${id}:${current.url}`} id={id} directUrl={current.url} size="high" alt={name} className="w-full rounded-lg shadow-md" />
      : <div role="status" className="aspect-[63/88] rounded-lg border border-line bg-elev flex items-center justify-center p-2 text-center text-[10px] text-muted">{current ? 'Image unavailable' : 'Loading image…'}</div>}
  </div>;
}
