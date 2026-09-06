"use client";

import { useState } from "react";
import { Button, Segmented, inputCls } from "@/components/ui";

type Category = "all" | "sealed" | "singles" | "retail" | "tools";
type Country = "us" | "ca";

interface Store {
  name: string;
  url: string;
  location: string;
  tags: string[];
  sealed?: string;
  singles?: string;
  search?: string;
  freeShip?: string;
  note?: string;
}

/* ── Canada ── */

const CA_RETAIL: Store[] = [
  { name: "Pokemon Center CA", url: "https://www.pokemoncenter.com/en-ca", location: "Official", tags: ["sealed", "retail"], sealed: "https://www.pokemoncenter.com/en-ca/category/booster-packs", note: "Always MSRP" },
  { name: "Walmart Canada", url: "https://www.walmart.ca/en/browse/toys/trading-cards/pokemon-cards/10011_31745_6000204969672", location: "Nationwide", tags: ["sealed", "retail"], sealed: "https://www.walmart.ca/en/browse/toys/trading-cards/pokemon-cards/pokemon-booster-blister-packs/10011_31745_6000204969672_6000203427077", note: "MSRP, packs/ETBs/bundles" },
  { name: "Best Buy Canada", url: "https://www.bestbuy.ca/en-ca/shop/toys-games-education/pokemon-booster-box", location: "Nationwide", tags: ["sealed", "retail"], sealed: "https://www.bestbuy.ca/en-ca/shop/toys-games-education/pokemon-booster-box", note: "Booster boxes & ETBs" },
  { name: "Costco Canada", url: "https://www.costco.ca", location: "Nationwide", tags: ["sealed", "retail"], search: "https://www.costco.ca/CatalogSearch?dept=All&keyword=pokemon", note: "Exclusive bundles, best value/pack. Membership required" },
  { name: "EB Games / GameStop CA", url: "https://www.ebgames.ca/shop/category/trading-cards-168", location: "Nationwide", tags: ["sealed", "retail"], sealed: "https://www.ebgames.ca/shop/category/trading-cards-168", note: "Sealed packs & tins, in-store pickup" },
  { name: "Mastermind Toys", url: "https://www.mastermindtoys.com/collections/pokemon-cards", location: "Nationwide", tags: ["sealed", "retail"], sealed: "https://www.mastermindtoys.com/collections/pokemon-cards", note: "MSRP packs, tins, bundles" },
  { name: "Indigo / Chapters", url: "https://www.indigo.ca/en-ca/search?q=pokemon+cards", location: "Nationwide", tags: ["sealed", "retail"], search: "https://www.indigo.ca/en-ca/search?q=pokemon+cards", note: "Packs, tins, bundles" },
  { name: "London Drugs", url: "https://www.londondrugs.com/category/pokemon/c/1622", location: "Western Canada", tags: ["sealed", "retail"], sealed: "https://www.londondrugs.com/category/pokemon/c/1622", note: "MSRP sealed packs" },
  { name: "Toys R Us Canada", url: "https://www.toysrus.ca", location: "Nationwide", tags: ["sealed", "retail"], search: "https://www.toysrus.ca/search?q=pokemon", note: "Packs & bundles" },
];

