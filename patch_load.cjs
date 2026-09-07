const fs = require('fs');
let code = fs.readFileSync('src/services/subscriptionService.ts', 'utf8');

// Replace the manual checks in loadUserSubscription with getEffectiveSubscriptionState

const oldLogicInMem = `    // Check Expiration
    if (inMemoryState.tier !== 'FREE' && inMemoryState.expiresAt && Date.now() > inMemoryState.expiresAt) {
      console.log(\`Subscription for tier \${inMemoryState.tier} has expired (in-memory check).\`);
      inMemoryState.tier = 'FREE';
      inMemoryState.maxDailyCredits = 0;
      inMemoryState.dailyCredits = 0;
      inMemoryState.expiresAt = null;
      inMemoryState.isTrial = false;
      memoryChanged = true;
    }

    // Check Midnight Reset in Memory
    const tierMax = TIER_CONFIGS[inMemoryState.tier]?.dailyCredits || 0;
    inMemoryState.maxDailyCredits = tierMax;
    if (inMemoryState.lastDailyResetDate !== today) {
      inMemoryState.dailyCredits = tierMax;
      inMemoryState.lastDailyResetDate = today;
      inMemoryState.chatMessageCount = 0;
      inMemoryState.callSecondsCount = 0;
      memoryChanged = true;
    }`;

const newLogicInMem = `    const { state: effectiveMemState, changed } = getEffectiveSubscriptionState(inMemoryState);
    if (changed) {
      inMemoryState = effectiveMemState;
      memoryChanged = true;
    }`;

code = code.replace(oldLogicInMem, newLogicInMem);

const oldLogicEnd = `  // 1. Check Subscription Expiration (30-day rule)
  if (state.tier !== 'FREE' && state.expiresAt && Date.now() > state.expiresAt) {
    console.log(\`Subscription for tier \${state.tier} has expired.\`);
    state.tier = 'FREE';
    state.maxDailyCredits = 0;
    state.dailyCredits = 0;
    state.expiresAt = null;
    state.isTrial = false;
  }

  // 2. Check Midnight Reset for Daily Credits
  const tierMax = TIER_CONFIGS[state.tier]?.dailyCredits || 0;
  state.maxDailyCredits = tierMax;
  if (state.lastDailyResetDate !== today) {
    state.dailyCredits = tierMax;
    state.lastDailyResetDate = today;
    state.chatMessageCount = 0;
    state.callSecondsCount = 0;
  }

  // Cache in-memory singleton
  inMemoryState = { ...state };`;

const newLogicEnd = `  const { state: effectiveState } = getEffectiveSubscriptionState(state);
  
  // Cache in-memory singleton
  inMemoryState = { ...effectiveState };`;

code = code.replace(oldLogicEnd, newLogicEnd);

fs.writeFileSync('src/services/subscriptionService.ts', code);
console.log("Replaced manual checks with getEffectiveSubscriptionState");
