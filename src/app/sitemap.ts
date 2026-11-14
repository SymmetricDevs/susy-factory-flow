import type { MetadataRoute } from "next";
import { getCommunityDb, isCommunityConfigured } from "@/lib/server/community";

/** Re-query the plan list at most hourly, so crawl bursts cost one DB read. */
export const revalidate = 3600;

/**
 * The home page plus every public shared plan. A plan link carries its own
 * title, description and preview card (see `generateMetadata` in page.tsx),
 * so each one is a real page worth indexing, not just an app-state URL.
 * Only plans a stranger could open are listed: the same `is_public !== false`
 * rule the unfurler uses.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gtnhplanner.com";
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
  ];

  if (!isCommunityConfigured()) {
    return entries;
  }

  try {
    const { data } = await getCommunityDb()
      .from("community_plans")
      .select("id,created_at,updated_at")
      .or("is_public.eq.true,is_public.is.null")
      .order("score", { ascending: false })
      .limit(1000)
      .returns<{ id: string; created_at: string; updated_at: string | null }[]>();
    for (const row of data ?? []) {
      entries.push({
        url: `${base}/?plan=${encodeURIComponent(row.id)}`,
        lastModified: new Date(row.updated_at ?? row.created_at),
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  } catch {
    // A sitemap that lists only the home page is still a valid sitemap.
  }

  return entries;
}
