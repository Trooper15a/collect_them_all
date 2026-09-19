import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import {
  getOnboardingStatus,
  setMilestoneState,
  setOnboardingState,
} from "@/lib/onboarding";

const Patch = z
  .object({
    state: z.enum(["pending", "dismissed", "completed"]).optional(),
    milestoneState: z.enum(["active", "dismissed", "opened"]).optional(),
  })
  .refine(
    (value) => value.state !== undefined || value.milestoneState !== undefined,
    { message: "At least one onboarding field is required" },
  );

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await getOnboardingStatus(userId));
  } catch {
    return NextResponse.json({ error: "Unable to load onboarding status" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  try {
    if (parsed.data.state) await setOnboardingState(parsed.data.state);
    if (parsed.data.milestoneState) await setMilestoneState(parsed.data.milestoneState);
    return NextResponse.json(await getOnboardingStatus(userId));
  } catch {
    return NextResponse.json({ error: "Unable to update onboarding status" }, { status: 500 });
  }
}
