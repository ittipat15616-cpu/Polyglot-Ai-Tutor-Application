import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, getDocs, collection, query, orderBy, limit } from 'firebase/firestore';

function getUserStorageKey(baseKey: string): string {
  const user = auth.currentUser;
  return user ? `user_${user.uid}_${baseKey}` : `guest_${baseKey}`;
}

// -------------------------------------------------------------
// 1. ANNOTATIONS (Canvas/Highlights/Text) - EXCLUDES Mock Tests
// -------------------------------------------------------------
export async function saveAnnotationData(sheetId: string, data: { strokes: any[]; texts: any[] }) {
  // EXCEPTION RULE: Do not save annotations for Mock Test page!
  if (!sheetId || sheetId.toLowerCase().includes('mock')) {
    return;
  }

  const key = getUserStorageKey(`annotations_${sheetId}`);
  try {
    if (data.strokes.length === 0 && data.texts.length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch (e) {}

  const user = auth.currentUser;
  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'annotations', sheetId);
      if (data.strokes.length === 0 && data.texts.length === 0) {
        await setDoc(docRef, { strokes: [], texts: [], updatedAt: Date.now() });
      } else {
        await setDoc(docRef, { ...data, updatedAt: Date.now() }, { merge: true });
      }
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error saving annotation to Firestore:', e);
      }
    }
  }
}

export async function loadAnnotationData(sheetId: string): Promise<{ strokes: any[]; texts: any[] } | null> {
  if (!sheetId || sheetId.toLowerCase().includes('mock')) {
    return null;
  }

  const user = auth.currentUser;
  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'annotations', sheetId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return { strokes: data.strokes || [], texts: data.texts || [] };
      }
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error loading annotation from Firestore:', e);
      }
    }
  }

  // Account-scoped LocalStorage Cache / Guest Fallback
  const key = getUserStorageKey(`annotations_${sheetId}`);
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
  } catch (e) {}

  return null;
}

// -------------------------------------------------------------
// 2. FLASHCARD PROGRESS & BOOKMARK
// -------------------------------------------------------------
export interface FlashcardProgress {
  level: string;
  lang: string;
  currentIndex: number;
  totalCards: number;
  updatedAt: number;
}

export async function saveFlashcardProgress(level: string, lang: string, currentIndex: number, totalCards: number) {
  const payload: FlashcardProgress = {
    level,
    lang,
    currentIndex,
    totalCards,
    updatedAt: Date.now()
  };

  const levelKey = `${lang}_${level.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const keyProgress = getUserStorageKey(`flashcards_progress_${levelKey}`);
  const keyLastBookmark = getUserStorageKey(`flashcards_last_bookmark_${lang}`);
  try {
    localStorage.setItem(keyProgress, JSON.stringify(payload));
    localStorage.setItem(keyLastBookmark, JSON.stringify(payload));
  } catch (e) {}

  const user = auth.currentUser;
  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'flashcard_progress', levelKey);
      await setDoc(docRef, payload, { merge: true });

      const lastRef = doc(db, 'users', user.uid, 'flashcard_progress', `last_active_${lang}`);
      await setDoc(lastRef, payload, { merge: true });
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error saving flashcard progress to Firestore:', e);
      }
    }
  }
}

export async function loadFlashcardProgress(level: string, lang: string): Promise<FlashcardProgress | null> {
  const levelKey = `${lang}_${level.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const user = auth.currentUser;

  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'flashcard_progress', levelKey);
      const snap = await getDoc(docRef);
      if (snap.exists()) return snap.data() as FlashcardProgress;
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error loading flashcard progress from Firestore:', e);
      }
    }
  }

  const keyProgress = getUserStorageKey(`flashcards_progress_${levelKey}`);
  try {
    const saved = localStorage.getItem(keyProgress);
    if (saved) return JSON.parse(saved);
  } catch (e) {}

  return null;
}

export async function loadLastFlashcardBookmark(lang: string): Promise<FlashcardProgress | null> {
  const user = auth.currentUser;
  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'flashcard_progress', `last_active_${lang}`);
      const snap = await getDoc(docRef);
      if (snap.exists()) return snap.data() as FlashcardProgress;
    } catch (e) {}
  }

  const keyLastBookmark = getUserStorageKey(`flashcards_last_bookmark_${lang}`);
  try {
    const saved = localStorage.getItem(keyLastBookmark);
    if (saved) return JSON.parse(saved);
  } catch (e) {}

  return null;
}

