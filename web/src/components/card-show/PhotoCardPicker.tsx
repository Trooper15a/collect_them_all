'use client';

import { useEffect, useRef, useState } from 'react';
import { Scanner } from '@/components/Scanner';
import { Button } from '@/components/ui';
import { getScanEngine } from '@/lib/scanner/engine';
import { preprocess } from '@/lib/scanner/preprocess';
import type { Match } from '@/lib/scanner/matcher';
import type { CardSummary } from '@/lib/types';
import { useActiveTcg } from '@/lib/ui-prefs';

type Session = { key: string; file: File | null };

export function PhotoCardPicker({ onAdd }: { onAdd: (card: CardSummary) => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const open = (file: File | null) => { setNotice(''); setSession({ key: crypto.randomUUID(), file }); };
  return <div className="space-y-2">
    <div className="grid grid-cols-2 gap-2">
      <Button onClick={() => open(null)}>
        <svg aria-hidden="true" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 5 6 8H3v12h18V8h-3l-2-3Z" /><circle cx="12" cy="13" r="4" /></svg>
        Take a picture
      </Button>
      <Button variant="ghost" onClick={() => fileInput.current?.click()}>Upload photo</Button>
      <input ref={fileInput} type="file" accept="image/*" aria-label="Upload card photo" className="hidden" onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = ''; if (file) open(file);
      }} />
    </div>
    <p className="text-[11px] text-muted">One card at a time. Fill the frame, avoid glare, then confirm the match.</p>
    {notice && <p role="status" className="text-xs text-muted rounded-lg border border-line p-2">{notice}</p>}
    {session && <PhotoSession key={session.key} file={session.file} onClose={() => setSession(null)} onPhoto={(file) => open(file)} onAdd={(card, warning) => {
      onAdd(card); setNotice(warning ?? `${card.name} added with its catalog price.`); setSession(null);
    }} />}
  </div>;
}

