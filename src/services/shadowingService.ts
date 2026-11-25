import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { ShadowingLang, normalizeShadowingKey } from '../utils/shadowingMatcher';

export interface ShadowingDailyLog {
  dateKey: string; // YYYY-MM-DD
  lang: ShadowingLang;
  practiceCount: number;
  bestAccuracyPct: number;
  totalAccuracySum: number;
  updatedAt: number;
}

export interface ShadowingSentenceRecord {
  key: string;
  lang: ShadowingLang;
  bestAccuracyPct: number;
  attempts: number;
  lastPracticedAt: number;
}

const LOCAL_LOGS_PREFIX = 'shadowing_daily_logs_v1_';
const LOCAL_SENTENCES_PREFIX = 'shadowing_sentences_v1_';

function getUidKey(): string {
  return auth.currentUser?.uid || 'guest';
}

function toLocalDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readLocalLogs(): ShadowingDailyLog[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_LOGS_PREFIX}${getUidKey()}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalLogs(logs: ShadowingDailyLog[]): void {
  try {
    localStorage.setItem(`${LOCAL_LOGS_PREFIX}${getUidKey()}`, JSON.stringify(logs));
  } catch {
    // ignore quota errors
  }
}

function readLocalSentenceMap(): Record<string, ShadowingSentenceRecord> {
  try {
    const raw = localStorage.getItem(`${LOCAL_SENTENCES_PREFIX}${getUidKey()}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalSentenceMap(map: Record<string, ShadowingSentenceRecord>): void {
  try {
    localStorage.setItem(`${LOCAL_SENTENCES_PREFIX}${getUidKey()}`, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export function getSentenceShadowingRecord(
  lang: ShadowingLang,
  sentence: string
): ShadowingSentenceRecord | null {
  if (!sentence.trim()) return null;
  const key = normalizeShadowingKey(lang, sentence);
  const map = readLocalSentenceMap();
  return map[key] || null;
}

export function getAllLocalSentenceRecords(): Record<string, ShadowingSentenceRecord> {
  return readLocalSentenceMap();
}

export function getLocalShadowingLogs(lang: ShadowingLang): ShadowingDailyLog[] {
  return readLocalLogs().filter((l) => l.lang === lang);
}

/**
 * Records a completed shadowing attempt (speech recognition or self-comparison recording).
 * Stores lightweight daily summary only — never stores audio files.
 */
export async function recordShadowingAttempt(params: {
  lang: ShadowingLang;
  sentence: string;
  accuracyPct?: number; // undefined if browser only did MediaRecorder self-compare
}): Promise<ShadowingSentenceRecord> {
  const now = Date.now();
  const dateKey = toLocalDateKey(now);
  const key = normalizeShadowingKey(params.lang, params.sentence);
  const safeAcc =
    typeof params.accuracyPct === 'number' && !Number.isNaN(params.accuracyPct)
      ? Math.max(0, Math.min(100, Math.round(params.accuracyPct)))
      : 80; // Self-listen completion counts as steady practice

  // 1. Update local per-sentence best badge
  const sentenceMap = readLocalSentenceMap();
  const prevSentence = sentenceMap[key];
  const updatedSentence: ShadowingSentenceRecord = {
    key,
    lang: params.lang,
    bestAccuracyPct:
      typeof params.accuracyPct === 'number'
        ? Math.max(prevSentence?.bestAccuracyPct || 0, safeAcc)
        : prevSentence?.bestAccuracyPct || 0,
    attempts: (prevSentence?.attempts || 0) + 1,
    lastPracticedAt: now,
  };
  sentenceMap[key] = updatedSentence;
  writeLocalSentenceMap(sentenceMap);

  // 2. Update daily log locally
  const logs = readLocalLogs();
  const idx = logs.findIndex((l) => l.dateKey === dateKey && l.lang === params.lang);
  let updatedLog: ShadowingDailyLog;
  if (idx >= 0) {
    const prev = logs[idx];
    updatedLog = {
      ...prev,
      practiceCount: prev.practiceCount + 1,
      bestAccuracyPct: Math.max(prev.bestAccuracyPct, safeAcc),
      totalAccuracySum: prev.totalAccuracySum + safeAcc,
      updatedAt: now,
    };
    logs[idx] = updatedLog;
  } else {
    updatedLog = {
      dateKey,
      lang: params.lang,
      practiceCount: 1,
      bestAccuracyPct: safeAcc,
      totalAccuracySum: safeAcc,
      updatedAt: now,
    };
    logs.push(updatedLog);
  }
  writeLocalLogs(logs);

  window.dispatchEvent(new CustomEvent('shadowing_updated'));

  // 3. Persist lightweight daily log to Firestore under owner subcollection
  const user = auth.currentUser;
  if (user && db) {
    try {
      const docId = `${params.lang}_${dateKey}`;
      await setDoc(doc(db, 'users', user.uid, 'shadowing_logs', docId), updatedLog, {
        merge: true,
      });
    } catch {
      // Keep local log silently on offline/permission issue
    }
  }

  return updatedSentence;
}

export async function loadAllShadowingLogs(lang: ShadowingLang): Promise<ShadowingDailyLog[]> {
  const map = new Map<string, ShadowingDailyLog>();
  for (const log of getLocalShadowingLogs(lang)) {
    map.set(log.dateKey, log);
  }

  const user = auth.currentUser;
  if (user && db) {
    try {
      const snap = await getDocs(collection(db, 'users', user.uid, 'shadowing_logs'));
      snap.forEach((docSnap) => {
        const data = docSnap.data() as ShadowingDailyLog;
        if (data && data.lang === lang && data.dateKey) {
          const prev = map.get(data.dateKey);
          if (!prev || data.practiceCount > prev.practiceCount) {
            map.set(data.dateKey, data);
          }
        }
      });
    } catch {
      // Fallback to local logs
    }
  }

  return Array.from(map.values());
}
