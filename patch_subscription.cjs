const fs = require('fs');
let code = fs.readFileSync('src/services/subscriptionService.ts', 'utf8');

const exportFunc = `/**
 * Calculate effective subscription state for ANY user state (handles expiration and midnight resets)
 */
export function getEffectiveSubscriptionState(state: UserSubscriptionState): { state: UserSubscriptionState, changed: boolean } {
  let changed = false;
  const effectiveState = { ...state };
  const today = getTodayString();

  // 1. Check Expiration
  if (effectiveState.tier !== 'FREE' && effectiveState.expiresAt && Date.now() > effectiveState.expiresAt) {
    effectiveState.tier = 'FREE';
    effectiveState.maxDailyCredits = 0;
    effectiveState.dailyCredits = 0;
    effectiveState.expiresAt = null;
    effectiveState.isTrial = false;
    changed = true;
  }

  // 2. Check Midnight Reset
  const tierMax = TIER_CONFIGS[effectiveState.tier]?.dailyCredits || 0;
  effectiveState.maxDailyCredits = tierMax;
  if (effectiveState.lastDailyResetDate !== today) {
    effectiveState.dailyCredits = tierMax;
    effectiveState.lastDailyResetDate = today;
    effectiveState.chatMessageCount = 0;
    effectiveState.callSecondsCount = 0;
    changed = true;
  }

  return { state: effectiveState, changed };
}
`;

if (!code.includes("export function getEffectiveSubscriptionState")) {
    const splitPoint = code.indexOf("export const DEFAULT_FREE_STATE");
    code = code.slice(0, splitPoint) + exportFunc + "\n" + code.slice(splitPoint);
    fs.writeFileSync('src/services/subscriptionService.ts', code);
    console.log("Added getEffectiveSubscriptionState");
}
