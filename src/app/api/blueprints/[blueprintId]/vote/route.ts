import { NextResponse } from "next/server";
import type { BlueprintVoteResponse } from "@/lib/blueprints/types";
import {
  checkRateLimit,
  getCommunityDb,
  isCommunityConfigured,
  makeActorKey,
  makeVoterKey,
} from "@/lib/server/community";
import {
  blueprintStorageErrorMessage,
} from "@/lib/server/blueprints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Casts, switches, or (when re-sending the same value) retracts a vote on a
 * PUBLIC blueprint. Keyed by hashed IP + device id, exactly like plan votes:
 * anonymous but deduplicated. Counts are recounted rather than incremented —
 * idempotent under races and self-healing.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ blueprintId: string }> },
) {
  if (!isCommunityConfigured()) {
    return NextResponse.json({ error: "Cloud storage is not configured." }, { status: 503 });
  }

  try {
    const { blueprintId } = await context.params;
    const body = (await request.json()) as { deviceId?: unknown; value?: unknown };
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.slice(0, 64) : "";
    const value = body.value === 1 || body.value === -1 ? body.value : undefined;
    if (!deviceId || value === undefined) {
      return NextResponse.json({ error: "Invalid vote." }, { status: 400 });
    }

    const actorKey = makeActorKey(request, deviceId);
    if (!(await checkRateLimit(actorKey, "blueprint-vote", 60, 60 * 10))) {
      return NextResponse.json({ error: "Voting too fast. Slow down." }, { status: 429 });
    }
    const voterKey = await makeVoterKey(request, deviceId);

    const db = getCommunityDb();
    const { data: target, error: targetError } = await db
      .from("blueprints")
      .select("id,is_public")
      .eq("id", blueprintId)
      .maybeSingle();
    if (targetError) {
      return NextResponse.json(
        { error: blueprintStorageErrorMessage(targetError, "Voting failed.") },
        { status: 500 },
      );
    }
    if (!target || !target.is_public) {
      return NextResponse.json({ error: "Blueprint not found." }, { status: 404 });
    }

    const { data: existing } = await db
      .from("blueprint_votes")
      .select("value")
      .eq("blueprint_id", blueprintId)
      .eq("voter_key", voterKey)
      .maybeSingle();

    let myVote: 1 | -1 | undefined;
    if (existing && existing.value === value) {
      await db
        .from("blueprint_votes")
        .delete()
        .eq("blueprint_id", blueprintId)
        .eq("voter_key", voterKey);
      myVote = undefined;
    } else {
      const { error } = await db
        .from("blueprint_votes")
        .upsert({ blueprint_id: blueprintId, voter_key: voterKey, value });
      if (error) {
        throw new Error(error.message);
      }
      myVote = value;
    }

    const [{ count: upvotes }, { count: downvotes }] = await Promise.all([
      db
        .from("blueprint_votes")
        .select("blueprint_id", { count: "exact", head: true })
        .eq("blueprint_id", blueprintId)
        .eq("value", 1),
      db
        .from("blueprint_votes")
        .select("blueprint_id", { count: "exact", head: true })
        .eq("blueprint_id", blueprintId)
        .eq("value", -1),
    ]);

    const { error: updateError } = await db
      .from("blueprints")
      .update({ upvotes: upvotes ?? 0, downvotes: downvotes ?? 0 })
      .eq("id", blueprintId);
    if (updateError) {
      throw new Error(updateError.message);
    }

    const response: BlueprintVoteResponse = {
      upvotes: upvotes ?? 0,
      downvotes: downvotes ?? 0,
      score: (upvotes ?? 0) - (downvotes ?? 0),
      myVote,
    };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Voting failed." },
      { status: 500 },
    );
  }
}
