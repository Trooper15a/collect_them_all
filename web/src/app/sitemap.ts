import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { TCG_SEO } from "@/app/landing/tcg-data";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE.url, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE.url}/landing`, lastModified, changeFrequency: "weekly", priority: 0.9 },
    ...TCG_SEO.map((tcg) => ({
      url: `${SITE.url}/landing/${tcg.slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: `${SITE.url}/faq`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE.url}/login`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE.url}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE.url}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
