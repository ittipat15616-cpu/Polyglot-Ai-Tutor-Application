import { SubscriptionTier } from '../types/subscription';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseAuthHeaders } from './authHeaders';

const LEGACY_STORAGE_KEY = 'byok_gemini_api_key';
const KEY_STORAGE_PREFIX = 'byok_gemini_api_key_v2_';
const QUOTA_STORAGE_PREFIX = 'byok_daily_quota_v1_';

export type ByokQuotaFeature =
  | 'vocab_exam'
  | 'mock_test'
  | 'karaoke_translate'
  | 'karaoke_explain'
  | 'video_subtitle'
  | 'reading_analyze'
  | 'roleplay_custom'
  | 'roleplay_report'
  | 'shadowing_analyze'
  | 'translate_ai';

export const BYOK_DAILY_LIMITS: Record<ByokQuotaFeature, number> = {
  vocab_exam: 10,
  mock_test: 3,
  karaoke_translate: 10,
  karaoke_explain: 100,
  video_subtitle: 1,
  reading_analyze: 3,
  roleplay_custom: 30,
  roleplay_report: 100,
  shadowing_analyze: 100,
  translate_ai: 150,
};

/** Max video length for BYOK free AI subtitles (5 minutes = 300s, ~12.8MB WAV base64, well below Gemini's 20MB inlineData limit) */
export const BYOK_SUBTITLE_MAX_DURATION_SEC = 300;
/** Safety ceiling on base64 audio payload for BYOK inlineData requests */
export const BYOK_SUBTITLE_MAX_BASE64_BYTES = 18 * 1024 * 1024;

export interface ByokDailyUsage {
  periodKey: string; // YYYY-MM-DD in America/Los_Angeles (resets at ~15:00 ICT matching Google RPD reset)
  vocab_exam: number;
  mock_test: number;
  karaoke_translate: number;
  karaoke_explain: number;
  video_subtitle: number;
  reading_analyze: number;
  roleplay_custom: number;
  roleplay_report: number;
  shadowing_analyze: number;
  translate_ai: number;
  updatedAt: number;
}

export interface ByokQuotaStatus {
  isSignedIn: boolean;
  hasKey: boolean;
  limit: number;
  used: number;
  remaining: number;
  canUseFree: boolean;
  periodKey: string;
}

export interface ByokRates {
  audioCallSecondsPerCredit: number; // 0 means unlimited
  videoCallSecondsPerCredit: number; // 0 means unlimited
  isCallUnlimited: boolean;
  docUploadCreditCost: number; // 0 for free, 1 for 1 credit, etc.
  label: string;
}

/**
 * Returns true strictly when a user is signed in with Firebase Auth.
 */
export function isByokSignedIn(): boolean {
  return Boolean(auth.currentUser?.uid);
}

/**
 * Returns the current Google AI Studio daily quota window key (YYYY-MM-DD in America/Los_Angeles).
 * Google Free Tier RPD resets at midnight Pacific Time (~14:00-15:00 น. Thailand time).
 */
export function getPacificPeriodKey(nowMs: number = Date.now()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date(nowMs)); // YYYY-MM-DD
  } catch {
    const ptDate = new Date(nowMs - 8 * 60 * 60 * 1000);
    return ptDate.toISOString().slice(0, 10);
  }
}

export function getResetTimeLabelThai(): string {
  return '15:00 น. (เวลาไทย)';
}

function getKeyStorageKey(uid: string): string {
  return `${KEY_STORAGE_PREFIX}${uid}`;
}

function getQuotaStorageKey(uid: string): string {
  return `${QUOTA_STORAGE_PREFIX}${uid}`;
}

function createEmptyUsage(periodKey: string): ByokDailyUsage {
  return {
    periodKey,
    vocab_exam: 0,
    mock_test: 0,
    karaoke_translate: 0,
    karaoke_explain: 0,
    video_subtitle: 0,
    reading_analyze: 0,
    roleplay_custom: 0,
    roleplay_report: 0,
    shadowing_analyze: 0,
    translate_ai: 0,
    updatedAt: Date.now(),
  };
}

