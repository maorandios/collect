import { NextResponse } from "next/server";

import { runCronTick } from "@/lib/cron/tick";
import { authorizationMatchesCronSecret } from "@/lib/cron/secret";
import { he } from "@/lib/i18n/he";

export const dynamic = "force-dynamic";

function methodNotAllowed() {
  return NextResponse.json({ message: he.errors.forbidden }, { status: 405 });
}

function unauthorized() {
  return NextResponse.json({ message: he.errors.cronUnauthorized }, { status: 401 });
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!authorizationMatchesCronSecret(request.headers.get("authorization"), cronSecret)) {
    return unauthorized();
  }

  const counters = await runCronTick();
  return NextResponse.json({
    claimedWorkflows: counters.claimedWorkflows,
    createdRequests: counters.createdRequests,
    processedJobs: counters.processedJobs,
    succeededJobs: counters.succeededJobs,
    failedJobs: counters.failedJobs,
    skippedJobs: counters.skippedJobs,
  });
}

export function GET() {
  return methodNotAllowed();
}

export function PUT() {
  return methodNotAllowed();
}

export function PATCH() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}
