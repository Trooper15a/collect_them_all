import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { TCG_SEO } from "@/app/landing/tcg-data";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE.url}/landing`, changeFrequency: "weekly", priority: 1 },
    ...TCG_SEO.map((tcg) => ({
      url: `${SITE.url}/landing/${tcg.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: `${SITE.url}/faq`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE.url}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE.url}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
