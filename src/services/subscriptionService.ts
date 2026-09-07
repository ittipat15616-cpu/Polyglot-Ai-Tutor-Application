import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { UserSubscriptionState, SubscriptionTier, TIER_CONFIGS, isAdminEmail, isSuperAdminEmail } from '../types/subscription';

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate effective subscription state for ANY user state (handles expiration and 10-day cycle refresh)
 */
export function getEffectiveSubscriptionState(
  state: UserSubscriptionState,
  targetUserEmail?: string | null
): { state: UserSubscriptionState, changed: boolean } {
  let changed = false;
  const effectiveState = { ...state };

  const emailToCheck = targetUserEmail !== undefined ? targetUserEmail : auth.currentUser?.email;
  if (emailToCheck && isSuperAdminEmail(emailToCheck)) {
    effectiveState.tier = 'ULTRA';
    effectiveState.expiresAt = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000; // 100 years
    effectiveState.isTrial = false;
    return { state: effectiveState, changed: false };
  } else if (emailToCheck && isAdminEmail(emailToCheck)) {
    // Admin accounts (nongrily@gmail.com, weeranan172550@gmail.com):
    // Ultra plan (Admin) lifetime access, 0 free daily/cycle credits (must top up themselves)
    effectiveState.tier = 'ULTRA';
    effectiveState.expiresAt = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000; // 100 years lifetime
    effectiveState.isTrial = false;
    effectiveState.dailyCredits = 0;
    effectiveState.maxDailyCredits = 0;
    effectiveState.nextCreditResetAt = null;
    effectiveState.lastCreditResetAt = null;
    effectiveState.purchasedCredits = effectiveState.purchasedCredits || 0;
    return { state: effectiveState, changed: false };
  }

  // 1. Check Expiration
  if (effectiveState.tier !== 'FREE' && effectiveState.expiresAt && Date.now() > effectiveState.expiresAt) {
    effectiveState.tier = 'FREE';
    effectiveState.maxDailyCredits = 0;
    effectiveState.dailyCredits = 0;
    effectiveState.expiresAt = null;
    effectiveState.nextCreditResetAt = null;
    effectiveState.lastCreditResetAt = null;
    effectiveState.isTrial = false;
    changed = true;
  }

  // 2. Check 10-Day Cycle Reset
  const tierMax = TIER_CONFIGS[effectiveState.tier]?.dailyCredits || 0;
  effectiveState.maxDailyCredits = tierMax;

  if (effectiveState.tier !== 'FREE' && tierMax > 0 && effectiveState.expiresAt && Date.now() <= effectiveState.expiresAt) {
    if (!effectiveState.nextCreditResetAt) {
      effectiveState.nextCreditResetAt = Math.min(effectiveState.expiresAt, Date.now() + TEN_DAYS_MS);
      effectiveState.lastCreditResetAt = Date.now();
      if (effectiveState.dailyCredits < tierMax) {
        effectiveState.dailyCredits = tierMax;
      }
      changed = true;
    } else if (Date.now() >= effectiveState.nextCreditResetAt) {
      effectiveState.dailyCredits = tierMax;
      effectiveState.lastCreditResetAt = Date.now();
      while (effectiveState.nextCreditResetAt <= Date.now()) {
        effectiveState.nextCreditResetAt += TEN_DAYS_MS;
      }
      if (effectiveState.nextCreditResetAt > effectiveState.expiresAt) {
        effectiveState.nextCreditResetAt = effectiveState.expiresAt;
      }
      effectiveState.chatMessageCount = 0;
      effectiveState.callSecondsCount = 0;
      changed = true;
    }
  } else if (tierMax === 0) {
    effectiveState.dailyCredits = 0;
    effectiveState.nextCreditResetAt = null;
  }

  return { state: effectiveState, changed };
}

export const DEFAULT_FREE_STATE: UserSubscriptionState = {
  tier: 'FREE',
  dailyCredits: 0,
  maxDailyCredits: 0,
  purchasedCredits: 0,
  lastDailyResetDate: getTodayString(),
  nextCreditResetAt: null,
  lastCreditResetAt: null,
  expiresAt: null,
  chatMessageCount: 0,
  callSecondsCount: 0,
};