const CA_SPECIALTY: Store[] = [
  { name: "401 Games", url: "https://store.401games.ca", location: "Toronto", tags: ["sealed", "singles"], sealed: "https://store.401games.ca/collections/pokemon-sealed-product", singles: "https://store.401games.ca/collections/pokemon-singles", search: "https://store.401games.ca/pages/search-results?q=", note: "46k+ singles, sealed, graded" },
  { name: "Hobbiesville", url: "https://hobbiesville.com", location: "Ottawa / Toronto", tags: ["sealed", "singles"], sealed: "https://hobbiesville.com/collections/pokemon-booster-boxes", singles: "https://hobbiesville.com/collections/pokemon-trading-cards", search: "https://hobbiesville.com/search?q=", freeShip: "$175+", note: "Largest CA selection" },
  { name: "Face to Face Games", url: "https://facetofacegames.com", location: "Multi-city", tags: ["sealed", "singles"], sealed: "https://facetofacegames.com/en-us/collections/pokemon-sealed", singles: "https://facetofacegames.com/en-us/collections/pokemon-singles", search: "https://facetofacegames.com/en-us/search?q=", note: "Largest CA TCG retailer, buylist" },
  { name: "Deck Out Gaming", url: "https://deckoutgaming.ca", location: "Canada", tags: ["sealed", "singles"], sealed: "https://deckoutgaming.ca/collections/pokemon-sealed", singles: "https://deckoutgaming.ca/collections/pokemon-english-sealed", search: "https://deckoutgaming.ca/search?q=", note: "EN + JP singles & sealed" },
  { name: "PokeChalet", url: "https://pokechalet.com", location: "Canada", tags: ["sealed", "singles"], sealed: "https://pokechalet.com/en-us/collections/booster-boxes", search: "https://pokechalet.com/en-us/search?q=", note: "Fast shipping, great service" },
  { name: "Poke Jeux", url: "https://www.pokejeux.ca", location: "Quebec", tags: ["sealed", "singles"], search: "https://www.pokejeux.ca/search?q=", freeShip: "$200+", note: "Singles + sealed, bilingual" },
  { name: "Danireon", url: "https://www.danireon.com", location: "Ottawa", tags: ["sealed", "singles"], search: "https://www.danireon.com/en-us/search?q=", note: "150k+ singles, ships Canada-wide" },
  { name: "Catcha Card", url: "https://catchacard.ca", location: "Canada", tags: ["sealed", "singles"], search: "https://catchacard.ca/search?q=", note: "Competitive pricing" },
  { name: "SP Shop", url: "https://www.spshop.ca", location: "Canada", tags: ["sealed", "singles"], search: "https://www.spshop.ca/search?q=", note: "StarterPokemon's shop" },
  { name: "Remi Card Trader", url: "https://remicardtrader.ca", location: "Quebec", tags: ["sealed", "singles"], sealed: "https://remicardtrader.ca/en/collections/cartes-pokemon", search: "https://remicardtrader.ca/en/search?q=", freeShip: "$175+", note: "Rare singles, boxes" },
  { name: "ZardoCards", url: "https://zardocards.com", location: "Canada", tags: ["sealed", "singles"], search: "https://zardocards.com/search?q=", note: "Premium authentic products" },
  { name: "Doe's Cards", url: "https://doescards.ca", location: "Brampton", tags: ["sealed", "singles"], search: "https://doescards.ca/search?q=", note: "Free shipping options" },
  { name: "Emmett's ToyStop", url: "https://emmettstoystop.com", location: "Toronto", tags: ["sealed"], search: "https://emmettstoystop.com/search?q=", note: "Free shipping across Canada" },
  { name: "TonkaTom's TCG Station", url: "https://tonkatomstcgstation.ca", location: "Canada", tags: ["sealed", "singles"], search: "https://tonkatomstcgstation.ca/search?q=", note: "EN + JP sealed, new cards daily" },
  { name: "Tistaminis", url: "https://tistaminis.com", location: "Hamilton", tags: ["sealed", "singles"], sealed: "https://tistaminis.com/collections/pokemon", search: "https://tistaminis.com/search?q=", note: "Full TCG range" },
  { name: "Fine Toys", url: "https://www.finetoys.ca", location: "Toronto", tags: ["sealed"], sealed: "https://www.finetoys.ca/collections/pokemon-booster-boxes", search: "https://www.finetoys.ca/search?q=", note: "Sealed only, 100% factory sealed" },
  { name: "Poke Therapy", url: "https://poketherapy.com", location: "Canada", tags: ["sealed", "singles"], search: "https://poketherapy.com/search?q=", note: "Japanese imports specialist" },
  { name: "GamesLand", url: "https://gamesland.ca", location: "Edmonton", tags: ["sealed", "singles"], sealed: "https://gamesland.ca/collections/all-pokemon", search: "https://gamesland.ca/search?q=", note: "TCG + sports cards" },
  { name: "Zephyr Epic", url: "https://zephyrepic.com", location: "Canada", tags: ["sealed", "singles"], sealed: "https://zephyrepic.com/shop/category/trading-card-games/", note: "TCG + sports cards" },
  { name: "Common Box Games", url: "https://commonboxgames.com", location: "Edmonton", tags: ["sealed", "singles"], search: "https://commonboxgames.com/search?q=", note: "Singles + sealed" },
  { name: "Eclipse Games", url: "https://eclipsegames.ca", location: "Edmonton", tags: ["sealed"], search: "https://eclipsegames.ca/search?q=", note: "Family-friendly sealed products" },
  { name: "Infinity Cards", url: "https://infinitycards.ca", location: "Fraser Valley, BC", tags: ["sealed", "singles"], search: "https://infinitycards.ca/search?q=", note: "TCG + collectibles" },
  { name: "Pop Collectibles", url: "https://popcollectibles.ca", location: "Canada", tags: ["sealed"], search: "https://popcollectibles.ca/search?q=", note: "Costco-exclusive bundles" },
];

