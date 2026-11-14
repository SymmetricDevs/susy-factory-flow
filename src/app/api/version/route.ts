import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";

/**
 * What version the SERVER is running, so a tab left open across a deploy can
 * notice it runs an old bundle (see `useDeployedVersion`). Deliberately
 * uncached: a cached answer is exactly the stale reading it exists to detect.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return NextResponse.json(
    { version: APP_VERSION },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
