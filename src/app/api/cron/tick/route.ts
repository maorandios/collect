import { NextResponse } from "next/server";

import { he } from "@/lib/i18n/he";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { message: he.errors.cronUnauthorized },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true });
}