// Singleton In-Memory Store to prevent async race conditions & stale Firestore overwrites
let inMemoryState: UserSubscriptionState | null = null;
let cachedUid: string | null = null;

function getStorageKey(uid: string) {
  return `user_${uid}_subscription_state`;
}

const DEVICE_TRACKING_KEY = 'polyglot_device_trials';
const MAX_TRIALS_PER_DEVICE = 1;

function canClaimTrialOnDevice(uid: string, email?: string | null): boolean {
  if (email && email.toLowerCase() === 'ittipat556@gmail.com') return true;
  try {
    const saved = localStorage.getItem(DEVICE_TRACKING_KEY);
    let trials: string[] = [];
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) trials = parsed;
    }
    if (trials.includes(uid)) return true; // Already registered on this device
    return trials.length < MAX_TRIALS_PER_DEVICE; // Limit to MAX_TRIALS_PER_DEVICE
  } catch (e) {
    return true; // Fallback if localStorage is unavailable
  }
}

function registerDeviceTrial(uid: string) {
  try {
    const saved = localStorage.getItem(DEVICE_TRACKING_KEY);
    let trials: string[] = [];
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) trials = parsed;
    }
    if (!trials.includes(uid)) {
      trials.push(uid);
      localStorage.setItem(DEVICE_TRACKING_KEY, JSON.stringify(trials));
    }
  } catch (e) {}
}

/**
 * Clear in-memory singleton cache on auth logout/switch
 */
export function clearSubscriptionCache() {
  inMemoryState = null;
  cachedUid = null;
}

/**
 * Load user subscription state. Uses In-Memory Singleton Store as single source of truth.
 */
