import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gtnhplanner.com";
  return {
    rules: [
      {
        userAgent: "*",
        // The card route stays crawlable: Twitterbot honours robots.txt, and
        // blocking it would strip the image off every shared plan's unfurl.
        allow: ["/", "/api/community/plans/*/card"],
        // JSON endpoints and dataset shards have no place in an index.
        disallow: ["/api/", "/datasets/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