export async function saveFlashcardWordStates(mastered: Record<string, boolean>, review: Record<string, boolean>) {
  const keyMastered = getUserStorageKey('flashcards_mastered');
  const keyReview = getUserStorageKey('flashcards_review');
  try {
    localStorage.setItem(keyMastered, JSON.stringify(mastered));
    localStorage.setItem(keyReview, JSON.stringify(review));
  } catch (e) {}

  const user = auth.currentUser;
  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'flashcard_progress', 'word_states');
      await setDoc(docRef, { mastered, review, updatedAt: Date.now() }, { merge: true });
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error saving flashcard word states to Firestore:', e);
      }
    }
  }
}

export async function loadFlashcardWordStates(): Promise<{ mastered: Record<string, boolean>; review: Record<string, boolean> }> {
  const user = auth.currentUser;
  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'flashcard_progress', 'word_states');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return { mastered: data.mastered || {}, review: data.review || {} };
      }
    } catch (e) {}
  }

  const keyMastered = getUserStorageKey('flashcards_mastered');
  const keyReview = getUserStorageKey('flashcards_review');
  try {
    const savedM = localStorage.getItem(keyMastered);
    const savedR = localStorage.getItem(keyReview);
    return {
      mastered: savedM ? JSON.parse(savedM) : {},
      review: savedR ? JSON.parse(savedR) : {}
    };
  } catch (e) {
    return { mastered: {}, review: {} };
  }
}

// -------------------------------------------------------------
// 3. MOCK TEST RESULTS & AI FEEDBACK HISTORY
// -------------------------------------------------------------
export interface MockTestResultRecord {
  id?: string;
  examId: string;
  title: string;
  lang: 'EN' | 'CN' | 'TH';
  level: string;
  part: string;
  score: number;
  maxScore: number;
  isPass: boolean;
  aiFeedback?: string;
  strengths?: string[];
  weaknesses?: string[];
  resultsBreakdown?: any[];
  createdAt: number;
}

export async function saveMockTestResult(record: MockTestResultRecord) {
  const id = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const fullRecord = { ...record, id };
  const cleanRecord = JSON.parse(JSON.stringify(fullRecord));

  const keyHistory = getUserStorageKey('mock_test_results_history');
  try {
    const existing = JSON.parse(localStorage.getItem(keyHistory) || '[]');
    existing.unshift(cleanRecord);
    localStorage.setItem(keyHistory, JSON.stringify(existing.slice(0, 30)));
  } catch (e) {}

  const user = auth.currentUser;
  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'mock_results', id);
      await setDoc(docRef, cleanRecord);
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error saving mock test result to Firestore:', e);
      }
    }
  }
  return id;
}

export async function loadMockTestResultsHistory(): Promise<MockTestResultRecord[]> {
  const user = auth.currentUser;
  if (user && db) {
    try {
      const q = query(
        collection(db, 'users', user.uid, 'mock_results'),
        orderBy('createdAt', 'desc'),
        limit(30)
      );
      const snap = await getDocs(q);
      const list: MockTestResultRecord[] = [];
      snap.forEach(doc => list.push(doc.data() as MockTestResultRecord));
      return list;
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error fetching mock test history from Firestore:', e);
      }
    }
  }

  const keyHistory = getUserStorageKey('mock_test_results_history');
  try {
    const saved = localStorage.getItem(keyHistory);
    if (saved) return JSON.parse(saved);
  } catch (e) {}

  return [];
}

// -------------------------------------------------------------
// 4. VOCAB GAMES STAR RATINGS (1, 2, or 3 Stars)
// -------------------------------------------------------------
export interface StageStarRecord {
  gameId: string;
  subLevel: string;
  stageNumber: number;
  stars: number; // 1, 2, or 3
  mistakes: number;
  updatedAt: number;
}

export function calculateStars(mistakes: number): number {
  if (mistakes === 0) return 3;
  if (mistakes <= 2) return 2;
  return 1;
}