/**
 * Synchronously read current BYOK daily usage from localStorage for the signed-in user.
 * When signed out, always returns empty usage (BYOK is unavailable while logged out).
 */
export function getByokDailyUsage(uid?: string): ByokDailyUsage {
  const todayKey = getPacificPeriodKey();
  const effectiveUid = uid || auth.currentUser?.uid;
  if (typeof window === 'undefined' || !effectiveUid) return createEmptyUsage(todayKey);

  try {
    const raw = localStorage.getItem(getQuotaStorageKey(effectiveUid));
    if (!raw) return createEmptyUsage(todayKey);
    const parsed = JSON.parse(raw) as Partial<ByokDailyUsage>;
    if (parsed.periodKey !== todayKey) {
      return createEmptyUsage(todayKey);
    }
    return {
      periodKey: todayKey,
      vocab_exam: Math.max(0, Number(parsed.vocab_exam) || 0),
      mock_test: Math.max(0, Number(parsed.mock_test) || 0),
      karaoke_translate: Math.max(0, Number(parsed.karaoke_translate) || 0),
      karaoke_explain: Math.max(0, Number(parsed.karaoke_explain) || 0),
      video_subtitle: Math.max(0, Number(parsed.video_subtitle) || 0),
      reading_analyze: Math.max(0, Number(parsed.reading_analyze) || 0),
      roleplay_custom: Math.max(0, Number(parsed.roleplay_custom) || 0),
      roleplay_report: Math.max(0, Number(parsed.roleplay_report) || 0),
      shadowing_analyze: Math.max(0, Number(parsed.shadowing_analyze) || 0),
      translate_ai: Math.max(0, Number(parsed.translate_ai) || 0),
      updatedAt: Number(parsed.updatedAt) || Date.now(),
    };
  } catch {
    return createEmptyUsage(todayKey);
  }
}

function saveLocalUsage(usage: ByokDailyUsage, uid: string) {
  if (typeof window === 'undefined' || !uid) return;
  try {
    localStorage.setItem(getQuotaStorageKey(uid), JSON.stringify(usage));
    window.dispatchEvent(new CustomEvent('byok_quota_updated', { detail: usage }));
  } catch (e) {
    console.warn('Failed to persist BYOK daily usage locally:', e);
  }
}

/**
 * Sync BYOK daily usage across devices via Firestore users/{uid}/settings/byok_daily_usage.
 * Takes max(local, remote) within the same Pacific period to prevent cross-device drift.
 */
export async function syncByokDailyUsageWithFirestore(userId?: string): Promise<ByokDailyUsage> {
  const todayKey = getPacificPeriodKey();
  const uid = userId || auth.currentUser?.uid;
  if (!uid) return createEmptyUsage(todayKey);

  const localUsage = getByokDailyUsage(uid);
  if (!db) return localUsage;

  try {
    const ref = doc(db, 'users', uid, 'settings', 'byok_daily_usage');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as Partial<ByokDailyUsage>;
      if (data.periodKey === todayKey) {
        const merged: ByokDailyUsage = {
          periodKey: todayKey,
          vocab_exam: Math.max(localUsage.vocab_exam, Number(data.vocab_exam) || 0),
          mock_test: Math.max(localUsage.mock_test, Number(data.mock_test) || 0),
          karaoke_translate: Math.max(localUsage.karaoke_translate, Number(data.karaoke_translate) || 0),
          karaoke_explain: Math.max(localUsage.karaoke_explain, Number(data.karaoke_explain) || 0),
          video_subtitle: Math.max(localUsage.video_subtitle, Number(data.video_subtitle) || 0),
          reading_analyze: Math.max(localUsage.reading_analyze, Number(data.reading_analyze) || 0),
          roleplay_custom: Math.max(localUsage.roleplay_custom, Number(data.roleplay_custom) || 0),
          roleplay_report: Math.max(localUsage.roleplay_report, Number(data.roleplay_report) || 0),
          shadowing_analyze: Math.max(localUsage.shadowing_analyze, Number(data.shadowing_analyze) || 0),
          translate_ai: Math.max(localUsage.translate_ai, Number(data.translate_ai) || 0),
          updatedAt: Date.now(),
        };
        saveLocalUsage(merged, uid);
        return merged;
      }
    }
    saveLocalUsage(localUsage, uid);
    return localUsage;
  } catch (err) {
    console.warn('Could not sync BYOK daily usage from Firestore:', err);
    return localUsage;
  }
}

