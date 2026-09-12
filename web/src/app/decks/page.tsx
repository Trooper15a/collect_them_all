"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { showToast } from "@/components/Toast";
import { Button, Empty, Segmented, Skeleton, inputCls } from "@/components/ui";
import { haptic } from "@/lib/haptics";

type Tab = "browse" | "my-decks" | "import";

interface Tournament {
  id: string;
  name: string;
  date: string;
  players: number;
  format?: string;
}

interface Standing {
  player: string;
  name: string;
  placing: number;
  record: { wins: number; losses: number; ties: number };
  decklist: { name: string; count: number; set?: string; number?: string }[] | null;
  deck?: { id: string; name: string } | null;
}

interface SavedDeck {
  id: number;
  tcg: string;
  name: string;
  source: string;
  author: string | null;
  placing: number | null;
  tournamentName: string | null;
  format: string | null;
  createdAt: string;
}

export default function DecksPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user;
  const [tab, setTab] = useState<Tab>("browse");
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [loadingTournaments, setLoadingTournaments] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [standings, setStandings] = useState<Standing[] | null>(null);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [myDecks, setMyDecks] = useState<SavedDeck[] | null>(null);
  const [loadingMyDecks, setLoadingMyDecks] = useState(false);
  const [ydkText, setYdkText] = useState("");
  const [ydkName, setYdkName] = useState("");
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const loadTournaments = useCallback(async () => {
    setLoadingTournaments(true);
    try {
      const r = await fetch("/api/decks/limitless?limit=20");
      const d = await r.json();
      setTournaments(d.tournaments ?? []);
    } catch {
      showToast("Failed to load tournaments", "down");
    } finally {
      setLoadingTournaments(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "browse" && !tournaments) loadTournaments();
  }, [tab, tournaments, loadTournaments]);

  const loadMyDecks = useCallback(async () => {
    setLoadingMyDecks(true);
    try {
      const r = await fetch("/api/decks");
      const d = await r.json();
      setMyDecks(d.decks ?? []);
    } catch {
      showToast("Failed to load decks", "down");
    } finally {
      setLoadingMyDecks(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "my-decks" && isLoggedIn && !myDecks) loadMyDecks();
  }, [tab, isLoggedIn, myDecks, loadMyDecks]);

  async function openTournament(t: Tournament) {
    setSelectedTournament(t);
    setLoadingStandings(true);
    try {
      const r = await fetch(`/api/decks/limitless?tournament=${t.id}&top=8`);
      const d = await r.json();
      setStandings(d.standings ?? []);
    } catch {
      showToast("Failed to load decklists", "down");
    } finally {
      setLoadingStandings(false);
    }
  }

  async function saveLimitlessDeck(s: Standing, t: Tournament) {
    if (!isLoggedIn) { showToast("Sign in to save decks", "info"); return; }
    const key = `${t.id}-${s.placing}`;
    if (saving === key) return;
    setSaving(key);
    haptic("medium");
    try {
      const r = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "limitless",
          tcg: "pokemon",
          name: s.deck?.name ?? `${s.name}'s deck`,
          format: t.format,
          author: s.name,
          placing: s.placing,
          tournamentName: t.name,
          sourceUrl: `https://play.limitlesstcg.com/tournament/${t.id}`,
          standing: s,
        }),
      });
      if (!r.ok) throw new Error("Save failed");
      showToast("Deck saved!", "up");
      setMyDecks(null);
    } catch {
      showToast("Failed to save deck", "down");
    } finally {
      setSaving(null);
    }
  }

  async function importYDK() {
    if (!isLoggedIn) { showToast("Sign in to import decks", "info"); return; }
    if (!ydkText.trim()) return;
    setImporting(true);
    haptic("medium");
    try {
      const r = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "ydk",
          tcg: "yugioh",
          name: ydkName.trim() || "Imported YDK Deck",
          ydkText,
        }),
      });
      if (!r.ok) throw new Error("Import failed");
      showToast("Deck imported!", "up");
      setYdkText("");
      setYdkName("");
      setMyDecks(null);
      setTab("my-decks");
    } catch {
      showToast("Failed to import deck", "down");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <header className="pt-2 pb-3 anim-widget d1">
        <h1 className="text-xl font-bold uppercase tracking-wider">Deck Builder</h1>
        <p className="text-sm text-muted mt-1">Browse tournament decks or import your own. See what you own and what you need.</p>
      </header>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "browse", label: "Browse" },
          { value: "my-decks", label: "My Decks" },
          { value: "import", label: "Import" },
        ]}
      />

      <div className="mt-4">
        {/* ── Browse Limitless Tournaments ── */}
        {tab === "browse" && !selectedTournament && (
          <>
            <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Pokemon Tournaments (Limitless TCG)</div>
            {loadingTournaments && (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
              </div>
            )}
            {tournaments && tournaments.length === 0 && <Empty>No tournaments found.</Empty>}
            {tournaments && tournaments.length > 0 && (
              <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden stagger-children">
                {tournaments.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => openTournament(t)} className="w-full p-3 text-left hover:bg-white/[0.03] tap-scale">
                      <div className="font-medium text-sm">{t.name}</div>
                      <div className="text-xs text-muted mt-0.5">
                        {t.date} · {t.players} players{t.format ? ` · ${t.format}` : ""}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* ── Tournament Standings / Decklists ── */}
        {tab === "browse" && selectedTournament && (
          <>
            <button onClick={() => { setSelectedTournament(null); setStandings(null); }} className="text-xs text-accent font-semibold mb-3 flex items-center gap-1">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
              Back to tournaments
            </button>
            <div className="card-surface rounded-2xl p-4 mb-4">
              <div className="font-semibold">{selectedTournament.name}</div>
              <div className="text-xs text-muted">{selectedTournament.date} · {selectedTournament.players} players</div>
            </div>
            {loadingStandings && (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
              </div>
            )}
            {standings && standings.length === 0 && <Empty>No decklists available for this tournament.</Empty>}
            {standings && standings.length > 0 && (
              <ul className="space-y-3 stagger-children">
                {standings.map((s) => (
                  <li key={s.placing} className="card-surface rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold bg-accent/20 text-accent px-2 py-0.5 rounded-full">#{s.placing}</span>
                          <span className="font-semibold text-sm">{s.deck?.name ?? "Unknown Deck"}</span>
                        </div>
                        <div className="text-xs text-muted mt-0.5">{s.name} · {s.record.wins}W-{s.record.losses}L-{s.record.ties}T</div>
                      </div>
                      <Button
                        className="text-xs !py-1.5 !px-3"
                        disabled={saving === `${selectedTournament.id}-${s.placing}`}
                        onClick={() => saveLimitlessDeck(s, selectedTournament)}
                      >
                        {saving === `${selectedTournament.id}-${s.placing}` ? "Saving…" : "Save Deck"}
                      </Button>
                    </div>
                    {s.decklist && (
                      <div className="text-xs text-muted mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
                        {s.decklist.map((c, i) => (
                          <div key={i} className="truncate">{c.count}x {c.name}</div>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* ── My Saved Decks ── */}
        {tab === "my-decks" && (
          <>
            {!isLoggedIn && (
              <div className="card-surface rounded-2xl p-6 text-center">
                <div className="font-semibold mb-2">Sign in to save decks</div>
                <Link href="/login" className="text-sm text-accent font-semibold">Sign in</Link>
              </div>
            )}
            {isLoggedIn && loadingMyDecks && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
              </div>
            )}
            {isLoggedIn && myDecks && myDecks.length === 0 && (
              <Empty>No saved decks yet. Browse tournaments or import a deck to get started.</Empty>
            )}
            {isLoggedIn && myDecks && myDecks.length > 0 && (
              <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden stagger-children">
                {myDecks.map((d) => (
                  <li key={d.id}>
                    <Link href={`/decks/${d.id}`} className="flex items-center gap-3 p-3 hover:bg-white/[0.03] tap-scale">
                      <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
                        {d.tcg === "pokemon" ? "PK" : d.tcg === "yugioh" ? "YG" : d.tcg.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{d.name}</div>
                        <div className="text-xs text-muted truncate">
                          {d.author && `by ${d.author} · `}
                          {d.placing && `#${d.placing} · `}
                          {d.tournamentName ?? d.source}
                        </div>
                      </div>
                      <svg viewBox="0 0 24 24" className="w-4 h-4 text-muted" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* ── Import YDK ── */}
        {tab === "import" && (
          <div className="space-y-4">
            <div className="card-surface rounded-2xl p-4">
              <div className="text-sm font-semibold mb-1">Yu-Gi-Oh — YDK Import</div>
              <p className="text-xs text-muted mb-3">
                Paste the contents of a .ydk file (exported from YGOPro, EDOPro, Master Duel, or any deck builder).
              </p>
              <input
                className={`${inputCls} mb-2`}
                placeholder="Deck name"
                value={ydkName}
                onChange={(e) => setYdkName(e.target.value)}
              />
              <textarea
                className={`${inputCls} min-h-[120px] font-mono text-xs`}
                placeholder={"#main\n46986414\n89631139\n...\n#extra\n...\n!side\n..."}
                value={ydkText}
                onChange={(e) => setYdkText(e.target.value)}
              />
              <Button
                className="w-full mt-3"
                disabled={importing || !ydkText.trim() || !isLoggedIn}
                onClick={importYDK}
              >
                {!isLoggedIn ? "Sign in to import" : importing ? "Importing…" : "Import Deck"}
              </Button>
            </div>

            <div className="card-surface rounded-2xl p-4">
              <div className="text-sm font-semibold mb-1">Where to get YDK files</div>
              <ul className="text-xs text-muted space-y-1.5 mt-2">
                <li>YGOPro / EDOPro — Export deck as .ydk file</li>
                <li>Master Duel Meta — Copy deck code, convert to YDK</li>
                <li>DuelingBook — Export deck, paste the text</li>
                <li>YGOProDeck — "Export" button on any deck page</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