export async function loadUserSubscription(): Promise<UserSubscriptionState> {
  const user = auth.currentUser;
  const today = getTodayString();
  const uid = user ? user.uid : 'guest';

  // If user changed, reset memory cache
  if (cachedUid !== uid) {
    inMemoryState = null;
    cachedUid = uid;
  }

  if (!user) {
    inMemoryState = { ...DEFAULT_FREE_STATE };
    cachedUid = uid;
    return { ...inMemoryState };
  }

  // Return authoritative in-memory state if already loaded
  if (inMemoryState) {
    let memoryChanged = false;
    
    const { state: effectiveMemState, changed } = getEffectiveSubscriptionState(inMemoryState);
    if (changed) {
      inMemoryState = effectiveMemState;
      memoryChanged = true;
    }
    
    if (memoryChanged) {
      await saveUserSubscription(inMemoryState);
    }
    return { ...inMemoryState };
  }

  // Synchronous LocalStorage Load to prevent UI flashing
  let state: UserSubscriptionState = { ...DEFAULT_FREE_STATE };
  try {
    const saved = localStorage.getItem(getStorageKey(uid));
    if (saved) state = JSON.parse(saved);
  } catch (e) {}

  // Fetch Firestore in background if logged in
  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'subscription', 'current');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const remoteState = snap.data() as UserSubscriptionState;
        // Merge remote state with local if remote has data
        state = { ...state, ...remoteState };

        // Fix for specific user affected by the previous device-limit bug
        if (user.email && user.email.toLowerCase() === 'ittipat556@gmail.com' && state.tier !== 'TESTING') {
          state.hasReceivedTestingTrial = false;
        }

        // Migration: If user hasn't received the TESTING trial yet, give it to them!
        // We will preserve their tier ONLY if they are paying customers (tier !== FREE and tier !== TESTING and not isTrial)
        const isPayingCustomer = state.tier !== 'FREE' && state.tier !== 'TESTING' && !state.isTrial;
        
        if (!state.hasReceivedTestingTrial && !isPayingCustomer) {
          // Retroactive upgrade: Give all existing users the TESTING plan (14-day trial)
          const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
          state.tier = 'TESTING';
          state.maxDailyCredits = TIER_CONFIGS.TESTING.dailyCredits;
          state.dailyCredits = TIER_CONFIGS.TESTING.dailyCredits;
          state.purchasedCredits = state.purchasedCredits || 0; // No free credits
          state.expiresAt = Date.now() + fourteenDaysMs;
          state.isTrial = true;
          state.hasReceivedTestingTrial = true;
          registerDeviceTrial(user.uid); // Mark device to prevent future new accounts from claiming
          
          await setDoc(docRef, { ...state, updatedAt: Date.now() }, { merge: true });
        }
      } else {
        // First time user logging in with Google!
        if (canClaimTrialOnDevice(user.uid, user.email)) {
          // Give 14-day TESTING trial and 0 credits (can access all pages, credits must be purchased/topped up)
          const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
          state.tier = 'TESTING';
          state.maxDailyCredits = TIER_CONFIGS.TESTING.dailyCredits;
          state.dailyCredits = TIER_CONFIGS.TESTING.dailyCredits;
          state.purchasedCredits = 0; // 0 Credits to start (no free AI credits)
          state.expiresAt = Date.now() + fourteenDaysMs;
          state.isTrial = true;
          state.hasReceivedTestingTrial = true;
          registerDeviceTrial(user.uid);
        } else {
          // Device has exceeded trial limit. Default to FREE plan.
          state.tier = 'FREE';
          state.maxDailyCredits = 0;
          state.dailyCredits = 0;
          state.purchasedCredits = 0; // 0 Credits for anti-spam
          state.expiresAt = null;
          state.isTrial = false;
          state.hasReceivedTestingTrial = true;
        }
        // Save immediately to mark that they've received the trial (or free plan)
        await setDoc(docRef, { ...state, updatedAt: Date.now() });
      }
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error loading user subscription from Firestore:', e);
      }
    }
  }

  // Super Admin Initializer & Lifetime Access (ittipat15616@gmail.com)
  if (user && isSuperAdminEmail(user.email)) {
    state.tier = 'ULTRA';
    state.expiresAt = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000; // 100 years lifetime access
    state.isTrial = false;
    if ((state.purchasedCredits || 0) < 1000) {
      state.purchasedCredits = Math.max(state.purchasedCredits || 0, 10000);
    }
    state.hasReceivedAdminCredits = true;
    if (db) {
      const docRef = doc(db, 'users', user.uid, 'subscription', 'current');
      setDoc(docRef, { ...state, updatedAt: Date.now() }, { merge: true }).catch(() => {});
    }
  } else if (user && isAdminEmail(user.email)) {
    // Other Admins (weeranan172550@gmail.com, nongrily@gmail.com):
    // Ultra plan (Admin) Lifetime access (100 years), all pages accessible,
    // NO free credits granted (dailyCredits = 0, must top up themselves),
    // and all Call page features are FREE when using BYOK.
    let needsUpdate = false;
    if (state.tier !== 'ULTRA') {
      state.tier = 'ULTRA';
      needsUpdate = true;
    }
    const lifetimeExpiry = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;
    if (!state.expiresAt || (state.expiresAt - Date.now() < 50 * 365 * 24 * 60 * 60 * 1000)) {
      state.expiresAt = lifetimeExpiry;
      needsUpdate = true;
    }
    if (state.dailyCredits !== 0 || state.maxDailyCredits !== 0) {
      state.dailyCredits = 0;
      state.maxDailyCredits = 0;
      needsUpdate = true;
    }
    if (state.isTrial) {
      state.isTrial = false;
      needsUpdate = true;
    }
    state.purchasedCredits = state.purchasedCredits || 0;
    if (needsUpdate && db) {
      const docRef = doc(db, 'users', user.uid, 'subscription', 'current');
      setDoc(docRef, { ...state, updatedAt: Date.now() }, { merge: true }).catch(() => {});
    }
  } else if (user && !isAdminEmail(user.email)) {
    // Normal users: check if they had abnormal ULTRA or 100-year expiry (> 30 days) from previous dev sessions
    const isAbnormalLifetime = state.expiresAt && (state.expiresAt - Date.now() > 30 * 24 * 60 * 60 * 1000);
    let userNeedsSync = false;

    if (state.tier === 'ULTRA' || isAbnormalLifetime) {
      state.tier = 'TESTING';
      state.expiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
      state.isTrial = true;
      state.hasReceivedTestingTrial = true;
      state.dailyCredits = 0;
      state.maxDailyCredits = 0;
      userNeedsSync = true;
    }

    // Enforce 0 purchased credits for all other Google accounts in the system
    if ((state.purchasedCredits || 0) > 0) {
      state.purchasedCredits = 0;
      userNeedsSync = true;
    }

    if (userNeedsSync) {
      try {
        localStorage.setItem(getStorageKey(user.uid), JSON.stringify(state));
      } catch (e) {}
      if (db) {
        const docRef = doc(db, 'users', user.uid, 'subscription', 'current');
        setDoc(docRef, { ...state, updatedAt: Date.now() }, { merge: true }).catch(() => {});
      }
    }
  }

  // 1. Check Subscription Expiration (30-day rule)
  if (user && isSuperAdminEmail(user.email)) {
    // Super admin account never expires
  } else if (state.tier !== 'FREE' && state.expiresAt && Date.now() > state.expiresAt) {
    console.log(`Subscription for tier ${state.tier} has expired.`);
    state.tier = 'FREE';
    state.maxDailyCredits = 0;
    state.dailyCredits = 0;
    state.expiresAt = null;
    state.nextCreditResetAt = null;
    state.lastCreditResetAt = null;
    state.isTrial = false;
  }

  // 2. Check 10-Day Cycle Reset
  const tierMax = TIER_CONFIGS[state.tier]?.dailyCredits || 0;
  state.maxDailyCredits = tierMax;

  if (state.tier !== 'FREE' && tierMax > 0 && state.expiresAt && Date.now() <= state.expiresAt) {
    if (!state.nextCreditResetAt) {
      state.nextCreditResetAt = Math.min(state.expiresAt, Date.now() + TEN_DAYS_MS);
      state.lastCreditResetAt = Date.now();
      if (state.dailyCredits < tierMax) {
        state.dailyCredits = tierMax;
      }
    } else if (Date.now() >= state.nextCreditResetAt) {
      state.dailyCredits = tierMax;
      state.lastCreditResetAt = Date.now();
      while (state.nextCreditResetAt <= Date.now()) {
        state.nextCreditResetAt += TEN_DAYS_MS;
      }
      if (state.nextCreditResetAt > state.expiresAt) {
        state.nextCreditResetAt = state.expiresAt;
      }
      state.chatMessageCount = 0;
      state.callSecondsCount = 0;
    }
  } else if (tierMax === 0) {
    state.dailyCredits = 0;
    state.nextCreditResetAt = null;
  }

  // Cache in-memory singleton
  inMemoryState = { ...state };
  cachedUid = uid;

  await saveUserSubscription(inMemoryState);
  return { ...inMemoryState };
}