function PhotoSession({ file, onClose, onPhoto, onAdd }: {
  file: File | null; onClose: () => void; onPhoto: (file: File) => void; onAdd: (card: CardSummary, warning: string | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(false);
  const priceRequest = useRef<AbortController | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [status, setStatus] = useState(file ? 'Loading card scanner…' : '');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [resolving, setResolving] = useState<string | null>(null);
  const tcg = useActiveTcg();

  useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    return () => { alive.current = false; priceRequest.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let url = '';
    void (async () => {
      let image: ImageBitmap | undefined;
      try {
        if (!file.type.startsWith('image/')) throw new Error('Choose a card photo in JPEG, PNG or WebP format.');
        if (file.size > 20 * 1024 * 1024) throw new Error('This photo is too large. Choose one smaller than 20 MB.');
        url = URL.createObjectURL(file); setPreview(url);
        const engine = await getScanEngine();
        if (cancelled) return;
        if (engine.status !== 'ready') throw new Error(engine.error ?? 'The card scanner is unavailable. Please retry.');
        setStatus('Reading your photo…');
        try { image = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
        catch { throw new Error('Could not read this photo. Try a JPEG, PNG or WebP image.'); }
        if (cancelled) return;
        if (image.width * image.height > 60_000_000) throw new Error('This photo is too large to scan. Use a smaller image.');
        setStatus('Identifying your card…');
        const found = await engine.match(preprocess(image), 5, tcg === 'all' ? undefined : tcg);
        if (!cancelled) { setMatches(found.slice(0, 5)); setStatus(''); }
      } catch (cause) {
        if (!cancelled) { setError(cause instanceof Error ? cause.message : 'Could not scan this photo. Please retry.'); setStatus(''); }
      } finally { image?.close(); }
    })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [file, tcg]);

  async function choose(match: Match) {
    if (resolving) return;
    setError(''); setResolving(match.card.id);
    const controller = new AbortController();
    priceRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`/api/card-show/lookup?id=${encodeURIComponent(match.card.id)}`, { signal: controller.signal });
      const data = await response.json();
      if (!alive.current) return;
      if (!response.ok) throw new Error(data.error ?? 'Could not load the market price. Please retry.');
      const card = data.card as CardSummary | undefined;
      if (!card?.price || !Number.isFinite(card.price.amount) || card.price.amount <= 0) throw new Error('Card identified, but a market price is not available for this printing. Try another match or retry later.');
      onAdd(card, typeof data.warning === 'string' ? data.warning : null);
    } catch (cause) {
      if (alive.current) setError(controller.signal.aborted ? 'The price lookup timed out. Tap the card to retry.' : cause instanceof Error ? cause.message : 'Could not load the card price. Please retry.');
    } finally {
      clearTimeout(timeout);
      if (alive.current) setResolving(null);
    }
  }

  return <dialog ref={dialog} aria-label="Add a card from a photo" onCancel={(event) => { event.preventDefault(); onClose(); }} className="m-0 p-0 w-screen h-dvh max-w-none max-h-none bg-bg text-fg backdrop:bg-black/80">
    {!file && <Scanner paused={matches !== null} onMatches={(found) => { setMatches(found.slice(0, 5)); setError(''); }} onClose={onClose} />}
    {(file || matches !== null) && <div className="fixed inset-0 z-[60] bg-bg flex flex-col">
      <header className="p-4 border-b border-line flex items-center justify-between gap-3 shrink-0">
        <div><h2 className="font-semibold">{matches?.length ? 'Confirm your card' : 'Scan a card photo'}</h2><p className="text-xs text-muted mt-1">Check the exact set, number and language.</p></div>
        <button type="button" aria-label="Close photo scanner" className="rounded-lg border border-line px-3 py-2 text-sm" onClick={onClose}>Close</button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 w-full max-w-lg mx-auto">
        {preview && <div className="flex justify-center">{/* Local blob preview cannot be optimized by the Next.js image server. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Your card photo" className="max-h-48 max-w-full rounded-xl object-contain" />
        </div>}
        {status && <p role="status" className="text-sm text-muted text-center py-4">{status}</p>}
        {error && <p role="alert" className="rounded-xl border border-down/30 bg-down/10 p-3 text-sm text-down">{error}</p>}
        {matches && matches.length === 0 && <p role="status" className="text-sm text-muted">No matching cards found. Try a clearer photo with one card filling the frame.</p>}
        {matches && matches[0]?.score < 0.65 && <p className="text-sm text-muted">This match is uncertain. Retake the photo if the exact card is not listed.</p>}
        <div className="space-y-2">
          {matches?.map((match, index) => <button type="button" key={`${match.card.id}:${index}`} disabled={resolving !== null} onClick={() => void choose(match)} className="w-full rounded-xl border border-line p-4 text-left hover:border-accent disabled:opacity-50">
            <span className="flex justify-between gap-3"><span className="text-sm font-semibold">{match.card.name ?? 'Unknown card'}</span><span className="text-xs text-muted shrink-0">{Math.round(match.score * 100)}% match</span></span>
            <span className="block text-xs text-muted mt-1">{match.card.setName ?? match.card.set ?? 'Unknown set'} · #{match.card.num ?? '—'} · {match.card.lang?.toUpperCase() ?? '—'}</span>
            <span className="block text-xs text-accent mt-2">{resolving === match.card.id ? 'Looking up market price…' : 'Use this card and look up its price'}</span>
          </button>)}
        </div>
      </div>
      <footer className="p-4 border-t border-line flex gap-3 justify-center shrink-0 pb-[max(env(safe-area-inset-bottom),16px)]">
        {!file && <Button variant="ghost" disabled={resolving !== null} onClick={() => { setMatches(null); setError(''); }}>Retake picture</Button>}
        <label className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold border border-line cursor-pointer">Choose another photo<input type="file" accept="image/*" className="sr-only" aria-label="Choose another card photo" onChange={(event) => { const next = event.target.files?.[0]; if (next) onPhoto(next); }} /></label>
      </footer>
    </div>}
  </dialog>;
}
