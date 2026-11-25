import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  LogMistakeInput,
  MistakeEntry,
} from '../types/mistakes';
import { WordbookLang } from '../types/wordbook';

export const MASTERY_STREAK_TARGET = 2;

const STORAGE_PREFIX = 'polyglot_mistake_notebook_v1_';

let memoryCacheUid: string | null = null;
let memoryEntries: MistakeEntry[] | null = null;
let firestoreSyncedUid: string | null = null;

function getCurrentUidKey(): string {
  return auth.currentUser?.uid || 'guest';
}

function getStorageKey(uidKey: string): string {
  return `${STORAGE_PREFIX}${uidKey}`;
}

function notifyMistakesUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mistakes_updated'));
  }
}

function stripUndefined<T extends Record<string, any>>(obj: T): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) cleaned[k] = v;
  }
  return cleaned;
}

/**
 * Deterministic Firestore-safe ID from (lang, source, prompt, correctAnswer)
 * so missing the same question again updates wrongCount instead of creating duplicates.
 */
export function makeMistakeId(
  lang: WordbookLang,
  source: string,
  prompt: string,
  correctAnswer: string
): string {
  const key = `${lang}|${source}|${prompt.trim().toLowerCase()}|${correctAnswer.trim().toLowerCase()}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `${lang.toLowerCase()}_${source}_${hex}`;
}

function readLocalEntries(uidKey: string): MistakeEntry[] {
  try {
    const raw = localStorage.getItem(getStorageKey(uidKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is MistakeEntry =>
        Boolean(item && typeof item.id === 'string' && typeof item.prompt === 'string')
    );
  } catch {
    return [];
  }
}

function writeLocalEntries(uidKey: string, entries: MistakeEntry[]): void {
  try {
    localStorage.setItem(getStorageKey(uidKey), JSON.stringify(entries));
  } catch (err) {
    console.warn('Failed to write mistakes to localStorage:', err);
  }
}

function ensureMemoryLoaded(): MistakeEntry[] {
  const uidKey = getCurrentUidKey();
  if (memoryCacheUid !== uidKey || memoryEntries === null) {
    memoryCacheUid = uidKey;
    memoryEntries = readLocalEntries(uidKey);
  }
  return memoryEntries;
}

function setMemoryAndLocal(entries: MistakeEntry[]): void {
  const uidKey = getCurrentUidKey();
  memoryCacheUid = uidKey;
  memoryEntries = entries;
  writeLocalEntries(uidKey, entries);
  notifyMistakesUpdated();
}

export function getCachedMistakes(lang?: WordbookLang): MistakeEntry[] {
  const list = ensureMemoryLoaded();
  const filtered = lang ? list.filter((e) => e.lang === lang) : list;
  return [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getActiveMistakeCount(lang: WordbookLang): number {
  return ensureMemoryLoaded().filter((e) => e.lang === lang && e.status === 'active').length;
}

export function getMistakeMasterySummary(lang: WordbookLang): {
  total: number;
  active: number;
  mastered: number;
  masteryPct: number;
} {
  const list = ensureMemoryLoaded().filter((e) => e.lang === lang);
  const total = list.length;
  const mastered = list.filter((e) => e.status === 'mastered').length;
  const active = total - mastered;
  const masteryPct = total > 0 ? Math.round((mastered / total) * 100) : 0;
  return { total, active, mastered, masteryPct };
}

export async function syncMistakesWithFirestore(force = false): Promise<MistakeEntry[]> {
  const user = auth.currentUser;
  const local = ensureMemoryLoaded();
  if (!user) return local;
  if (!force && firestoreSyncedUid === user.uid) return local;

  try {
    const colRef = collection(db, 'users', user.uid, 'mistake_notebook');
    const snap = await getDocs(colRef);
    const mergedMap = new Map<string, MistakeEntry>();

    for (const item of local) {
      mergedMap.set(item.id, item);
    }

    const remoteIds = new Set<string>();
    snap.forEach((docSnap) => {
      const data = docSnap.data() as MistakeEntry;
      if (data && data.prompt && data.lang) {
        const entry: MistakeEntry = { ...data, id: data.id || docSnap.id };
        remoteIds.add(entry.id);
        const existing = mergedMap.get(entry.id);
        if (!existing || entry.updatedAt >= existing.updatedAt) {
          mergedMap.set(entry.id, entry);
        }
      }
    });

    for (const item of local) {
      if (!remoteIds.has(item.id)) {
        setDoc(
          doc(db, 'users', user.uid, 'mistake_notebook', item.id),
          stripUndefined(item)
        ).catch(() => {});
      }
    }

    const merged = Array.from(mergedMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    firestoreSyncedUid = user.uid;
    setMemoryAndLocal(merged);
    return merged;
  } catch (err) {
    console.warn('Firestore mistake notebook sync failed (using local cache):', err);
    return local;
  }
}

/**
 * Log a batch of wrong answers automatically after an exam or quiz submission.
 * Deduplicates cleanly, increments wrongCount, and resets mastery if missed again.
 */
export async function logMistakesBatch(inputs: LogMistakeInput[]): Promise<MistakeEntry[]> {
  const validInputs = inputs.filter(
    (i) => i && i.prompt.trim().length > 0 && i.correctAnswer.trim().length > 0
  );
  if (validInputs.length === 0) return [];

  const now = Date.now();
  const currentList = ensureMemoryLoaded();
  const map = new Map<string, MistakeEntry>();
  for (const item of currentList) map.set(item.id, item);

  const upserted: MistakeEntry[] = [];

  for (const input of validInputs) {
    const id = makeMistakeId(input.lang, input.source, input.prompt, input.correctAnswer);
    const prev = map.get(id);

    const entry: MistakeEntry = prev
      ? {
          ...prev,
          sourceLabel: input.sourceLabel || prev.sourceLabel,
          reading: input.reading || prev.reading,
          options: input.options && input.options.length > 0 ? input.options : prev.options,
          correctOptionIndex:
            input.correctOptionIndex !== undefined
              ? input.correctOptionIndex
              : prev.correctOptionIndex,
          userWrongAnswer: input.userWrongAnswer || prev.userWrongAnswer,
          acceptedAnswers:
            input.acceptedAnswers && input.acceptedAnswers.length > 0
              ? input.acceptedAnswers
              : prev.acceptedAnswers,
          explanationTh: input.explanationTh || prev.explanationTh,
          vocabWord: input.vocabWord || prev.vocabWord,
          vocabMeaningTh: input.vocabMeaningTh || prev.vocabMeaningTh,
          vocabExample: input.vocabExample || prev.vocabExample,
          wrongCount: prev.wrongCount + 1,
          consecutiveCorrect: 0, // Missed again -> must earn 2 consecutive correct again
          status: 'active',
          updatedAt: now,
        }
      : {
          id,
          lang: input.lang,
          source: input.source,
          sourceLabel: input.sourceLabel,
          prompt: input.prompt.trim(),
          reading: input.reading?.trim() || undefined,
          options: input.options,
          correctOptionIndex: input.correctOptionIndex,
          userWrongAnswer: input.userWrongAnswer.trim() || '(ไม่ได้ตอบ)',
          correctAnswer: input.correctAnswer.trim(),
          acceptedAnswers: input.acceptedAnswers,
          explanationTh: input.explanationTh?.trim() || undefined,
          vocabWord: input.vocabWord?.trim() || undefined,
          vocabMeaningTh: input.vocabMeaningTh?.trim() || undefined,
          vocabExample: input.vocabExample?.trim() || undefined,
          wrongCount: 1,
          consecutiveCorrect: 0,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        };

    map.set(id, entry);
    upserted.push(entry);
  }

  const nextList = Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  setMemoryAndLocal(nextList);

  const user = auth.currentUser;
  if (user && db) {
    Promise.all(
      upserted.map((entry) =>
        setDoc(doc(db, 'users', user.uid, 'mistake_notebook', entry.id), stripUndefined(entry))
      )
    ).catch((err) => console.warn('Failed to persist mistakes batch to Firestore:', err));
  }

  return upserted;
}

export async function logSingleMistake(input: LogMistakeInput): Promise<MistakeEntry | null> {
  const res = await logMistakesBatch([input]);
  return res[0] || null;
}

/**
 * Record the result of a Targeted Drill attempt.
 * 2-Streak Mastery Rule: 2 consecutive correct answers -> automatically graduates to 'mastered'.
 */
export async function recordMistakeDrillAttempt(
  id: string,
  isCorrect: boolean
): Promise<MistakeEntry | null> {
  const currentList = ensureMemoryLoaded();
  const target = currentList.find((e) => e.id === id);
  if (!target) return null;

  const now = Date.now();
  const nextStreak = isCorrect ? target.consecutiveCorrect + 1 : 0;
  const graduated = isCorrect && nextStreak >= MASTERY_STREAK_TARGET;

  const updated: MistakeEntry = {
    ...target,
    wrongCount: isCorrect ? target.wrongCount : target.wrongCount + 1,
    consecutiveCorrect: nextStreak,
    status: graduated ? 'mastered' : 'active',
    masteredAt: graduated ? now : target.masteredAt,
    lastPracticedAt: now,
    updatedAt: now,
  };

  const nextList = currentList.map((e) => (e.id === id ? updated : e));
  setMemoryAndLocal(nextList);

  const user = auth.currentUser;
  if (user && db) {
    try {
      await setDoc(
        doc(db, 'users', user.uid, 'mistake_notebook', updated.id),
        stripUndefined(updated)
      );
    } catch (err) {
      console.warn('Failed to update mistake drill progress in Firestore:', err);
    }
  }

  return updated;
}

/**
 * Re-open a mastered mistake back to active drill list if user wants extra review.
 */
export async function reopenMistake(id: string): Promise<void> {
  const currentList = ensureMemoryLoaded();
  const target = currentList.find((e) => e.id === id);
  if (!target) return;

  const now = Date.now();
  const updated: MistakeEntry = {
    ...target,
    status: 'active',
    consecutiveCorrect: 0,
    updatedAt: now,
  };

  setMemoryAndLocal(currentList.map((e) => (e.id === id ? updated : e)));

  const user = auth.currentUser;
  if (user && db) {
    setDoc(
      doc(db, 'users', user.uid, 'mistake_notebook', updated.id),
      stripUndefined(updated)
    ).catch(() => {});
  }
}

export async function removeMistake(id: string): Promise<void> {
  const currentList = ensureMemoryLoaded();
  setMemoryAndLocal(currentList.filter((e) => e.id !== id));

  const user = auth.currentUser;
  if (user && db) {
    deleteDoc(doc(db, 'users', user.uid, 'mistake_notebook', id)).catch(() => {});
  }
}

export function resetMistakeMemoryCache(): void {
  memoryCacheUid = null;
  memoryEntries = null;
  firestoreSyncedUid = null;
  notifyMistakesUpdated();
}