/**
 * Save user subscription state. Updates in-memory store, dispatches reactive UI event, and writes to Firestore.
 */
export async function saveUserSubscription(state: UserSubscriptionState) {
  const user = auth.currentUser;
  const uid = user ? user.uid : 'guest';

  inMemoryState = { ...state };
  cachedUid = uid;

  try {
    localStorage.setItem(getStorageKey(uid), JSON.stringify(state));
  } catch (e) {}

  // Dispatch custom event for immediate reactive UI updates across all components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('subscription_updated', { detail: { ...inMemoryState } }));
  }

  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'subscription', 'current');
      await setDoc(docRef, { ...inMemoryState, updatedAt: Date.now() }, { merge: true });
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error saving subscription state to Firestore:', e);
      }
    }
  }
}

/**
 * Total available credits (Daily Subscription + Purchased Top-Up)
 */
export function getTotalCredits(state: UserSubscriptionState): number {
  return (state.dailyCredits || 0) + (state.purchasedCredits || 0);
}

/**
 * Deducts credit with priority: Daily Credits first, then Top-Up Credits.
 * Emits real-time subscription_updated event for UI components.
 */
export async function deductCredit(
  typeOrAmount: number | 'mock_test' | 'voice_call_30s' | 'video_call_30s' | 'call_doc_upload' | 'chat_message' | 'call_start_or_minute' | 'vocab_exam'
): Promise<{ success: boolean; newState: UserSubscriptionState; deducted: boolean }> {
  const state = await loadUserSubscription();
  const total = getTotalCredits(state);

  let amount = 1;
  let shouldDeduct = true;

  if (typeof typeOrAmount === 'number') {
    if (typeOrAmount <= 0) {
      return { success: true, newState: state, deducted: false };
    }
    amount = typeOrAmount;
  } else if (typeOrAmount === 'mock_test' || typeOrAmount === 'video_call_30s' || typeOrAmount === 'call_doc_upload') {
    // 3 credits for: Exam Grading, 30-sec Video Call, Upload Photo during call
    amount = 3;
  } else if (typeOrAmount === 'vocab_exam' || typeOrAmount === 'voice_call_30s' || typeOrAmount === 'call_start_or_minute') {
    // 1 credit for: Vocab Exam submission, 30-sec Voice Call (camera off)
    amount = 1;
  } else if (typeOrAmount === 'chat_message') {
    state.chatMessageCount = (state.chatMessageCount || 0) + 1;
    if (state.chatMessageCount >= 5) {
      state.chatMessageCount = 0;
      amount = 1;
    } else {
      shouldDeduct = false;
    }
  }

  if (shouldDeduct) {
    if (total < amount) {
      return { success: false, newState: state, deducted: false };
    }

    let remainingToDeduct = amount;
    if (state.dailyCredits > 0) {
      const fromDaily = Math.min(state.dailyCredits, remainingToDeduct);
      state.dailyCredits -= fromDaily;
      remainingToDeduct -= fromDaily;
    }
    if (remainingToDeduct > 0 && state.purchasedCredits > 0) {
      const fromPurchased = Math.min(state.purchasedCredits, remainingToDeduct);
      state.purchasedCredits -= fromPurchased;
      remainingToDeduct -= fromPurchased;
    }
    if (remainingToDeduct > 0) {
      return { success: false, newState: state, deducted: false };
    }
  }

  // Save to Memory & LocalStorage & Firestore and emit live reactive UI event
  await saveUserSubscription(state);
  return { success: true, newState: { ...state }, deducted: shouldDeduct };
}