export async function saveGameStageStars(gameId: string, subLevel: string, stageNumber: number, mistakes: number) {
  const stars = calculateStars(mistakes);
  const stageKey = `${gameId}_${subLevel}_${stageNumber}`;
  const record: StageStarRecord = {
    gameId,
    subLevel,
    stageNumber,
    stars,
    mistakes,
    updatedAt: Date.now()
  };

  const keyStars = getUserStorageKey('vocab_game_stars');
  try {
    const existing = JSON.parse(localStorage.getItem(keyStars) || '{}');
    const prevStars = existing[stageKey]?.stars || 0;
    if (stars > prevStars) {
      existing[stageKey] = record;
      localStorage.setItem(keyStars, JSON.stringify(existing));
    }
  } catch (e) {}

  const user = auth.currentUser;
  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'game_stars', stageKey);
      const snap = await getDoc(docRef);
      const prevStars = snap.exists() ? (snap.data()?.stars || 0) : 0;
      if (stars > prevStars) {
        await setDoc(docRef, record, { merge: true });
      }
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error saving game stars to Firestore:', e);
      }
    }
  }
}

export async function loadGameStageStars(): Promise<Record<string, StageStarRecord>> {
  const mergedStars: Record<string, StageStarRecord> = {};

  const keyStars = getUserStorageKey('vocab_game_stars');
  try {
    const saved = localStorage.getItem(keyStars);
    if (saved) {
      Object.assign(mergedStars, JSON.parse(saved));
    }
  } catch (e) {}

  const user = auth.currentUser;
  if (user && db) {
    try {
      const snap = await getDocs(collection(db, 'users', user.uid, 'game_stars'));
      snap.forEach(doc => {
        const firestoreData = doc.data() as StageStarRecord;
        if (!mergedStars[doc.id] || firestoreData.stars > mergedStars[doc.id].stars) {
          mergedStars[doc.id] = firestoreData;
        }
      });
      // Sync merged back to local storage
      localStorage.setItem(keyStars, JSON.stringify(mergedStars));
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error loading game stars from Firestore:', e);
      }
    }
  }

  return mergedStars;
}

// -------------------------------------------------------------
// 5. MODULE LEARNING PROGRESS BOOKMARKS (EN/CN SEPARATED)
// -------------------------------------------------------------
export interface ModuleBookmark {
  module: 'vocab' | 'exercises' | 'exams' | 'handwriting';
  lang: string;
  title: string;
  subtitle?: string;
  data: any;
  updatedAt: number;
}

export async function saveModuleBookmark(
  module: 'vocab' | 'exercises' | 'exams' | 'handwriting',
  lang: string,
  title: string,
  data: any,
  subtitle?: string
) {
  const rawPayload = {
    module,
    lang,
    title,
    subtitle,
    data,
    updatedAt: Date.now()
  };
  const payload = JSON.parse(JSON.stringify(rawPayload)) as ModuleBookmark;

  const bookmarkKey = `${module}_bookmark_${lang}`;
  const localKey = getUserStorageKey(bookmarkKey);

  try {
    localStorage.setItem(localKey, JSON.stringify(payload));
  } catch (e) {}

  const user = auth.currentUser;
  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'module_bookmarks', bookmarkKey);
      await setDoc(docRef, payload, { merge: true });
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error(`Error saving ${module} bookmark to Firestore:`, e);
      }
    }
  }
}

export async function loadModuleBookmark(
  module: 'vocab' | 'exercises' | 'exams' | 'handwriting',
  lang: string
): Promise<ModuleBookmark | null> {
  const bookmarkKey = `${module}_bookmark_${lang}`;
  const user = auth.currentUser;

  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'module_bookmarks', bookmarkKey);
      const snap = await getDoc(docRef);
      if (snap.exists()) return snap.data() as ModuleBookmark;
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error(`Error loading ${module} bookmark from Firestore:`, e);
      }
    }
  }

  const localKey = getUserStorageKey(bookmarkKey);
  try {
    const saved = localStorage.getItem(localKey);
    if (saved) return JSON.parse(saved);
  } catch (e) {}

  return null;
}

// -------------------------------------------------------------
// 6. VOCAB TEST RESULTS HISTORY
// -------------------------------------------------------------
export interface VocabTestItemResult {
  wordId: string;
  targetWord: string;
  targetTranslation: string;
  userWord: string;
  userTranslation: string;
  isWordCorrect: boolean;
  isTranslationCorrect: boolean;
}

export interface VocabTestResultRecord {
  id?: string;
  lang: 'EN' | 'CN' | 'TH';
  levelFilter: string;
  scopeRange: string;
  correctWords: number;
  correctTrans: number;
  totalQuestions: number;
  items: VocabTestItemResult[];
  createdAt: number;
}

