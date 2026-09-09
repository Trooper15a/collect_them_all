export interface TcgSeo {
  slug: string;
  name: string;
  shortName: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  features: string[];
  keywords: string[];
}

export const TCG_SEO: TcgSeo[] = [
  {
    slug: "pokemon",
    name: "Pokémon TCG",
    shortName: "Pokémon",
    title: "Free Pokémon Card Tracker — Prices, Scanner & Collection Manager",
    description:
      "Track your Pokémon card collection for free. AI card scanner identifies cards instantly, daily TCGPlayer prices, set completion tracking, and wishlist price alerts. Works offline.",
    h1: "Pokémon Card Collection Tracker",
    intro:
      "RipnPull is the free, open-source Pokémon card tracker with AI-powered scanning, daily TCGPlayer market prices, and full set completion tracking. No subscription required — ever.",
    features: [
      "Scan any Pokémon card with your camera — AI identifies it instantly, even without internet",
      "Daily prices from TCGPlayer for every card, including reverse holos, full arts, and alt arts",
      "Track set completion with progress bars — see exactly what you're missing and the cost to complete",
      "Wishlist cards you want and get alerts when prices drop to your target",
      "Organize cards into portfolio binders with grading support (PSA, BGS, CGC)",
      "Track purchase price vs. current market value to see your gains over time",
    ],
    keywords: [
      "pokemon card tracker",
      "pokemon card collection tracker",
      "pokemon card price tracker",
      "pokemon card scanner",
      "pokemon TCG portfolio",
      "pokemon card value tracker",
      "free pokemon card tracker",
    ],
  },
  {
    slug: "mtg",
    name: "Magic: The Gathering",
    shortName: "MTG",
    title: "Free MTG Collection Tracker — Magic Card Prices, Scanner & Portfolio",
    description:
      "Track your Magic: The Gathering collection for free. AI card scanner, daily prices from TCGPlayer and CardMarket, set completion tracking, and wishlist price drop alerts.",
    h1: "Magic: The Gathering Collection Tracker",
    intro:
      "RipnPull is the free, open-source MTG collection tracker with AI-powered card scanning, daily prices from TCGPlayer, and complete set tracking. No subscription, no paywalls.",
    features: [
      "Scan any Magic card with your phone camera — AI identifies set, foil treatment, and variant",
      "Daily prices from TCGPlayer for every card including extended art, borderless, and showcase",
      "Track set completion across Standard, Modern, Commander, and every other format",
      "Wishlist expensive staples and get notified when prices drop to your buy target",
      "Portfolio binders with grading support — track PSA/BGS graded cards separately",
      "Compare purchase price vs. current market value across your entire collection",
    ],
    keywords: [
      "mtg collection tracker",
      "magic the gathering card tracker",
      "mtg price tracker",
      "mtg card scanner",
      "mtg portfolio tracker",
      "magic card collection app",
      "free mtg tracker",
    ],
  },
  {
    slug: "yugioh",
    name: "Yu-Gi-Oh!",
    shortName: "Yu-Gi-Oh!",
    title: "Free Yu-Gi-Oh! Card Tracker — Prices, Scanner & Collection Manager",
    description:
      "Track your Yu-Gi-Oh! card collection for free. AI card scanner, daily TCGPlayer prices, set completion tracking, wishlist alerts, and offline support. No subscription.",
    h1: "Yu-Gi-Oh! Card Collection Tracker",
    intro:
      "RipnPull is the free, open-source Yu-Gi-Oh! card tracker with AI-powered scanning, daily TCGPlayer prices, and full set completion tracking. Free forever — no paywalls.",
    features: [
      "Scan any Yu-Gi-Oh! card with your camera — AI identifies it by set, rarity, and edition",
      "Daily prices from TCGPlayer for every card including starlight rares, collector's rares, and ghost rares",
      "Track set completion for core sets, side sets, and Structure Decks",
      "Wishlist chase cards and get alerts when prices drop to your target",
      "Portfolio binders with grading support — track PSA/BGS/CGC slabs",
      "See total collection value and price trends over time",
    ],
    keywords: [
      "yugioh card tracker",
      "yugioh collection tracker",
      "yugioh price tracker",
      "yugioh card scanner",
      "yugioh portfolio tracker",
      "free yugioh card tracker",
    ],
  },
  {
    slug: "one-piece",
    name: "One Piece Card Game",
    shortName: "One Piece",
    title: "Free One Piece Card Tracker — Prices, Scanner & Collection Manager",
    description:
      "Track your One Piece Card Game collection for free. AI card scanner, daily TCGPlayer prices, set completion tracking, and wishlist alerts. Open source.",
    h1: "One Piece Card Game Collection Tracker",
    intro:
      "RipnPull is the free, open-source One Piece card tracker with AI-powered scanning, daily TCGPlayer prices, and full set completion tracking. No subscription needed.",
    features: [
      "Scan any One Piece card with your camera — AI identifies it instantly",
      "Daily prices from TCGPlayer for every card including alt art leaders and manga rares",
      "Track set completion with progress bars across all booster sets",
      "Wishlist cards and get notified when prices drop",
      "Portfolio binders with grading support",
      "Track your collection value over time with price history charts",
    ],
    keywords: [
      "one piece card tracker",
      "one piece tcg tracker",
      "one piece card price tracker",
      "one piece card collection app",
      "free one piece card tracker",
    ],
  },
  {
    slug: "lorcana",
    name: "Disney Lorcana",
    shortName: "Lorcana",
    title: "Free Lorcana Card Tracker — Prices, Scanner & Collection Manager",
    description:
      "Track your Disney Lorcana collection for free. AI card scanner, daily TCGPlayer prices, set completion tracking, and wishlist price alerts. Open source.",
    h1: "Disney Lorcana Collection Tracker",
    intro:
      "RipnPull is the free, open-source Lorcana card tracker with AI-powered scanning, daily TCGPlayer prices, and complete set tracking. Free forever.",
    features: [
      "Scan any Lorcana card with your camera — AI identifies it by set and variant",
      "Daily prices from TCGPlayer for every card including enchanted and promo versions",
      "Track set completion across all Lorcana sets with progress bars",
      "Wishlist enchanted cards and get notified when prices drop",
      "Portfolio binders with grading support",
      "See your total collection value and track gains over time",
    ],
    keywords: [
      "lorcana card tracker",
      "lorcana collection tracker",
      "lorcana price tracker",
      "disney lorcana tracker",
      "free lorcana card tracker",
    ],
  },
  {
    slug: "digimon",
    name: "Digimon Card Game",
    shortName: "Digimon",
    title: "Free Digimon Card Tracker — Prices, Scanner & Collection Manager",
    description:
      "Track your Digimon Card Game collection for free. AI card scanner, daily TCGPlayer prices, set completion, and wishlist alerts. Open source.",
    h1: "Digimon Card Game Collection Tracker",
    intro:
      "RipnPull is the free, open-source Digimon card tracker with AI-powered scanning, daily TCGPlayer prices, and full set completion tracking.",
    features: [
      "Scan any Digimon card with your camera for instant identification",
      "Daily prices from TCGPlayer for every card including alt arts and secret rares",
      "Track set completion with progress bars",
      "Wishlist chase cards and get price drop alerts",
      "Portfolio binders with grading support",
      "Track collection value and price trends",
    ],
    keywords: [
      "digimon card tracker",
      "digimon tcg tracker",
      "digimon card price tracker",
      "free digimon card tracker",
    ],
  },
  {
    slug: "flesh-and-blood",
    name: "Flesh and Blood",
    shortName: "FAB",
    title: "Free Flesh and Blood Card Tracker — Prices, Scanner & Collection Manager",
    description:
      "Track your Flesh and Blood collection for free. AI card scanner, daily TCGPlayer prices, set completion tracking, and wishlist alerts. Open source.",
    h1: "Flesh and Blood Collection Tracker",
    intro:
      "RipnPull is the free, open-source FAB card tracker with AI-powered scanning, daily TCGPlayer prices, and full set completion tracking.",
    features: [
      "Scan any FAB card with your camera for instant identification",
      "Daily prices from TCGPlayer for every card including cold foils and extended arts",
      "Track set completion across all Flesh and Blood sets",
      "Wishlist high-value cards and get price drop alerts",
      "Portfolio binders with grading support",
      "Track collection value over time",
    ],
    keywords: [
      "flesh and blood card tracker",
      "fab card tracker",
      "flesh and blood price tracker",
      "fab collection tracker",
    ],
  },
  {
    slug: "dragon-ball",
    name: "Dragon Ball Super Card Game",
    shortName: "Dragon Ball",
    title: "Free Dragon Ball Card Tracker — Prices, Scanner & Collection Manager",
    description:
      "Track your Dragon Ball Super Card Game and Fusion World collection for free. AI card scanner, daily TCGPlayer prices, and wishlist alerts.",
    h1: "Dragon Ball Card Game Collection Tracker",
    intro:
      "RipnPull is the free, open-source Dragon Ball card tracker with AI-powered scanning, daily TCGPlayer prices, and set completion tracking. Supports both DBS and Fusion World.",
    features: [
      "Scan any Dragon Ball card with your camera for instant identification",
      "Daily prices from TCGPlayer for DBS and Fusion World cards",
      "Track set completion with progress bars",
      "Wishlist cards and get price drop alerts",
      "Portfolio binders with grading support",
      "Track collection value over time",
    ],
    keywords: [
      "dragon ball card tracker",
      "dbs card tracker",
      "dragon ball fusion world tracker",
      "dragon ball tcg price tracker",
    ],
  },
  {
    slug: "star-wars",
    name: "Star Wars: Unlimited",
    shortName: "Star Wars",
    title: "Free Star Wars Unlimited Card Tracker — Prices, Scanner & Collection",
    description:
      "Track your Star Wars: Unlimited collection for free. AI card scanner, daily TCGPlayer prices, set completion tracking, and wishlist alerts. Open source.",
    h1: "Star Wars: Unlimited Collection Tracker",
    intro:
      "RipnPull is the free, open-source Star Wars: Unlimited card tracker with AI-powered scanning, daily TCGPlayer prices, and set completion tracking.",
    features: [
      "Scan any Star Wars: Unlimited card with your camera",
      "Daily prices from TCGPlayer for every card including hyperspace and showcase variants",
      "Track set completion with progress bars",
      "Wishlist cards and get price drop alerts",
      "Portfolio binders with grading support",
      "Track collection value and price trends",
    ],
    keywords: [
      "star wars unlimited card tracker",
      "star wars unlimited price tracker",
      "star wars tcg tracker",
      "star wars unlimited collection tracker",
    ],
  },
];

export function getTcgBySlug(slug: string): TcgSeo | undefined {
  return TCG_SEO.find((t) => t.slug === slug);
}
