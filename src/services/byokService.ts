import { SubscriptionTier } from '../types/subscription';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const STORAGE_KEY = 'byok_gemini_api_key';
const QUOTA_STORAGE_PREFIX = 'byok_daily_quota_v1_';

export type ByokQuotaFeature = 'vocab_exam' | 'mock_test' | 'karaoke_translate' | 'video_subtitle';

export const BYOK_DAILY_LIMITS: Record<ByokQuotaFeature, number> = {
  vocab_exam: 7,
  mock_test: 3,
  karaoke_translate: 3,
  video_subtitle: 1,
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
  video_subtitle: number;
  updatedAt: number;
}

export interface ByokRates {
  audioCallSecondsPerCredit: number; // 0 means unlimited
  videoCallSecondsPerCredit: number; // 0 means unlimited
  isCallUnlimited: boolean;
  docUploadCreditCost: number; // 0 for free, 1 for 1 credit, etc.
  label: string;
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
    // Fallback: UTC-8 approximation
    const ptDate = new Date(nowMs - 8 * 60 * 60 * 1000);
    return ptDate.toISOString().slice(0, 10);
  }
}

export function getResetTimeLabelThai(): string {
  return '15:00 น. (เวลาไทย)';
}

function getQuotaStorageKey(uid?: string): string {
  const effectiveUid = uid || auth.currentUser?.uid || 'guest';
  return `${QUOTA_STORAGE_PREFIX}${effectiveUid}`;
}

function createEmptyUsage(periodKey: string): ByokDailyUsage {
  return {
    periodKey,
    vocab_exam: 0,
    mock_test: 0,
    karaoke_translate: 0,
    video_subtitle: 0,
    updatedAt: Date.now(),
  };
}

/**
 * Synchronously read current BYOK daily usage from localStorage (resets cleanly if periodKey changed).
 */
export function getByokDailyUsage(uid?: string): ByokDailyUsage {
  const todayKey = getPacificPeriodKey();
  if (typeof window === 'undefined') return createEmptyUsage(todayKey);

  try {
    const raw = localStorage.getItem(getQuotaStorageKey(uid));
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
      video_subtitle: Math.max(0, Number(parsed.video_subtitle) || 0),
      updatedAt: Number(parsed.updatedAt) || Date.now(),
    };
  } catch {
    return createEmptyUsage(todayKey);
  }
}

function saveLocalUsage(usage: ByokDailyUsage, uid?: string) {
  if (typeof window === 'undefined') return;
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
  const localUsage = getByokDailyUsage(uid);

  if (!uid || !db) return localUsage;

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
          video_subtitle: Math.max(localUsage.video_subtitle, Number(data.video_subtitle) || 0),
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

export function getByokQuotaStatus(feature: ByokQuotaFeature, uid?: string): {
  hasKey: boolean;
  limit: number;
  used: number;
  remaining: number;
  canUseFree: boolean;
  periodKey: string;
} {
  const hasKey = hasActiveByokKey();
  const usage = getByokDailyUsage(uid);
  const limit = BYOK_DAILY_LIMITS[feature];
  const used = usage[feature] || 0;
  const remaining = Math.max(0, limit - used);
  return {
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
 */
export async function consumeByokFreeQuota(feature: ByokQuotaFeature): Promise<ByokDailyUsage> {
  const uid = auth.currentUser?.uid;
  const current = await syncByokDailyUsageWithFirestore(uid);
  const updated: ByokDailyUsage = {
    ...current,
    [feature]: Math.min(BYOK_DAILY_LIMITS[feature], (current[feature] || 0) + 1),
    updatedAt: Date.now(),
  };

  saveLocalUsage(updated, uid);

  if (uid && db) {
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
 * Get stored BYOK API Key from localStorage
 */
export function getStoredByokKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = localStorage.getItem(STORAGE_KEY);
    return key && key.trim().length > 10 ? key.trim() : null;
  } catch (e) {
    return null;
  }
}

/**
 * Save validated BYOK API Key to localStorage, sync to user's Google account in Firestore, and emit change event
 */
export async function setStoredByokKey(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const cleanKey = apiKey.trim();
  try {
    localStorage.setItem(STORAGE_KEY, cleanKey);
    window.dispatchEvent(new CustomEvent('byok_key_updated', { detail: { apiKey: cleanKey } }));
  } catch (e) {
    console.error('Failed to save BYOK key to localStorage', e);
  }

  // Cloud Sync: Persist with user's Google account in Firestore
  if (auth.currentUser && db) {
    try {
      const byokRef = doc(db, 'users', auth.currentUser.uid, 'settings', 'byok');
      await setDoc(byokRef, {
        apiKey: cleanKey,
        updatedAt: Date.now(),
        userEmail: auth.currentUser.email || ''
      }, { merge: true });

      // Redundant backup directly under users/{uid}
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        byokApiKey: cleanKey,
        byokUpdatedAt: Date.now()
      }, { merge: true });
    } catch (err) {
      console.error('Failed to sync BYOK key to Firestore', err);
    }
  }
}

/**
 * Remove stored BYOK key from localStorage and clear from user's Google account in Firestore
 */
export async function removeStoredByokKey(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('byok_key_updated', { detail: { apiKey: null } }));
  } catch (e) {
    console.error('Failed to remove BYOK key from localStorage', e);
  }

  // Clear from user's Google account in Firestore
  if (auth.currentUser && db) {
    try {
      const byokRef = doc(db, 'users', auth.currentUser.uid, 'settings', 'byok');
      await setDoc(byokRef, {
        apiKey: null,
        updatedAt: Date.now()
      }, { merge: true });

      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        byokApiKey: null,
        byokUpdatedAt: Date.now()
      }, { merge: true });
    } catch (err) {
      console.error('Failed to clear BYOK key from Firestore', err);
    }
  }
}

