import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  SaveWordbookInput,
  SrsRating,
  WordbookDailyReviewLog,
  WordbookEntry,
  WordbookLang,
  WordMasteryStatus,
} from '../types/wordbook';

const DAY_MS = 24 * 60 * 60 * 1000;

// Deterministic spaced-repetition ladder in days: 1d -> 3d -> 7d -> 14d -> 30d -> 60d
export const SRS_INTERVAL_LADDER_DAYS = [1, 3, 7, 14, 30, 60] as const;

const STORAGE_PREFIX = 'polyglot_wordbook_srs_v1_';
const REVIEW_LOG_PREFIX = 'polyglot_wordbook_review_log_v1_';

let memoryCacheUid: string | null = null;
let memoryEntries: WordbookEntry[] | null = null;
let firestoreSyncedUid: string | null = null;

export function normalizeWordbookLang(lang: 'EN' | 'CN' | 'TH' | 'en' | 'zh' | string): WordbookLang {
  if (lang === 'CN' || lang === 'zh' || lang === 'ZH') return 'CN';
  return 'EN';
}

function getCurrentUidKey(): string {
  return auth.currentUser?.uid || 'guest';
}

function getLocalStorageKey(uidKey: string): string {
  return `${STORAGE_PREFIX}${uidKey}`;
}

function getReviewLogStorageKey(uidKey: string): string {
  return `${REVIEW_LOG_PREFIX}${uidKey}`;
}

/**
 * Create a deterministic, Firestore-safe document ID from (lang, word)
 * so saving the same word from different places never creates duplicates.
 */
export function makeWordbookId(lang: WordbookLang, rawWord: string): string {
  const normalized = rawWord.trim().toLowerCase().replace(/\s+/g, ' ');
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  const slug = normalized
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
  return `${lang.toLowerCase()}_${slug || 'w'}_${hex}`;
}

function notifyWordbookUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wordbook_updated'));
  }
}

function readLocalEntries(uidKey: string): WordbookEntry[] {
  try {
    const raw = localStorage.getItem(getLocalStorageKey(uidKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is WordbookEntry =>
        Boolean(item && typeof item.id === 'string' && typeof item.word === 'string')
    );
  } catch {
    return [];
  }
}

function writeLocalEntries(uidKey: string, entries: WordbookEntry[]): void {
  try {
    localStorage.setItem(getLocalStorageKey(uidKey), JSON.stringify(entries));
  } catch (e) {
    console.warn('Failed to write wordbook to localStorage:', e);
  }
}

function ensureMemoryLoaded(): WordbookEntry[] {
  const uidKey = getCurrentUidKey();
  if (memoryCacheUid !== uidKey || memoryEntries === null) {
    memoryCacheUid = uidKey;
    memoryEntries = readLocalEntries(uidKey);
  }
  return memoryEntries;
}

function setMemoryAndLocal(entries: WordbookEntry[]): void {
  const uidKey = getCurrentUidKey();
  memoryCacheUid = uidKey;
  memoryEntries = entries;
  writeLocalEntries(uidKey, entries);
  notifyWordbookUpdated();
}

function stripUndefined<T extends Record<string, any>>(obj: T): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) cleaned[k] = v;
  }
  return cleaned;
}

/**
 * Synchronous read of cached entries (instant UI updates across buttons & nav badges).
 */
