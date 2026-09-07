import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

const provider = new GoogleAuthProvider();

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const getLocalSessionId = () => {
  let sessionId = localStorage.getItem('app_session_id');
  if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('app_session_id', sessionId);
  }
  return sessionId;
};

export const saveUserProfileToFirestore = async (user: User) => {
  if (!db || !user) return;
  try {
    const userRef = doc(db, 'users', user.uid);
    const sessionId = getLocalSessionId();
    await setDoc(userRef, {
      uid: user.uid,
      displayName: user.displayName || user.email?.split('@')[0] || 'User',
      email: user.email || '',
      photoURL: user.photoURL || '',
      lastLoginAt: Date.now(),
      currentSessionId: sessionId
    }, { merge: true });
  } catch (err) {
    console.error('Error saving user profile to Firestore:', err);
  }
};

export const listenToUserSession = (user: User, onSessionConflict: () => void) => {
  if (!db) return () => {};
  
  const userRef = doc(db, 'users', user.uid);
  return onSnapshot(userRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      const localSessionId = localStorage.getItem('app_session_id');
      if (data.currentSessionId && localSessionId && data.currentSessionId !== localSessionId) {
        // Conflict! Another device logged in
        onSessionConflict();
      }
    }
  });
};

export const initAuth = (
  onAuthSuccess?: (user: User, token?: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      await saveUserProfileToFirestore(user);
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken || '');
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    cachedAccessToken = credential?.accessToken || null;
    await saveUserProfileToFirestore(result.user);
    return { user: result.user, accessToken: cachedAccessToken || '' };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};