const CA_TOOLS: Store[] = [
  { name: "TrackaCard", url: "https://trackacard.ca", location: "Canada", tags: ["tools"], note: "Compare prices across 35+ CA stores, price alerts" },
  { name: "TCG Archives", url: "https://marketplace.tcgarchives.ca", location: "Canada", tags: ["tools"], note: "P2P marketplace, no commission, ID-verified" },
];

/* ── United States ── */

const US_RETAIL: Store[] = [
  { name: "Pokemon Center US", url: "https://www.pokemoncenter.com", location: "Official", tags: ["sealed", "retail"], sealed: "https://www.pokemoncenter.com/category/booster-packs", note: "Always MSRP, exclusive promos" },
  { name: "Target", url: "https://www.target.com/c/pokemon-trading-cards/-/N-hj0av", location: "Nationwide", tags: ["sealed", "retail"], sealed: "https://www.target.com/c/pokemon-trading-cards/-/N-hj0av", note: "MSRP sealed, in-store & online" },
  { name: "Walmart US", url: "https://www.walmart.com/browse/pokemon-trading-cards/8933968_3735623_4013989", location: "Nationwide", tags: ["sealed", "retail"], sealed: "https://www.walmart.com/browse/pokemon-trading-cards/8933968_3735623_4013989", note: "MSRP packs, ETBs, bundles" },
  { name: "Best Buy US", url: "https://www.bestbuy.com/site/trading-cards/pokemon-trading-cards/pcmcat1606830050498.c", location: "Nationwide", tags: ["sealed", "retail"], sealed: "https://www.bestbuy.com/site/trading-cards/pokemon-trading-cards/pcmcat1606830050498.c", note: "Booster boxes & ETBs" },
  { name: "Costco US", url: "https://www.costco.com", location: "Nationwide", tags: ["sealed", "retail"], search: "https://www.costco.com/CatalogSearch?dept=All&keyword=pokemon", note: "Exclusive bundles, best value/pack. Membership required" },
  { name: "GameStop US", url: "https://www.gamestop.com/shop/trading-cards/pokemon-trading-cards", location: "Nationwide", tags: ["sealed", "retail"], sealed: "https://www.gamestop.com/shop/trading-cards/pokemon-trading-cards", note: "Sealed packs, tins, in-store pickup" },
  { name: "Amazon US", url: "https://www.amazon.com/s?k=pokemon+tcg+booster+box", location: "Nationwide", tags: ["sealed", "retail"], search: "https://www.amazon.com/s?k=pokemon+tcg+", note: "Wide selection, check seller ratings" },
  { name: "Walgreens", url: "https://www.walgreens.com", location: "Nationwide", tags: ["sealed", "retail"], search: "https://www.walgreens.com/search/results.jsp?Ntt=pokemon+cards", note: "Exclusive packs & tins" },
  { name: "Dollar Tree", url: "https://www.dollartree.com", location: "Nationwide", tags: ["sealed", "retail"], search: "https://www.dollartree.com/searchresults?Ntt=pokemon", note: "$1.25 mini packs (3 cards)" },
];

