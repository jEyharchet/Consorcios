import { redirect } from "next/navigation";

import { hasNoConsorcios, type AccessContext } from "./auth";

export const ONBOARDING_PATH = "/onboarding";

export function onboardingRequired(access: AccessContext) {
  return hasNoConsorcios(access);
}

export function redirectToOnboardingIfNoConsorcios(access: AccessContext) {
  if (onboardingRequired(access)) {
    redirect(ONBOARDING_PATH);
  }
}