export function getByokQuotaStatus(feature: ByokQuotaFeature, uid?: string): ByokQuotaStatus {
  const effectiveUid = uid || auth.currentUser?.uid;
  const limit = BYOK_DAILY_LIMITS[feature];
  const todayKey = getPacificPeriodKey();

  if (!effectiveUid) {
    return {
      isSignedIn: false,
      hasKey: false,
      limit,
      used: 0,
      remaining: limit,
      canUseFree: false,
      periodKey: todayKey,
    };
  }

  const hasKey = hasActiveByokKey();
  const usage = getByokDailyUsage(effectiveUid);
  const used = usage[feature] || 0;
  const remaining = Math.max(0, limit - used);
  return {
    isSignedIn: true,
    hasKey,
    limit,
    used,
    remaining,
    canUseFree: hasKey && remaining > 0,
    periodKey: usage.periodKey,
  };
}

/**
 * Consumes 1 unit of a BYOK daily free quota AFTER a successful AI call.
 * Immediately updates localStorage + dispatches byok_quota_updated so UI decrements without lag,
 * then syncs to Firestore in the same flow.
 */
export async function consumeByokFreeQuota(feature: ByokQuotaFeature): Promise<ByokDailyUsage> {
  const uid = auth.currentUser?.uid;
  const todayKey = getPacificPeriodKey();
  if (!uid) {
    return createEmptyUsage(todayKey);
  }

  // Merge latest remote count first (if reachable) so cross-device usage is respected
  const baseline = await syncByokDailyUsageWithFirestore(uid).catch(() => getByokDailyUsage(uid));
  const localLatest = getByokDailyUsage(uid);
  const currentUsed = Math.max(baseline[feature] || 0, localLatest[feature] || 0);

  const updated: ByokDailyUsage = {
    periodKey: todayKey,
    vocab_exam: Math.max(baseline.vocab_exam || 0, localLatest.vocab_exam || 0),
    mock_test: Math.max(baseline.mock_test || 0, localLatest.mock_test || 0),
    karaoke_translate: Math.max(baseline.karaoke_translate || 0, localLatest.karaoke_translate || 0),
    karaoke_explain: Math.max(baseline.karaoke_explain || 0, localLatest.karaoke_explain || 0),
    video_subtitle: Math.max(baseline.video_subtitle || 0, localLatest.video_subtitle || 0),
    reading_analyze: Math.max(baseline.reading_analyze || 0, localLatest.reading_analyze || 0),
    roleplay_custom: Math.max(baseline.roleplay_custom || 0, localLatest.roleplay_custom || 0),
    roleplay_report: Math.max(baseline.roleplay_report || 0, localLatest.roleplay_report || 0),
    shadowing_analyze: Math.max(baseline.shadowing_analyze || 0, localLatest.shadowing_analyze || 0),
    translate_ai: Math.max(baseline.translate_ai || 0, localLatest.translate_ai || 0),
    [feature]: Math.min(BYOK_DAILY_LIMITS[feature], currentUsed + 1),
    updatedAt: Date.now(),
  };

  // Persist locally & notify every mounted UI component immediately
  saveLocalUsage(updated, uid);

  if (db) {
    try {
      const ref = doc(db, 'users', uid, 'settings', 'byok_daily_usage');
      await setDoc(ref, updated, { merge: true });
    } catch (err) {
      console.warn('Failed to sync BYOK daily usage increment to Firestore:', err);
    }
  }

  return updated;
}

/**
 * Get stored BYOK API Key for the currently signed-in user ONLY.
 * Strictly returns null whenever the user is NOT signed in.
 */