export async function saveVocabTestResult(record: VocabTestResultRecord) {
  const id = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const fullRecord = { ...record, id };
  const cleanRecord = JSON.parse(JSON.stringify(fullRecord));

  const keyHistory = getUserStorageKey('vocab_test_results_history');
  try {
    const existing = JSON.parse(localStorage.getItem(keyHistory) || '[]');
    existing.unshift(cleanRecord);
    localStorage.setItem(keyHistory, JSON.stringify(existing.slice(0, 30)));
  } catch (e) {}

  const user = auth.currentUser;
  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'vocab_test_results', id);
      await setDoc(docRef, cleanRecord);
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error saving vocab test result to Firestore:', e);
      }
    }
  }
  return id;
}

export async function loadVocabTestResultsHistory(): Promise<VocabTestResultRecord[]> {
  const user = auth.currentUser;
  if (user && db) {
    try {
      const q = query(
        collection(db, 'users', user.uid, 'vocab_test_results'),
        orderBy('createdAt', 'desc'),
        limit(30)
      );
      const snap = await getDocs(q);
      const list: VocabTestResultRecord[] = [];
      snap.forEach(doc => list.push(doc.data() as VocabTestResultRecord));
      return list;
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error fetching vocab test history from Firestore:', e);
      }
    }
  }

  const keyHistory = getUserStorageKey('vocab_test_results_history');
  try {
    const saved = localStorage.getItem(keyHistory);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
}

// -------------------------------------------------------------
// 5. GOODNOTES MODE FLASHCARDS
// -------------------------------------------------------------
export interface GoodnotesDeckState {
  level: string;
  lang: string;
  deckIndex: number;
  masteredKeys: string[];
  reviewKeys: string[];
  sessionKeys?: string[];
  currentIndex: number;
  runMode: 'all' | 'review';
  isCompleted: boolean;
  updatedAt: number;
}

export async function saveGoodnotesDeckState(state: GoodnotesDeckState) {
  const levelKey = `${state.lang}_${state.level.replace(/[^a-zA-Z0-9]/g, '_')}_deck_${state.deckIndex}`;
  state.updatedAt = Date.now();
  
  const keyStorage = getUserStorageKey(`goodnotes_state_${levelKey}`);
  try {
    localStorage.setItem(keyStorage, JSON.stringify(state));
  } catch (e) {}

  const user = auth.currentUser;
  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'goodnotes_progress', levelKey);
      await setDoc(docRef, state, { merge: true });
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error saving goodnotes state to Firestore:', e);
      }
    }
  }
}

export async function loadGoodnotesDeckState(level: string, lang: string, deckIndex: number): Promise<GoodnotesDeckState | null> {
  const levelKey = `${lang}_${level.replace(/[^a-zA-Z0-9]/g, '_')}_deck_${deckIndex}`;
  const user = auth.currentUser;

  if (user && db) {
    try {
      const docRef = doc(db, 'users', user.uid, 'goodnotes_progress', levelKey);
      const snap = await getDoc(docRef);
      if (snap.exists()) return snap.data() as GoodnotesDeckState;
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error loading goodnotes state from Firestore:', e);
      }
    }
  }

  const keyStorage = getUserStorageKey(`goodnotes_state_${levelKey}`);
  try {
    const saved = localStorage.getItem(keyStorage);
    if (saved) return JSON.parse(saved);
  } catch (e) {}

  return null;
}

export async function loadAllGoodnotesStates(lang: string): Promise<GoodnotesDeckState[]> {
  const user = auth.currentUser;
  const states: GoodnotesDeckState[] = [];

  if (user && db) {
    try {
      const collRef = collection(db, 'users', user.uid, 'goodnotes_progress');
      const snap = await getDocs(collRef);
      snap.forEach(doc => {
        const data = doc.data() as GoodnotesDeckState;
        if (data.lang === lang) {
          states.push(data);
        }
      });
      return states;
    } catch (e: any) {
      if (e?.code !== 'unavailable' && !e?.message?.includes('offline')) {
        console.error('Error loading all goodnotes states from Firestore:', e);
      }
    }
  }

  // Fallback to local storage iteration if no user/error
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const prefix = getUserStorageKey(`goodnotes_state_${lang}_`);
      if (key && key.startsWith(prefix)) {
        const val = localStorage.getItem(key);
        if (val) states.push(JSON.parse(val));
      }
    }
  } catch (e) {}

  return states;
}
