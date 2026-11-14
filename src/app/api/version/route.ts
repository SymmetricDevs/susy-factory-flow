import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";

/**
 * Versione del bundle deployato. Con l'export statico (GitHub Pages) viene
 * generata a build time: ogni deploy produce un valore nuovo.
 */
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({ version: APP_VERSION });
}
