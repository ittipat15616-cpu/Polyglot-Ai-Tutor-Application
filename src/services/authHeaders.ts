import { auth } from '../firebase';

/**
 * Returns true only when a real Firebase Google user is currently signed in.
 */
export function isUserSignedIn(): boolean {
  return Boolean(auth.currentUser?.uid);
}

/**
 * Retrieves the signed-in user's current Firebase ID token (or null if signed out).
 */
export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (err) {
    console.warn('[AuthHeaders] Failed to get Firebase ID token:', err);
    return null;
  }
}

/**
 * Builds JSON request headers including Authorization: Bearer <firebaseIdToken>.
 */
export async function getFirebaseAuthHeaders(
  extraHeaders?: Record<string, string>
): Promise<Record<string, string>> {
  const token = await getFirebaseIdToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extraHeaders || {}),
  };
}

/**
 * Opens the app's Google Sign-In modal from anywhere in the UI.
 */
export function openLoginModal(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('request-login-modal'));
  }
}