export function getCachedWordbookEntries(lang?: WordbookLang): WordbookEntry[] {
  const list = ensureMemoryLoaded();
  const filtered = lang ? list.filter((e) => e.lang === lang) : list;
  return [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Synchronous check whether a word is already in the user's personal Wordbook.
 */
export function isWordSavedInWordbook(lang: WordbookLang, word: string): boolean {
  if (!word.trim()) return false;
  const id = makeWordbookId(lang, word);
  return ensureMemoryLoaded().some((e) => e.id === id);
}

/**
 * Determine whether an entry is due for review right now.
 */
export function isWordDueForReview(entry: WordbookEntry, now = Date.now()): boolean {
  return entry.nextReviewAt <= now;
}

/**
 * Count due words synchronously for badges and header metrics.
 */
export function getDueWordCount(lang: WordbookLang, now = Date.now()): number {
  return ensureMemoryLoaded().filter((e) => e.lang === lang && e.nextReviewAt <= now).length;
}

export function getWordMasteryStatus(entry: WordbookEntry, now = Date.now()): WordMasteryStatus {
  if (entry.repetitions === 0) return 'new';
  if (entry.intervalDays >= 14 && entry.nextReviewAt > now) return 'mastered';
  if (entry.nextReviewAt <= now) return 'due';
  return 'learning';
}

/**
 * Preview next interval in days for each rating button in the Quick Review UI.
 */
export function previewNextIntervalDays(entry: WordbookEntry, rating: SrsRating): number {
  if (rating === 'again') return 0;
  if (rating === 'hard') return 1;
  // 'good' advances along [1, 3, 7, 14, 30, 60]
  const nextStageIdx = Math.min(entry.stage, SRS_INTERVAL_LADDER_DAYS.length - 1);
  return SRS_INTERVAL_LADDER_DAYS[nextStageIdx];
}

export function formatNextReviewLabel(entry: WordbookEntry, now = Date.now()): string {
  if (entry.nextReviewAt <= now) {
    return entry.repetitions === 0 ? 'คำใหม่ • ทบทวนได้ทันที' : 'ถึงกำหนดทบทวนวันนี้';
  }
  const diffMs = entry.nextReviewAt - now;
  const diffHours = Math.ceil(diffMs / (60 * 60 * 1000));
  if (diffHours < 24) {
    return `ทบทวนอีก ${Math.max(1, diffHours)} ชม.`;
  }
  const diffDays = Math.ceil(diffMs / DAY_MS);
  return `ทบทวนอีก ${diffDays} วัน`;
}

/**
 * Sync local wordbook with Firestore `/users/{uid}/wordbook_srs` (merges newest by `updatedAt`).
 */
export async function syncWordbookWithFirestore(force = false): Promise<WordbookEntry[]> {
  const user = auth.currentUser;
  const local = ensureMemoryLoaded();
  if (!user) return local;
  if (!force && firestoreSyncedUid === user.uid) return local;

  try {
    const colRef = collection(db, 'users', user.uid, 'wordbook_srs');
    const snap = await getDocs(colRef);
    const mergedMap = new Map<string, WordbookEntry>();

    // Seed with local entries first
    for (const item of local) {
      mergedMap.set(item.id, item);
    }

    // Merge remote entries (latest updatedAt wins)
    const remoteIds = new Set<string>();
    snap.forEach((docSnap) => {
      const data = docSnap.data() as WordbookEntry;
      if (data && data.word && data.lang) {
        const entry: WordbookEntry = { ...data, id: data.id || docSnap.id };
        remoteIds.add(entry.id);
        const existing = mergedMap.get(entry.id);
        if (!existing || entry.updatedAt >= existing.updatedAt) {
          mergedMap.set(entry.id, entry);
        }
      }
    });

    // Push any local-only entries up to Firestore so guest/offline saves sync seamlessly
    for (const item of local) {
      if (!remoteIds.has(item.id)) {
        setDoc(doc(db, 'users', user.uid, 'wordbook_srs', item.id), stripUndefined(item)).catch((err) =>
          console.warn('Background upload of local wordbook entry failed:', err)
        );
      }
    }

    const merged = Array.from(mergedMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    firestoreSyncedUid = user.uid;
    setMemoryAndLocal(merged);
    return merged;
  } catch (err) {
    console.warn('Firestore wordbook sync failed (using local cache):', err);
    return local;
  }
}

/**
 * Save or update a word in the user's personal SRS Wordbook.
 */
export async function saveWordToWordbook(input: SaveWordbookInput): Promise<WordbookEntry> {
  const cleanWord = input.word.trim();
  if (!cleanWord) {
    throw new Error('กรุณาระบุคำศัพท์');
  }

  const now = Date.now();
  const id = makeWordbookId(input.lang, cleanWord);
  const currentList = ensureMemoryLoaded();
  const existing = currentList.find((e) => e.id === id);

  const entry: WordbookEntry = existing
    ? {
        ...existing,
        word: cleanWord,
        reading: input.reading?.trim() || existing.reading,
        meaningTh: input.meaningTh.trim() || existing.meaningTh,
        partOfSpeech: input.partOfSpeech?.trim() || existing.partOfSpeech,
        example: input.example?.trim() || existing.example,
        exampleTh: input.exampleTh?.trim() || existing.exampleTh,
        note: input.note !== undefined ? input.note.trim() : existing.note,
        sourceLabel: input.sourceLabel || existing.sourceLabel,
        updatedAt: now,
      }
    : {
        id,
        lang: input.lang,
        word: cleanWord,
        reading: input.reading?.trim() || undefined,
        meaningTh: input.meaningTh.trim() || 'ยังไม่ได้ระบุคำแปล',
        partOfSpeech: input.partOfSpeech?.trim() || undefined,
        example: input.example?.trim() || undefined,
        exampleTh: input.exampleTh?.trim() || undefined,
        note: input.note?.trim() || undefined,
        source: input.source,
        sourceLabel: input.sourceLabel || undefined,
        stage: 0,
        intervalDays: 0,
        repetitions: 0,
        lapses: 0,
        nextReviewAt: now, // Due immediately so user can review newly saved words right away
        createdAt: now,
        updatedAt: now,
      };

  const nextList = existing
    ? currentList.map((e) => (e.id === id ? entry : e))
    : [entry, ...currentList];

  setMemoryAndLocal(nextList);

  const user = auth.currentUser;
  if (user) {
    try {
      await setDoc(doc(db, 'users', user.uid, 'wordbook_srs', entry.id), stripUndefined(entry));
    } catch (err) {
      console.warn('Failed to persist wordbook entry to Firestore:', err);
    }
  }

  return entry;
}

/**
 * Remove a word from the user's personal SRS Wordbook.
 */
export async function removeWordFromWordbook(id: string): Promise<void> {
  const currentList = ensureMemoryLoaded();
  const nextList = currentList.filter((e) => e.id !== id);
  setMemoryAndLocal(nextList);

  const user = auth.currentUser;
  if (user) {
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'wordbook_srs', id));
    } catch (err) {
      console.warn('Failed to delete wordbook entry from Firestore:', err);
    }
  }
}

