import { SubscriptionTier } from '../types/subscription';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const STORAGE_KEY = 'byok_gemini_api_key';

export interface ByokRates {
  audioCallSecondsPerCredit: number; // 0 means unlimited
  videoCallSecondsPerCredit: number; // 0 means unlimited
  isCallUnlimited: boolean;
  docUploadCreditCost: number; // 0 for free, 1 for 1 credit, etc.
  label: string;
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
      console.log('Successfully synced BYOK key to Google account in Firestore');
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
      console.log('Successfully cleared BYOK key from Firestore');
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
 * Get call and upload rates for BYOK users based on their active subscription tier
 */
export function getByokCallRates(tier: SubscriptionTier): ByokRates {
  switch (tier) {
    case 'ULTRA':
    case 'PRO':
      return {
        audioCallSecondsPerCredit: 0,
        videoCallSecondsPerCredit: 0,
        isCallUnlimited: true,
        docUploadCreditCost: 0, // Free photo upload!
        label: 'คอล & วิดีโอคอลไม่อั้น (0 เครดิต) + ส่งรูปฟรี'
      };

    case 'PREMIUM':
      return {
        audioCallSecondsPerCredit: 0,
        videoCallSecondsPerCredit: 0,
        isCallUnlimited: true,
        docUploadCreditCost: 1, // 1 credit for photo
        label: 'คอล & วิดีโอคอลไม่อั้น (0 เครดิต) + ส่งรูป 1 เครดิต'
      };

    case 'PLUS':
      return {
        audioCallSecondsPerCredit: 600, // 10 minutes
        videoCallSecondsPerCredit: 300, // 5 minutes
        isCallUnlimited: false,
        docUploadCreditCost: 1,
        label: 'คอลเสียง 10 นาที / วิดีโอคอล 5 นาที ต่อ 1 เครดิต (ส่งรูป 1 เครดิต)'
      };

    case 'BASIC':
      return {
        audioCallSecondsPerCredit: 300, // 5 minutes
        videoCallSecondsPerCredit: 180, // 3 minutes
        isCallUnlimited: false,
        docUploadCreditCost: 1,
        label: 'คอลเสียง 5 นาที / วิดีโอคอล 3 นาที ต่อ 1 เครดิต (ส่งรูป 1 เครดิต)'
      };

    case 'TESTING':
      return {
        audioCallSecondsPerCredit: 0,
        videoCallSecondsPerCredit: 0,
        isCallUnlimited: true,
        docUploadCreditCost: 0, // Free photo & document upload during 14-day Testing trial!
        label: 'สิทธิ์ทดลองใช้ 14 วัน: คอลเสียง & วิดีโอคอลไม่อั้น (0 เครดิต) + ส่งรูป/เอกสารฟรี'
      };

    case 'STARTER':
    case 'FREE':
    default:
      return {
        audioCallSecondsPerCredit: 120, // 2 minutes
        videoCallSecondsPerCredit: 60,  // 1 minute
        isCallUnlimited: false,
        docUploadCreditCost: 1,
        label: 'คอลเสียง 2 นาที / วิดีโอคอล 1 นาที ต่อ 1 เครดิต (ส่งรูป 1 เครดิต)'
      };
  }
}
