import type { CardPrices, NormalizedCard } from "./types";

export interface MarketplaceLink {
  label: string;
  url: string;
}

export function marketplaceLinks(
  card: Pick<NormalizedCard, "name" | "setName" | "cardNumber" | "tcg" | "language">,
  prices?: CardPrices | null,
): MarketplaceLink[] {
  const links: MarketplaceLink[] = [];
  const name = card.name;

  const tcgUrl = prices?.tcgplayer?.url;
  if (tcgUrl) {
    links.push({ label: "TCGPlayer", url: tcgUrl });
  } else {
    const u = new URL("https://www.tcgplayer.com/search/all/product");
    u.searchParams.set("q", name);
    links.push({ label: "TCGPlayer", url: u.toString() });
  }

  const cmUrl = prices?.cardmarket?.url;
  if (cmUrl) {
    links.push({ label: "CardMarket", url: cmUrl });
  } else {
    const tcgSlug = card.tcg === "mtg" ? "Magic" : card.tcg === "yugioh" ? "YuGiOh" : "Pokemon";
    const u = new URL(`https://www.cardmarket.com/en/${tcgSlug}/Products/Search`);
    u.searchParams.set("searchString", name);
    links.push({ label: "CardMarket", url: u.toString() });
  }

  const num = (card.cardNumber ?? "").split("/")[0].replace(/^0+(?=\d)/, "");
  const terms = [name, card.setName, num, card.language === "jap" ? "japanese" : ""].filter(Boolean).join(" ");
  const ebay = new URL("https://www.ebay.com/sch/i.html");
  ebay.searchParams.set("_nkw", terms);
  links.push({ label: "eBay", url: ebay.toString() });

  return links;
}

export function tcgplayerSearchUrl(name: string): string {
  const u = new URL("https://www.tcgplayer.com/search/all/product");
  u.searchParams.set("q", name);
  return u.toString();
}