/**
 * Toggle save/remove by (lang, word) for universal "+ สมุดศัพท์" buttons across the app.
 */
export async function toggleWordInWordbook(input: SaveWordbookInput): Promise<{ saved: boolean; entry?: WordbookEntry }> {
  const id = makeWordbookId(input.lang, input.word);
  const exists = ensureMemoryLoaded().some((e) => e.id === id);
  if (exists) {
    await removeWordFromWordbook(id);
    return { saved: false };
  }
  const entry = await saveWordToWordbook(input);
  return { saved: true, entry };
}

function getLocalDateKey(ts = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function recordDailyReviewStat(lang: WordbookLang, remembered: boolean): void {
  const uidKey = getCurrentUidKey();
  const key = getReviewLogStorageKey(uidKey);
  const dateKey = getLocalDateKey();
  const logId = `${dateKey}_${lang}`;
  try {
    const raw = localStorage.getItem(key);
    const logs: Record<string, WordbookDailyReviewLog> = raw ? JSON.parse(raw) : {};
    const prev = logs[logId] || {
      dateKey,
      lang,
      reviewedCount: 0,
      rememberedCount: 0,
      updatedAt: Date.now(),
    };
    const next: WordbookDailyReviewLog = {
      ...prev,
      reviewedCount: prev.reviewedCount + 1,
      rememberedCount: prev.rememberedCount + (remembered ? 1 : 0),
      updatedAt: Date.now(),
    };
    logs[logId] = next;
    localStorage.setItem(key, JSON.stringify(logs));

    // Also mirror lightweight daily review count to Firestore for Phase 2 Streak/Dashboard
    const user = auth.currentUser;
    if (user) {
      setDoc(
        doc(db, 'users', user.uid, 'wordbook_review_logs', logId),
        next,
        { merge: true }
      ).catch(() => {});
    }
  } catch {
    // Non-fatal
  }
}

export function getLocalReviewLogs(lang?: WordbookLang): WordbookDailyReviewLog[] {
  const uidKey = getCurrentUidKey();
  try {
    const raw = localStorage.getItem(getReviewLogStorageKey(uidKey));
    if (!raw) return [];
    const logs: Record<string, WordbookDailyReviewLog> = JSON.parse(raw);
    const list = Object.values(logs);
    return lang ? list.filter((l) => l.lang === lang) : list;
  } catch {
    return [];
  }
}

/**
 * Apply an SRS rating to a word and schedule its next review date.
 */
export async function reviewWordWithSrs(id: string, rating: SrsRating): Promise<WordbookEntry | null> {
  const currentList = ensureMemoryLoaded();
  const target = currentList.find((e) => e.id === id);
  if (!target) return null;

  const now = Date.now();
  let nextStage = target.stage;
  let nextIntervalDays = target.intervalDays;
  let nextLapses = target.lapses;
  let nextReviewAt = now;

  if (rating === 'again') {
    nextStage = 0;
    nextIntervalDays = 0;
    nextLapses += 1;
    nextReviewAt = now; // Immediately due again
  } else if (rating === 'hard') {
    nextStage = Math.max(1, target.stage);
    nextIntervalDays = 1;
    nextReviewAt = now + DAY_MS;
  } else {
    // 'good'
    const ladderIdx = Math.min(target.stage, SRS_INTERVAL_LADDER_DAYS.length - 1);
    nextIntervalDays = SRS_INTERVAL_LADDER_DAYS[ladderIdx];
    nextStage = Math.min(target.stage + 1, SRS_INTERVAL_LADDER_DAYS.length);
    nextReviewAt = now + nextIntervalDays * DAY_MS;
  }

  const updated: WordbookEntry = {
    ...target,
    stage: nextStage,
    intervalDays: nextIntervalDays,
    repetitions: target.repetitions + 1,
    lapses: nextLapses,
    lastReviewedAt: now,
    nextReviewAt,
    updatedAt: now,
  };

  const nextList = currentList.map((e) => (e.id === id ? updated : e));
  setMemoryAndLocal(nextList);
  recordDailyReviewStat(target.lang, rating !== 'again');

  const user = auth.currentUser;
  if (user) {
    try {
      await setDoc(doc(db, 'users', user.uid, 'wordbook_srs', updated.id), stripUndefined(updated));
    } catch (err) {
      console.warn('Failed to persist SRS review update to Firestore:', err);
    }
  }

  return updated;
}

/**
 * Reset in-memory cache when auth state switches between accounts.
 */
export function resetWordbookMemoryCache(): void {
  memoryCacheUid = null;
  memoryEntries = null;
  firestoreSyncedUid = null;
  notifyWordbookUpdated();
}
