import { forwardToHub } from "@/lib/hub-proxy";
import { NextResponse } from "next/server";
import { updateRequestSchema } from "@/lib/contracts";
import { appendUpdate } from "@/lib/store";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "request body exceeds 16 KB limit" },
      { status: 400 },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = updateRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((issue) => issue.message).join("; ") },
      { status: 400 },
    );
  }

  const forwarded = await forwardToHub(request, JSON.stringify(parsed.data));
  if (forwarded) return forwarded;

  let result;
  try {
    result = await appendUpdate(parsed.data);
  } catch (error) {
    console.error("appendUpdate failed", error);
    return NextResponse.json(
      { error: "storage failure; the update was not saved" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (result.outcome === "conflict") {
    const message =
      result.reason === "update_id_reused"
        ? "update_id already used with different content"
        : "task is already owned by a different agent, or the project task limit was reached";
    return NextResponse.json(
      { error: message },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const status = result.outcome === "created" ? 201 : 200;
  return NextResponse.json(
    {
      update_id: result.snapshot.update_id,
      sequence: result.snapshot.sequence,
      timestamp: result.snapshot.timestamp,
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