const US_SPECIALTY: Store[] = [
  { name: "TCGPlayer", url: "https://www.tcgplayer.com", location: "Online marketplace", tags: ["sealed", "singles"], sealed: "https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&view=grid&ProductTypeName=Booster%20Box", singles: "https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&view=grid", search: "https://www.tcgplayer.com/search/pokemon/product?q=", freeShip: "$5+ (Direct)", note: "Largest TCG marketplace, price tracking, verified sellers" },
  { name: "Card Kingdom", url: "https://www.cardkingdom.com", location: "Seattle, WA", tags: ["sealed", "singles"], sealed: "https://www.cardkingdom.com/purchasing/mtg_sealed", singles: "https://www.cardkingdom.com/pokemon", search: "https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=", note: "Top reputation, instant buylist" },
  { name: "ChannelFireball", url: "https://www.channelfireball.com", location: "Online", tags: ["sealed", "singles"], sealed: "https://www.channelfireball.com/collections/pokemon-sealed-product", singles: "https://www.channelfireball.com/collections/pokemon-singles", search: "https://www.channelfireball.com/search?q=", note: "Major TCG retailer, events" },
  { name: "Troll and Toad", url: "https://www.trollandtoad.com", location: "Kentucky", tags: ["sealed", "singles"], sealed: "https://www.trollandtoad.com/pokemon/7085", singles: "https://www.trollandtoad.com/pokemon/7085", search: "https://www.trollandtoad.com/category.php?selected-cat=7085&search-words=", freeShip: "$35+", note: "Huge inventory, graded cards, buylist" },
  { name: "Safari Zone", url: "https://safarizone.co", location: "Online", tags: ["sealed", "singles"], sealed: "https://safarizone.co/collections/pokemon-sealed-products", singles: "https://safarizone.co/collections/pokemon-singles", search: "https://safarizone.co/search?q=", note: "EN + JP specialist, competitive prices" },
  { name: "Smoke and Mirrors Hobby", url: "https://smokeandmirrorshobby.com", location: "Online", tags: ["sealed", "singles"], sealed: "https://smokeandmirrorshobby.com/collections/pokemon", search: "https://smokeandmirrorshobby.com/search?q=", note: "Below-MSRP sealed products" },
  { name: "Dave & Adam's", url: "https://www.dacardworld.com", location: "New York", tags: ["sealed", "singles"], sealed: "https://www.dacardworld.com/gaming/pokemon", search: "https://www.dacardworld.com/search?q=", freeShip: "$199+", note: "Major distributor, cases & boxes" },
  { name: "Collector's Cache", url: "https://collectorscache.com", location: "Kansas", tags: ["sealed", "singles"], sealed: "https://collectorscache.com/collections/pokemon-sealed", singles: "https://collectorscache.com/collections/pokemon-singles", search: "https://collectorscache.com/search?q=", note: "Singles + sealed, buylist" },
  { name: "Full Grip Games", url: "https://fullgripgames.com", location: "Ohio", tags: ["sealed", "singles"], sealed: "https://fullgripgames.com/collections/pokemon-sealed-products", singles: "https://fullgripgames.com/collections/pokemon-singles", search: "https://fullgripgames.com/search?q=", note: "Large singles inventory" },
  { name: "PokeVault", url: "https://pokevault.com", location: "Online", tags: ["sealed", "singles"], search: "https://pokevault.com/search.php?search_query=", note: "Japanese cards & accessories specialist" },
  { name: "PlazaJapan", url: "https://www.plazajapan.com", location: "Japan → US", tags: ["sealed"], sealed: "https://www.plazajapan.com/c/tcg/pokemon/", search: "https://www.plazajapan.com/search.html?search=pokemon+", note: "Authentic JP sealed, ships to US" },
  { name: "Gamenerdz", url: "https://www.gamenerdz.com", location: "Online", tags: ["sealed"], sealed: "https://www.gamenerdz.com/pokemon", search: "https://www.gamenerdz.com/search?q=", freeShip: "$75+", note: "Daily deals, competitive sealed prices" },
  { name: "Zulu's Board Game Cafe", url: "https://zulusgames.com", location: "Washington", tags: ["sealed", "singles"], search: "https://zulusgames.com/search?q=", note: "Local shop with online store" },
  { name: "TCG Stadium", url: "https://tcgstadium.com", location: "Online", tags: ["sealed", "singles"], sealed: "https://tcgstadium.com/collections/pokemon-sealed", singles: "https://tcgstadium.com/collections/pokemon-singles", search: "https://tcgstadium.com/search?q=", note: "Fast shipping, EN + JP" },
  { name: "CardShop Live", url: "https://cardshoplive.com", location: "Online", tags: ["sealed", "singles"], search: "https://cardshoplive.com/search?q=", note: "Live breaks & sealed products" },
];