/**
 * Upgrade subscription tier for 30 days
 */
export async function upgradeTier(newTier: SubscriptionTier): Promise<UserSubscriptionState> {
  const state = await loadUserSubscription();
  const config = TIER_CONFIGS[newTier];
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  
  const user = auth.currentUser;
  const isSuperAdmin = user && isSuperAdminEmail(user.email);

  state.tier = newTier;
  state.maxDailyCredits = config.dailyCredits;
  
  if (!isSuperAdmin) {
    state.dailyCredits = config.dailyCredits;
    state.lastCreditResetAt = Date.now();
    state.nextCreditResetAt = config.dailyCredits > 0 ? Date.now() + TEN_DAYS_MS : null;
    state.chatMessageCount = 0;
    state.callSecondsCount = 0;
  }
  
  state.expiresAt = newTier === 'FREE' ? null : Date.now() + thirtyDaysMs;
  state.isTrial = false;

  await saveUserSubscription(state);
  return { ...state };
}

/**
 * Add purchased top-up credits (never expires)
 */
export async function addTopupCredits(credits: number): Promise<UserSubscriptionState> {
  const state = await loadUserSubscription();
  state.purchasedCredits = (state.purchasedCredits || 0) + credits;
  await saveUserSubscription(state);
  return { ...state };
}

/**
 * Resets purchased (top-up) credits to 0 for all Google accounts in Firestore,
 * strictly keeping the Super Admin (ittipat15616@gmail.com) exempt.
 */
export async function resetAllNonSuperAdminPurchasedCredits(): Promise<{ updatedCount: number; totalScanned: number }> {
  if (!db) return { updatedCount: 0, totalScanned: 0 };
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    let updatedCount = 0;
    const updatePromises: Promise<void>[] = [];

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      const uid = data.uid || userDoc.id;
      const email = (data.email || '').toLowerCase().trim();

      // STRICT EXEMPTION: Owner (ittipat15616@gmail.com) and Admins are untouched
      if (isSuperAdminEmail(email) || isAdminEmail(email)) {
        continue;
      }

      const subDocRef = doc(db, 'users', uid, 'subscription', 'current');
      const p = getDoc(subDocRef).then(async (subSnap) => {
        if (subSnap.exists()) {
          const subData = subSnap.data() as UserSubscriptionState;
          if ((subData.purchasedCredits || 0) > 0) {
            await setDoc(subDocRef, { purchasedCredits: 0, updatedAt: Date.now() }, { merge: true });
            updatedCount++;
          }
        }
      }).catch((err) => {
        console.warn(`Could not reset credits for user ${uid} (${email}):`, err);
      });

      updatePromises.push(p);
    }

    await Promise.all(updatePromises);
    console.log(`[Credits Maintenance] Reset purchased credits to 0 for ${updatedCount} user(s). ittipat15616@gmail.com preserved.`);
    return { updatedCount, totalScanned: usersSnap.size };
  } catch (err) {
    console.error('Failed to reset non-superadmin purchased credits:', err);
    throw err;
  }
}

