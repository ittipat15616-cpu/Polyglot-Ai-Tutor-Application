import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getFirebaseAuthHeaders } from './authHeaders';
import {
  ReadingLang,
  ReadingProgressEntry,
  ReadingStory,
} from '../types/reading';

const PROGRESS_LOCAL_PREFIX = 'reading_progress_v1_';
const CUSTOM_LOCAL_PREFIX = 'reading_custom_v1_';

let progressMemoryCache: Record<string, ReadingProgressEntry> | null = null;
let customMemoryCache: ReadingStory[] | null = null;

function getUidKey(): string {
  return auth.currentUser?.uid || 'guest';
}

export function resetReadingMemoryCache(): void {
  progressMemoryCache = null;
  customMemoryCache = null;
}

function readLocalProgress(): Record<string, ReadingProgressEntry> {
  if (progressMemoryCache) return progressMemoryCache;
  try {
    const raw = localStorage.getItem(`${PROGRESS_LOCAL_PREFIX}${getUidKey()}`);
    if (!raw) {
      progressMemoryCache = {};
      return progressMemoryCache;
    }
    const parsed = JSON.parse(raw);
    progressMemoryCache = parsed && typeof parsed === 'object' ? parsed : {};
    return progressMemoryCache;
  } catch {
    progressMemoryCache = {};
    return progressMemoryCache;
  }
}

