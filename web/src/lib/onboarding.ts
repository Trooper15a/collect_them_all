import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUserSetting, setUserSetting } from "@/lib/user-settings";

export const ONBOARDING_STATES = ["pending", "dismissed", "completed"] as const;
export type OnboardingState = (typeof ONBOARDING_STATES)[number];

export const MILESTONE_STATES = ["active", "dismissed", "opened"] as const;
export type MilestoneState = (typeof MILESTONE_STATES)[number];

export interface OnboardingStatus {
  state: OnboardingState;
  milestoneState: MilestoneState;
  itemCount: number;
  eligible: boolean;
}

export function shouldStartOnboarding(state: OnboardingState, itemCount: number) {
  return state === "pending" && itemCount === 0;
}

export function milestoneView(itemCount: number, state: MilestoneState): "progress" | "sets" | null {
  if (state !== "active") return null;
  if (itemCount >= 1 && itemCount <= 4) return "progress";
  if (itemCount >= 5) return "sets";
  return null;
}

function onboardingState(value: string): OnboardingState {
  return (ONBOARDING_STATES as readonly string[]).includes(value) ? value as OnboardingState : "pending";
}

function milestoneState(value: string): MilestoneState {
  return (MILESTONE_STATES as readonly string[]).includes(value) ? value as MilestoneState : "active";
}

export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  const [storedState, storedMilestone, rows] = await Promise.all([
    getUserSetting("onboardingState", "pending"),
    getUserSetting("firstBinderMilestone", "active"),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.portfolioItems)
      .innerJoin(schema.portfolios, eq(schema.portfolioItems.portfolioId, schema.portfolios.id))
      .where(eq(schema.portfolios.userId, userId)),
  ]);
  const state = onboardingState(storedState);
  const itemCount = rows[0]?.n ?? 0;
  return {
    state,
    milestoneState: milestoneState(storedMilestone),
    itemCount,
    eligible: shouldStartOnboarding(state, itemCount),
  };
}

export async function setOnboardingState(state: OnboardingState) {
  await setUserSetting("onboardingState", state);
}

export async function setMilestoneState(state: MilestoneState) {
  await setUserSetting("firstBinderMilestone", state);
}