/**
 * Sets all regular accounts to Testing Plan expiring in 14 days starting from now,
 * strictly exempting Owner (ittipat15616@gmail.com) and Admins (isAdminEmail).
 */
export async function setAllUsersToTestingPlan(): Promise<{ updatedCount: number; totalScanned: number }> {
  if (!db) return { updatedCount: 0, totalScanned: 0 };
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    let updatedCount = 0;
    const now = Date.now();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const newExpiresAt = now + fourteenDaysMs;

    const updatePromises: Promise<void>[] = [];

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      const uid = data.uid || userDoc.id;
      const email = (data.email || '').toLowerCase().trim();

      // STRICT EXEMPTION: Owner (ittipat15616@gmail.com) and all Admins are NEVER modified
      if (isAdminEmail(email) || isSuperAdminEmail(email)) {
        continue;
      }

      const subDocRef = doc(db, 'users', uid, 'subscription', 'current');
      const p = getDoc(subDocRef).then(async (subSnap) => {
        const existingData = subSnap.exists() ? (subSnap.data() as Partial<UserSubscriptionState>) : {};

        const testingState: UserSubscriptionState = {
          tier: 'TESTING',
          dailyCredits: 0,
          maxDailyCredits: 0,
          purchasedCredits: 0,
          expiresAt: newExpiresAt,
          isTrial: true,
          hasReceivedTestingTrial: true,
          lastDailyResetDate: existingData.lastDailyResetDate || getTodayString(),
          nextCreditResetAt: null,
          lastCreditResetAt: null,
          chatMessageCount: 0,
          callSecondsCount: 0,
        };

        await setDoc(subDocRef, { ...testingState, updatedAt: now }, { merge: true });
        updatedCount++;
      }).catch((err) => {
        console.warn(`Could not set testing plan for user ${uid} (${email}):`, err);
      });

      updatePromises.push(p);
    }

    await Promise.all(updatePromises);
    console.log(`[Testing Plan Maintenance] Updated ${updatedCount} user(s) to Testing Plan (14 days). Owner and admins preserved.`);
    return { updatedCount, totalScanned: usersSnap.size };
  } catch (err) {
    console.error('Failed to set all users to testing plan:', err);
    throw err;
  }
}

/**
 * Ensures that other admin accounts (nongrily@gmail.com, weeranan172550@gmail.com)
 * are configured with Ultra plan Lifetime access (100 years), all tabs accessible,
 * 0 free credits (must top up themselves), and completely free Call page features with BYOK.
 */
export async function syncAdminSubscriptions(): Promise<void> {
  if (!db) return;
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const now = Date.now();
    const lifetimeExpiry = now + 100 * 365 * 24 * 60 * 60 * 1000;

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      const uid = data.uid || userDoc.id;
      const email = (data.email || '').toLowerCase().trim();

      if (isAdminEmail(email) && !isSuperAdminEmail(email)) {
        const subDocRef = doc(db, 'users', uid, 'subscription', 'current');
        const subSnap = await getDoc(subDocRef);
        const existingData = subSnap.exists() ? (subSnap.data() as Partial<UserSubscriptionState>) : {};

        const adminState: Partial<UserSubscriptionState> = {
          tier: 'ULTRA',
          expiresAt: lifetimeExpiry,
          isTrial: false,
          dailyCredits: 0,
          maxDailyCredits: 0,
          nextCreditResetAt: null,
          lastCreditResetAt: null,
          purchasedCredits: existingData.purchasedCredits || 0,
        };

        await setDoc(subDocRef, { ...adminState, updatedAt: now }, { merge: true });
        console.log(`[Admin Setup] Synchronized ${email} to Ultra plan (Lifetime, 0 free credits)`);
      }
    }
  } catch (err) {
    console.warn('Failed to sync admin subscriptions:', err);
  }
}