const US_TOOLS: Store[] = [
  { name: "TCGPlayer Market", url: "https://www.tcgplayer.com", location: "USA", tags: ["tools"], note: "Price tracking, market data, seller comparison" },
  { name: "PriceCharting", url: "https://www.pricecharting.com/category/pokemon-cards", location: "USA", tags: ["tools"], note: "Historical price trends, graded card values" },
];

interface RestockAlert {
  name: string;
  url: string;
  join: string;
  note: string;
  stores: string;
  via: string;
  free?: boolean;
  price?: string;
  country: Country | "both";
}

const RESTOCK_ALERTS: RestockAlert[] = [
  {
    name: "Pokennoisseur",
    url: "https://pokennoisseur.ca",
    join: "https://discord.com/servers/pokennoisseur-canada-pokemon-tcg-restock-alerts-1501295390161633482",
    note: "Canada-specific. Tracks 165+ Canadian card shops and major retailers in real time, prices in CAD.",
    stores: "Walmart, Best Buy, Pokemon Center, EB Games, Costco, 160+ local shops across every province",
    via: "Discord",
    free: true,
    country: "ca",
  },
  {
    name: "TrackaLacker",
    url: "https://www.trackalacker.com",
    join: "https://www.trackalacker.com",
    note: "Free app with push notifications. 150k+ users. Checks hot items every few seconds.",
    stores: "Pokemon Center, Walmart, Best Buy, Costco, GameStop, Target + CA coverage",
    via: "iOS / Android app + Discord",
    free: true,
    country: "both",
  },
  {
    name: "PokeToolz",
    url: "https://www.poketoolz.com",
    join: "https://www.poketoolz.com",
    note: "Canada's #1 restock alert service with auto-checkout support.",
    stores: "Major Canadian retailers + local shops",
    via: "Discord",
    price: "Paid",
    country: "ca",
  },
  {
    name: "PokeScan",
    url: "https://mypokescan.com",
    join: "https://mypokescan.com",
    note: "Monitors 100+ stores across US, Canada, UK, EU, Australia & Japan.",
    stores: "100+ stores including Target, Walmart, Best Buy, GameStop, Pokemon Center",
    via: "Discord",
    price: "$8.99/mo",
    country: "both",
  },
  {
    name: "PokeNotify",
    url: "https://www.pokenotify.com",
    join: "https://www.pokenotify.com",
    note: "Native app with ZIP/postal code in-store alerts. 20k+ members.",
    stores: "Multi-region including US & Canada",
    via: "iOS / Android app + Discord",
    price: "Paid",
    country: "both",
  },
  {
    name: "Stock Informer",
    url: "https://www.stockinformer.com/checker-pokemon-tcg",
    join: "https://www.stockinformer.com",
    note: "US-focused restock tracker for major retailers. Free browser alerts.",
    stores: "Target, Walmart, Best Buy, Amazon, GameStop, Pokemon Center",
    via: "Browser + Email",
    free: true,
    country: "us",
  },
];

const COUNTRY_DATA = {
  us: { retail: US_RETAIL, specialty: US_SPECIALTY, tools: US_TOOLS, label: "Shop USA", sub: "US stores only. Prices in USD.", currency: "USD" },
  ca: { retail: CA_RETAIL, specialty: CA_SPECIALTY, tools: CA_TOOLS, label: "Shop Canada", sub: "Canadian stores only. No customs, no duties, prices in CAD.", currency: "CAD" },
} as const;