/**
 * Sync BYOK API Key from user's Google Account in Firestore to current device
 */
export async function syncByokKeyWithFirestore(userId?: string): Promise<string | null> {
  const uid = userId || auth.currentUser?.uid;
  if (!uid || !db) return getStoredByokKey();

  try {
    const byokRef = doc(db, 'users', uid, 'settings', 'byok');
    const snap = await getDoc(byokRef);
    let remoteKey: string | null = null;

    if (snap.exists()) {
      const data = snap.data();
      if (data?.apiKey && typeof data.apiKey === 'string' && data.apiKey.trim().length > 10) {
        remoteKey = data.apiKey.trim();
      }
    }

    // Secondary lookup directly on user root document
    if (!remoteKey) {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const uData = userDoc.data();
        if (uData?.byokApiKey && typeof uData.byokApiKey === 'string' && uData.byokApiKey.trim().length > 10) {
          remoteKey = uData.byokApiKey.trim();
        }
      }
    }

    const localKey = getStoredByokKey();

    // Also sync daily usage in background
    syncByokDailyUsageWithFirestore(uid).catch(() => {});

    if (remoteKey) {
      if (remoteKey !== localKey) {
        localStorage.setItem(STORAGE_KEY, remoteKey);
        window.dispatchEvent(new CustomEvent('byok_key_updated', { detail: { apiKey: remoteKey } }));
      }
      return remoteKey;
    } else if (localKey) {
      // Backfill local key to Google account
      await setDoc(byokRef, {
        apiKey: localKey,
        updatedAt: Date.now(),
        userEmail: auth.currentUser?.email || ''
      }, { merge: true });
      await setDoc(doc(db, 'users', uid), {
        byokApiKey: localKey,
        byokUpdatedAt: Date.now()
      }, { merge: true });
      return localKey;
    }

    return null;
  } catch (err) {
    console.error('Error syncing BYOK key from Firestore:', err);
    return getStoredByokKey();
  }
}

/**
 * Check if a validated BYOK key is currently active
 */
export function hasActiveByokKey(): boolean {
  return Boolean(getStoredByokKey());
}

/**
 * Validates a Gemini API key by testing it against the server validation endpoint
 */
export async function validateApiKeyWithServer(apiKey: string): Promise<{ valid: boolean; message: string }> {
  try {
    const res = await fetch('/api/validate-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: apiKey.trim() })
    });
    const data = await res.json();
    if (res.ok && data.valid) {
      return { valid: true, message: data.message || 'API Key ใช้งานได้สมบูรณ์' };
    }
    return { valid: false, message: data.message || 'API Key ไม่ถูกต้อง หรือไม่มีสิทธิ์เข้าถึง' };
  } catch (err: any) {
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
    label: 'คอล AI ฟรีไม่อั้น + สอบศัพท์ 7 • ตรวจข้อสอบ 3 • แปลเพลงใหม่ 3 • ใส่ซับ AI 1 คลิป/วัน (≤5 นาที)'
  };
}