export function getStoredByokKey(): string | null {
  if (typeof window === 'undefined') return null;
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  try {
    const scopedKey = localStorage.getItem(getKeyStorageKey(uid));
    if (scopedKey && scopedKey.trim().length > 10) {
      return scopedKey.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clears local BYOK active session state on sign-out and removes any legacy unscoped key.
 * Notifies all components immediately so BYOK UI switches off cleanly.
 */
export function clearLocalByokSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent('byok_key_updated', { detail: { apiKey: null } }));
  window.dispatchEvent(new CustomEvent('byok_quota_updated', { detail: createEmptyUsage(getPacificPeriodKey()) }));
}

/**
 * Save validated BYOK API Key (STRICTLY requires signed-in Google account),
 * persist per-UID locally + sync to Firestore, and emit change events.
 */
export async function setStoredByokKey(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const user = auth.currentUser;
  if (!user?.uid) {
    throw new Error('กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนบันทึก Gemini API Key (BYOK)');
  }

  const cleanKey = apiKey.trim();
  try {
    localStorage.setItem(getKeyStorageKey(user.uid), cleanKey);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('byok_key_updated', { detail: { apiKey: cleanKey } }));
    window.dispatchEvent(new CustomEvent('byok_quota_updated', { detail: getByokDailyUsage(user.uid) }));
  } catch (e) {
    console.error('Failed to save BYOK key to localStorage', e);
  }

  // Cloud Sync: Persist with user's Google account in Firestore
  if (db) {
    try {
      const byokRef = doc(db, 'users', user.uid, 'settings', 'byok');
      await setDoc(byokRef, {
        apiKey: cleanKey,
        updatedAt: Date.now(),
        userEmail: user.email || ''
      }, { merge: true });

      // Redundant backup directly under users/{uid}
      await setDoc(doc(db, 'users', user.uid), {
        byokApiKey: cleanKey,
        byokUpdatedAt: Date.now()
      }, { merge: true });
    } catch (err) {
      console.error('Failed to sync BYOK key to Firestore', err);
    }
  }
}

/**
 * Remove stored BYOK key for the currently signed-in user from localStorage and Firestore.
 */
export async function removeStoredByokKey(): Promise<void> {
  if (typeof window === 'undefined') return;
  const user = auth.currentUser;

  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    if (user?.uid) {
      localStorage.removeItem(getKeyStorageKey(user.uid));
    }
    window.dispatchEvent(new CustomEvent('byok_key_updated', { detail: { apiKey: null } }));
    window.dispatchEvent(new CustomEvent('byok_quota_updated', { detail: getByokDailyUsage(user?.uid) }));
  } catch (e) {
    console.error('Failed to remove BYOK key from localStorage', e);
  }

  if (user?.uid && db) {
    try {
      const byokRef = doc(db, 'users', user.uid, 'settings', 'byok');
      await setDoc(byokRef, {
        apiKey: null,
        updatedAt: Date.now()
      }, { merge: true });

      await setDoc(doc(db, 'users', user.uid), {
        byokApiKey: null,
        byokUpdatedAt: Date.now()
      }, { merge: true });
    } catch (err) {
      console.error('Failed to clear BYOK key from Firestore', err);
    }
  }
}

/**
 * Sync BYOK API Key & daily usage from user's Google Account in Firestore to current device.
 * Strictly no-op when signed out.
 */