function writeLocalProgress(map: Record<string, ReadingProgressEntry>): void {
  progressMemoryCache = map;
  try {
    localStorage.setItem(`${PROGRESS_LOCAL_PREFIX}${getUidKey()}`, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

function readLocalCustom(): ReadingStory[] {
  if (customMemoryCache) return customMemoryCache;
  try {
    const raw = localStorage.getItem(`${CUSTOM_LOCAL_PREFIX}${getUidKey()}`);
    if (!raw) {
      customMemoryCache = [];
      return customMemoryCache;
    }
    const parsed = JSON.parse(raw);
    customMemoryCache = Array.isArray(parsed) ? parsed : [];
    return customMemoryCache;
  } catch {
    customMemoryCache = [];
    return customMemoryCache;
  }
}

function writeLocalCustom(list: ReadingStory[]): void {
  customMemoryCache = list;
  try {
    localStorage.setItem(`${CUSTOM_LOCAL_PREFIX}${getUidKey()}`, JSON.stringify(list));
  } catch {
    // ignore storage quota errors
  }
}

export function getLocalReadingProgressMap(): Record<string, ReadingProgressEntry> {
  return readLocalProgress();
}

export function getLocalCustomArticles(lang?: ReadingLang): ReadingStory[] {
  const all = readLocalCustom();
  if (!lang) return all;
  return all.filter((a) => a.lang === lang);
}

export async function syncReadingProgressWithFirestore(
  forceRefresh = false
): Promise<Record<string, ReadingProgressEntry>> {
  if (forceRefresh) progressMemoryCache = null;
  const local = { ...readLocalProgress() };
  const user = auth.currentUser;
  if (!user || !db) return local;

  try {
    const snap = await getDocs(collection(db, 'users', user.uid, 'reading_progress'));
    snap.forEach((docSnap) => {
      const data = docSnap.data() as ReadingProgressEntry;
      if (data && data.storyId) {
        const prev = local[data.storyId];
        if (
          !prev ||
          (data.lastReadAt || 0) >= (prev.lastReadAt || 0) ||
          (data.completed && !prev.completed)
        ) {
          local[data.storyId] = {
            ...data,
            bestQuizScore: Math.max(data.bestQuizScore || 0, prev?.bestQuizScore || 0),
            readCount: Math.max(data.readCount || 1, prev?.readCount || 1),
            completed: Boolean(data.completed || prev?.completed),
          };
        }
      }
    });
    writeLocalProgress(local);
  } catch {
    // fallback silently to local
  }
  return local;
}

export async function syncCustomArticlesWithFirestore(
  forceRefresh = false
): Promise<ReadingStory[]> {
  if (forceRefresh) customMemoryCache = null;
  const local = [...readLocalCustom()];
  const user = auth.currentUser;
  if (!user || !db) return local;

  try {
    const snap = await getDocs(collection(db, 'users', user.uid, 'reading_custom'));
    const byId = new Map<string, ReadingStory>();
    for (const item of local) byId.set(item.id, item);
    snap.forEach((docSnap) => {
      const data = docSnap.data() as ReadingStory;
      if (data && data.id) {
        byId.set(data.id, { ...data, isCustom: true });
      }
    });
    const merged = Array.from(byId.values()).sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
    writeLocalCustom(merged);
    return merged;
  } catch {
    return local;
  }
}

export async function recordReadingCompletion(params: {
  story: ReadingStory;
  completed?: boolean;
  quizScore?: number;
  quizTotal?: number;
}): Promise<ReadingProgressEntry> {
  const now = Date.now();
  const map = { ...readLocalProgress() };
  const prev = map[params.story.id];

  const entry: ReadingProgressEntry = {
    storyId: params.story.id,
    lang: params.story.lang,
    level: params.story.level,
    completed: Boolean(params.completed ?? true) || Boolean(prev?.completed),
    bestQuizScore:
      typeof params.quizScore === 'number'
        ? Math.max(prev?.bestQuizScore || 0, params.quizScore)
        : prev?.bestQuizScore || 0,
    quizTotal: params.quizTotal ?? prev?.quizTotal ?? params.story.quiz.length,
    readCount: (prev?.readCount || 0) + 1,
    lastReadAt: now,
  };

  map[params.story.id] = entry;
  writeLocalProgress(map);
  window.dispatchEvent(new CustomEvent('reading_updated'));

  const user = auth.currentUser;
  if (user && db) {
    try {
      await setDoc(doc(db, 'users', user.uid, 'reading_progress', entry.storyId), entry, {
        merge: true,
      });
    } catch {
      // keep local silently
    }
  }

  return entry;
}

export async function saveCustomArticle(article: ReadingStory): Promise<ReadingStory> {
  const entry: ReadingStory = {
    ...article,
    isCustom: true,
    createdAt: article.createdAt || Date.now(),
  };

  const list = readLocalCustom().filter((a) => a.id !== entry.id);
  const updated = [entry, ...list];
  writeLocalCustom(updated);
  window.dispatchEvent(new CustomEvent('reading_updated'));

  const user = auth.currentUser;
  if (user && db) {
    try {
      await setDoc(doc(db, 'users', user.uid, 'reading_custom', entry.id), entry, {
        merge: true,
      });
    } catch {
      // keep local silently
    }
  }

  return entry;
}

export async function deleteCustomArticle(articleId: string): Promise<void> {
  const updated = readLocalCustom().filter((a) => a.id !== articleId);
  writeLocalCustom(updated);
  window.dispatchEvent(new CustomEvent('reading_updated'));

  const user = auth.currentUser;
  if (user && db) {
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'reading_custom', articleId));
    } catch {
      // ignore
    }
  }
}

export async function analyzeCustomArticleWithAI(params: {
  text: string;
  lang: ReadingLang;
  title?: string;
  byokKey?: string | null;
}): Promise<{ story?: ReadingStory; error?: string; isQuota429?: boolean; byokInvalidKey?: boolean; authRequired?: boolean }> {
  const res = await fetch('/api/reading/analyze', {
    method: 'POST',
    headers: await getFirebaseAuthHeaders(),
    body: JSON.stringify({
      text: params.text,
      lang: params.lang,
      title: params.title || '',
      byokKey: params.byokKey || undefined,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errText = String(data?.error || 'ไม่สามารถวิเคราะห์บทความได้ในขณะนี้');
    const byokInvalidKey = Boolean(data?.byokInvalidKey);
    const authRequired = Boolean(data?.authRequired || (res.status === 401 && !byokInvalidKey));
    const is429 =
      res.status === 429 ||
      Boolean(data?.byokQuotaExhausted) ||
      errText.includes('429') ||
      errText.toLowerCase().includes('quota') ||
      errText.toLowerCase().includes('resource_exhausted');
    return { error: errText, isQuota429: is429, byokInvalidKey, authRequired };
  }

  return { story: data.story as ReadingStory };
}