export default function ShopPage() {
  const [country, setCountry] = useState<Country>("us");
  const [cat, setCat] = useState<Category>("all");
  const [q, setQ] = useState("");

  const data = COUNTRY_DATA[country];
  const RETAIL = data.retail;
  const SPECIALTY = data.specialty;
  const TOOLS = data.tools;

  const allStores = [...RETAIL, ...SPECIALTY];
  const filtered = cat === "all" ? allStores
    : cat === "sealed" ? allStores.filter((s) => s.tags.includes("sealed"))
    : cat === "singles" ? allStores.filter((s) => s.tags.includes("singles"))
    : cat === "retail" ? RETAIL
    : TOOLS;

  const alerts = RESTOCK_ALERTS.filter((a) => a.country === country || a.country === "both");

  function searchStores() {
    if (!q.trim()) return;
    const term = encodeURIComponent(q.trim());
    const urls = SPECIALTY.filter((s) => s.search).map((s) => s.search + term);
    urls.forEach((u) => window.open(u, "_blank"));
  }

  return (
    <div className="pb-24">
      <header className="pt-2 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{data.label}</h1>
            <p className="text-xs text-muted mt-1">{data.sub}</p>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-line">
            <button
              onClick={() => setCountry("us")}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${country === "us" ? "bg-accent text-white" : "text-muted hover:text-fg"}`}
            >
              🇺🇸 US
            </button>
            <button
              onClick={() => setCountry("ca")}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${country === "ca" ? "bg-accent text-white" : "text-muted hover:text-fg"}`}
            >
              🇨🇦 CA
            </button>
          </div>
        </div>
      </header>

      <div className="flex gap-2">
        <input
          className={inputCls}
          placeholder="Search all stores for a card or product..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchStores()}
          enterKeyHint="search"
        />
        <Button onClick={searchStores} disabled={!q.trim()}>
          Search
        </Button>
      </div>
      <p className="text-[10px] text-muted mt-1">Opens search results across all specialty stores at once.</p>

      <div className="mt-4">
        <Segmented
          value={cat}
          onChange={setCat}
          size="xs"
          options={[
            { value: "all", label: "All" },
            { value: "sealed", label: "Sealed" },
            { value: "singles", label: "Singles" },
            { value: "retail", label: "Big Box" },
            { value: "tools", label: "Tools" },
          ]}
        />
      </div>

      {(cat === "all" || cat === "retail") && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Big box retailers (MSRP)</h2>
          <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden">
            {RETAIL.map((s) => (
              <StoreRow key={s.name} store={s} />
            ))}
          </ul>
        </section>
      )}

      {(cat === "all" || cat === "sealed" || cat === "singles") && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Specialty card shops</h2>
          <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden">
            {(cat === "singles" ? SPECIALTY.filter((s) => s.tags.includes("singles")) : SPECIALTY).map((s) => (
              <StoreRow key={s.name} store={s} />
            ))}
          </ul>
        </section>
      )}

      {(cat === "all" || cat === "tools") && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Marketplaces & tools</h2>
          <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden">
            {TOOLS.map((s) => (
              <StoreRow key={s.name} store={s} />
            ))}
          </ul>
        </section>
      )}

      {(cat === "all" || cat === "tools") && alerts.length > 0 && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Restock alerts</h2>
          <p className="text-xs text-muted mb-3">Get notified the moment stores restock Pokemon products. These services monitor store websites 24/7 so you never miss a drop.</p>
          <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden">
            {alerts.map((a) => (
              <li key={a.name} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-sm text-accent hover:underline">
                      {a.name}
                    </a>
                    {a.free && <span className="ml-2 text-[10px] font-semibold text-up bg-up/10 px-1.5 py-0.5 rounded">FREE</span>}
                    {a.price && <span className="ml-2 text-[10px] text-muted">{a.price}</span>}
                    <div className="text-xs text-muted/70 mt-0.5">{a.note}</div>
                    <div className="text-[11px] text-muted mt-1">
                      <span className="font-medium">Stores:</span> {a.stores}
                    </div>
                    <div className="text-[11px] text-muted">
                      <span className="font-medium">Via:</span> {a.via}
                    </div>
                  </div>
                  <a href={a.join} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-accent/10 text-accent flex-shrink-0 mt-0.5">
                    Join
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StoreRow({ store: s }: { store: Store }) {
  return (
    <li className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-sm text-accent hover:underline">
            {s.name}
          </a>
          <div className="text-[11px] text-muted mt-0.5">{s.location}</div>
          {s.note && <div className="text-xs text-muted/70 mt-0.5">{s.note}</div>}
          {s.freeShip && <div className="text-[10px] text-up font-medium mt-0.5">Free shipping {s.freeShip}</div>}
        </div>
        <div className="flex gap-1.5 flex-shrink-0 mt-0.5">
          {s.sealed && (
            <a href={s.sealed} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-accent/10 text-accent">
              Sealed
            </a>
          )}
          {s.singles && (
            <a href={s.singles} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-up/10 text-up">
              Singles
            </a>
          )}
          {!s.sealed && !s.singles && s.search && (
            <a href={s.search} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-white/[0.06] text-fg">
              Browse
            </a>
          )}
          {!s.sealed && !s.singles && !s.search && (
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-white/[0.06] text-fg">
              Visit
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