export async function syncByokKeyWithFirestore(userId?: string): Promise<string | null> {
  const uid = userId || auth.currentUser?.uid;
  if (!uid) {
    return null;
  }

  // Clean up any legacy unscoped key from older versions so it never leaks across accounts
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {}

  if (!db) return getStoredByokKey();

  try {
    const byokRef = doc(db, 'users', uid, 'settings', 'byok');
    const snap = await getDoc(byokRef);
    let remoteKey: string | null = null;
    let explicitlyClearedInCloud = false;

    if (snap.exists()) {
      const data = snap.data();
      if (data?.apiKey && typeof data.apiKey === 'string' && data.apiKey.trim().length > 10) {
        remoteKey = data.apiKey.trim();
      } else if (data?.apiKey === null) {
        explicitlyClearedInCloud = true;
      }
    }

    // Secondary lookup directly on user root document
    if (!remoteKey && !explicitlyClearedInCloud) {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const uData = userDoc.data();
        if (uData?.byokApiKey && typeof uData.byokApiKey === 'string' && uData.byokApiKey.trim().length > 10) {
          remoteKey = uData.byokApiKey.trim();
        }
      }
    }

    const localKey = getStoredByokKey();

    // Sync daily usage for this signed-in UID and broadcast
    await syncByokDailyUsageWithFirestore(uid).catch(() => {});

    if (remoteKey) {
      localStorage.setItem(getKeyStorageKey(uid), remoteKey);
      window.dispatchEvent(new CustomEvent('byok_key_updated', { detail: { apiKey: remoteKey } }));
      return remoteKey;
    } else if (explicitlyClearedInCloud) {
      localStorage.removeItem(getKeyStorageKey(uid));
      window.dispatchEvent(new CustomEvent('byok_key_updated', { detail: { apiKey: null } }));
      return null;
    } else if (localKey) {
      // Backfill local UID-scoped key to Google account
      await setDoc(byokRef, {
        apiKey: localKey,
        updatedAt: Date.now(),
        userEmail: auth.currentUser?.email || ''
      }, { merge: true });
      await setDoc(doc(db, 'users', uid), {
        byokApiKey: localKey,
        byokUpdatedAt: Date.now()
      }, { merge: true });
      window.dispatchEvent(new CustomEvent('byok_key_updated', { detail: { apiKey: localKey } }));
      return localKey;
    }

    window.dispatchEvent(new CustomEvent('byok_key_updated', { detail: { apiKey: null } }));
    return null;
  } catch (err) {
    console.error('Error syncing BYOK key from Firestore:', err);
    return getStoredByokKey();
  }
}

/**
 * Check if a validated BYOK key is currently active (strictly requires Google Sign-In).
 */
export function hasActiveByokKey(): boolean {
  return Boolean(auth.currentUser?.uid && getStoredByokKey());
}

/**
 * Validates a Gemini API key against the authenticated server validation endpoint.
 */
export async function validateApiKeyWithServer(apiKey: string): Promise<{ valid: boolean; message: string; authRequired?: boolean }> {
  if (!auth.currentUser) {
    return {
      valid: false,
      authRequired: true,
      message: 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนตั้งค่าและตรวจสอบ API Key (BYOK)',
    };
  }
  try {
    const headers = await getFirebaseAuthHeaders();
    const res = await fetch('/api/validate-key', {
      method: 'POST',
      headers,
      body: JSON.stringify({ apiKey: apiKey.trim() })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || data.authRequired) {
      return {
        valid: false,
        authRequired: true,
        message: data.message || 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนตรวจสอบ API Key',
      };
    }
    if (res.ok && data.valid) {
      return { valid: true, message: data.message || 'API Key ใช้งานได้สมบูรณ์' };
    }
    return { valid: false, message: data.message || 'API Key ไม่ถูกต้อง หรือไม่มีสิทธิ์เข้าถึง' };
  } catch {
    return { valid: false, message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อตรวจสอบคีย์ได้ กรุณาลองใหม่อีกครั้ง' };
  }
}

/**
 * Get call and daily free quota benefits for BYOK users.
 */
export function getByokCallRates(_tier?: SubscriptionTier): ByokRates {
  return {
    audioCallSecondsPerCredit: 0,
    videoCallSecondsPerCredit: 0,
    isCallUnlimited: true,
    docUploadCreditCost: 0,
    label: 'คอล AI ฟรีไม่อั้น + แปลภาษา AI เจาะลึก 150 • สอบศัพท์ 10 • ฝึกพูดตามประโยค AI 100 • ตรวจข้อสอบ 3 • แปลเพลงใหม่ 10 • อธิบายคำเพลง 100 • บทความส่วนตัว 3 • สร้างด่าน Roleplay 30 • สรุปคะแนน Roleplay 100 • ใส่ซับ AI 1 คลิป/วัน'
  };
}
