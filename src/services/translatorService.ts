import { auth } from '../firebase';
import { getFirebaseAuthHeaders } from './authHeaders';
import {
  consumeByokFreeQuota,
  getByokQuotaStatus,
  getStoredByokKey,
} from './byokService';
import {
  deductCredit,
  getTotalCredits,
  loadUserSubscription,
} from './subscriptionService';
import {
  BasicTranslateResponse,
  DeepTranslateResponse,
  ImageTranslateContext,
  ImageTranslateResponse,
  PolishResponse,
  PolishSituation,
  SavedPhraseItem,
  TranslatorHistoryItem,
  TranslatorLang,
  TranslatorSourceLang,
  TranslatorTone,
} from '../types/translator';

const HISTORY_STORAGE_PREFIX = 'polyglot_translator_history_v1_';
const SAVED_STORAGE_PREFIX = 'polyglot_translator_saved_v1_';
const MAX_HISTORY_ITEMS = 50;
const MAX_SAVED_ITEMS = 200;

export class TranslatorAiError extends Error {
  authRequired?: boolean;
  byokRequired?: boolean;
  byokQuotaExhausted?: boolean;
  byokInvalidKey?: boolean;
  insufficientCredits?: boolean;

  constructor(
    message: string,
    flags?: {
      authRequired?: boolean;
      byokRequired?: boolean;
      byokQuotaExhausted?: boolean;
      byokInvalidKey?: boolean;
      insufficientCredits?: boolean;
    }
  ) {
    super(message);
    this.name = 'TranslatorAiError';
    this.authRequired = flags?.authRequired;
    this.byokRequired = flags?.byokRequired;
    this.byokQuotaExhausted = flags?.byokQuotaExhausted;
    this.byokInvalidKey = flags?.byokInvalidKey;
    this.insufficientCredits = flags?.insufficientCredits;
  }
}

function getUidKey(): string {
  return auth.currentUser?.uid || 'guest';
}

function assertSignedIn(): void {
  if (!auth.currentUser?.uid) {
    throw new TranslatorAiError(
      'กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้งานโหมด AI เจาะลึก (โหมดแปลพื้นฐานยังใช้ฟรีไม่อั้นได้ทันที)',
      { authRequired: true }
    );
  }
}

async function resolveTranslatorAuthMode(paidWithCredits?: boolean): Promise<{
  byokKey: string | null;
  paidWithCredits: boolean;
}> {
  assertSignedIn();

  if (paidWithCredits) {
    const sub = await loadUserSubscription();
    if (getTotalCredits(sub) < 1) {
      throw new TranslatorAiError('เครดิตในแอปไม่เพียงพอ (ต้องการ 1 เครดิตสำหรับโหมด AI)', {
        insufficientCredits: true,
      });
    }
    return { byokKey: null, paidWithCredits: true };
  }

  const byokKey = getStoredByokKey();
  if (!byokKey) {
    throw new TranslatorAiError(
      'เชื่อมคีย์ฟรี BYOK (150 ครั้ง/วัน) หรือใช้ 1 เครดิตในแอปเพื่อใช้งานโหมด AI เจาะลึก',
      { byokRequired: true }
    );
  }
  const quota = getByokQuotaStatus('translate_ai');
  if (!quota.canUseFree) {
    throw new TranslatorAiError(
      `ใช้สิทธิ์ AI เจาะลึกครบ ${quota.limit}/${quota.limit} ครั้งของวันนี้แล้ว สามารถใช้ 1 เครดิตทำต่อหรือสลับใช้โหมดแปลพื้นฐานฟรีไม่อั้น`,
      { byokQuotaExhausted: true }
    );
  }
  return { byokKey, paidWithCredits: false };
}

/**
 * 0-Baht Unlimited Free Basic Translation via server proxy
 */
export async function translateBasic(params: {
  text: string;
  sourceLang: TranslatorSourceLang;
  targetLang: TranslatorLang;
  signal?: AbortSignal;
}): Promise<BasicTranslateResponse> {
  const res = await fetch('/api/translate/basic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: params.text,
      sourceLang: params.sourceLang,
      targetLang: params.targetLang,
    }),
    signal: params.signal,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'ไม่สามารถแปลข้อความได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
  }
  return data as BasicTranslateResponse;
}

/**
 * Deep Translation + Tone + Word/Grammar Breakdown (BYOK 150/day free OR 1 credit fallback)
 */
export async function translateDeepAi(params: {
  text: string;
  sourceLang: TranslatorSourceLang;
  targetLang: TranslatorLang;
  tone: TranslatorTone;
  paidWithCredits?: boolean;
}): Promise<DeepTranslateResponse> {
  const authMode = await resolveTranslatorAuthMode(params.paidWithCredits);
  const headers = await getFirebaseAuthHeaders();

  const res = await fetch('/api/translate/ai', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mode: 'deep',
      text: params.text,
      sourceLang: params.sourceLang,
      targetLang: params.targetLang,
      tone: params.tone,
      byokKey: authMode.byokKey || undefined,
      paidWithCredits: authMode.paidWithCredits,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new TranslatorAiError(
      data.error || 'ไม่สามารถวิเคราะห์คำแปลด้วย AI ได้ในขณะนี้',
      {
        authRequired: res.status === 401 && !data.byokInvalidKey,
        byokRequired: Boolean(data.byokRequired),
        byokQuotaExhausted: Boolean(data.byokQuotaExhausted || (!authMode.paidWithCredits && res.status === 429)),
        byokInvalidKey: Boolean(data.byokInvalidKey),
      }
    );
  }

  if (authMode.paidWithCredits) {
    await deductCredit(1);
  } else {
    await consumeByokFreeQuota('translate_ai');
  }
  return data as DeepTranslateResponse;
}

/**
 * Native Sentence Polish / Rewrite (BYOK 150/day shared quota OR 1 credit fallback)
 */
export async function polishSentenceAi(params: {
  text: string;
  lang: TranslatorLang;
  tone: TranslatorTone;
  situation: PolishSituation;
  paidWithCredits?: boolean;
}): Promise<PolishResponse> {
  const authMode = await resolveTranslatorAuthMode(params.paidWithCredits);
  const headers = await getFirebaseAuthHeaders();

  const res = await fetch('/api/translate/ai', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mode: 'polish',
      text: params.text,
      targetLang: params.lang,
      tone: params.tone,
      situation: params.situation,
      byokKey: authMode.byokKey || undefined,
      paidWithCredits: authMode.paidWithCredits,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new TranslatorAiError(
      data.error || 'ไม่สามารถเกลาประโยคได้ในขณะนี้',
      {
        authRequired: res.status === 401 && !data.byokInvalidKey,
        byokRequired: Boolean(data.byokRequired),
        byokQuotaExhausted: Boolean(data.byokQuotaExhausted || (!authMode.paidWithCredits && res.status === 429)),
        byokInvalidKey: Boolean(data.byokInvalidKey),
      }
    );
  }

  if (authMode.paidWithCredits) {
    await deductCredit(1);
  } else {
    await consumeByokFreeQuota('translate_ai');
  }
  return data as PolishResponse;
}

/**
 * Photo / Menu / Sign / Document OCR & Translation (BYOK 150/day OR 1 credit fallback)
 */
export async function translateImageAi(params: {
  imageBase64: string;
  mimeType: string;
  targetLang: TranslatorLang;
  imageContext: ImageTranslateContext;
  paidWithCredits?: boolean;
}): Promise<ImageTranslateResponse> {
  const authMode = await resolveTranslatorAuthMode(params.paidWithCredits);
  const headers = await getFirebaseAuthHeaders();

  const res = await fetch('/api/translate/image', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      imageBase64: params.imageBase64,
      mimeType: params.mimeType,
      targetLang: params.targetLang,
      imageContext: params.imageContext,
      byokKey: authMode.byokKey || undefined,
      paidWithCredits: authMode.paidWithCredits,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new TranslatorAiError(
      data.error || 'ไม่สามารถอ่านและแปลข้อความจากรูปภาพได้ในขณะนี้',
      {
        authRequired: res.status === 401 && !data.byokInvalidKey,
        byokRequired: Boolean(data.byokRequired),
        byokQuotaExhausted: Boolean(data.byokQuotaExhausted || (!authMode.paidWithCredits && res.status === 429)),
        byokInvalidKey: Boolean(data.byokInvalidKey),
      }
    );
  }

  if (authMode.paidWithCredits) {
    await deductCredit(1);
  } else {
    await consumeByokFreeQuota('translate_ai');
  }
  return data as ImageTranslateResponse;
}

/**
 * Voice Audio Transcription fallback (BYOK 150/day OR 1 credit fallback, used when browser lacks Web Speech API)
 */
export async function transcribeVoiceAi(params: {
  audioBase64: string;
  mimeType: string;
  lang: TranslatorLang;
  paidWithCredits?: boolean;
}): Promise<{ transcript: string }> {
  const authMode = await resolveTranslatorAuthMode(params.paidWithCredits);
  const headers = await getFirebaseAuthHeaders();

  const res = await fetch('/api/translate/transcribe', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      audioBase64: params.audioBase64,
      mimeType: params.mimeType,
      lang: params.lang,
      byokKey: authMode.byokKey || undefined,
      paidWithCredits: authMode.paidWithCredits,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new TranslatorAiError(
      data.error || 'ไม่สามารถถอดเสียงพูดได้ในขณะนี้',
      {
        authRequired: res.status === 401 && !data.byokInvalidKey,
        byokRequired: Boolean(data.byokRequired),
        byokQuotaExhausted: Boolean(data.byokQuotaExhausted || (!authMode.paidWithCredits && res.status === 429)),
        byokInvalidKey: Boolean(data.byokInvalidKey),
      }
    );
  }

  if (authMode.paidWithCredits) {
    await deductCredit(1);
  } else {
    await consumeByokFreeQuota('translate_ai');
  }
  return { transcript: String(data.transcript || '').trim() };
}

/**
 * Compress uploaded/captured photo on client so mobile camera photos upload fast & cleanly
 */
export async function compressImageForOcr(file: File): Promise<{
  base64: string;
  mimeType: string;
  previewUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('ไฟล์รูปภาพไม่ถูกต้อง'));
      img.onload = () => {
        const MAX_DIM = 1440;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('เบราว์เซอร์ไม่รองรับการประมวลผลรูปภาพ'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
        const base64 = dataUrl.split(',')[1] || '';
        resolve({
          base64,
          mimeType: 'image/jpeg',
          previewUrl: dataUrl,
        });
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

// =========================================================================
// LOCAL HISTORY & SAVED PHRASEBOOK STORAGE
// =========================================================================

export function loadTranslatorHistory(): TranslatorHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${HISTORY_STORAGE_PREFIX}${getUidKey()}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addTranslatorHistory(
  item: Omit<TranslatorHistoryItem, 'id' | 'createdAt'>
): TranslatorHistoryItem[] {
  const cleanSource = item.sourceText.trim();
  const cleanTarget = item.translatedText.trim();
  if (!cleanSource || !cleanTarget) return loadTranslatorHistory();

  const existing = loadTranslatorHistory();
  // Deduplicate identical consecutive/recent pair
  const filtered = existing.filter(
    (h) =>
      !(
        h.sourceLang === item.sourceLang &&
        h.targetLang === item.targetLang &&
        h.sourceText.trim().toLowerCase() === cleanSource.toLowerCase() &&
        h.tone === item.tone
      )
  );

  const entry: TranslatorHistoryItem = {
    ...item,
    sourceText: cleanSource,
    translatedText: cleanTarget,
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  };

  const next = [entry, ...filtered].slice(0, MAX_HISTORY_ITEMS);
  try {
    localStorage.setItem(`${HISTORY_STORAGE_PREFIX}${getUidKey()}`, JSON.stringify(next));
  } catch {}
  return next;
}

export function clearTranslatorHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${HISTORY_STORAGE_PREFIX}${getUidKey()}`);
  } catch {}
}

export function loadSavedPhrases(): SavedPhraseItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${SAVED_STORAGE_PREFIX}${getUidKey()}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function makeSavedPhraseKey(sourceLang: TranslatorLang, targetLang: TranslatorLang, sourceText: string, translatedText: string): string {
  return `${sourceLang}:${targetLang}:${sourceText.trim().toLowerCase()}:${translatedText.trim().toLowerCase()}`;
}

export function isPhraseSaved(
  sourceLang: TranslatorLang,
  targetLang: TranslatorLang,
  sourceText: string,
  translatedText: string
): boolean {
  const key = makeSavedPhraseKey(sourceLang, targetLang, sourceText, translatedText);
  return loadSavedPhrases().some(
    (p) => makeSavedPhraseKey(p.sourceLang, p.targetLang, p.sourceText, p.translatedText) === key
  );
}

export function toggleSavedPhrase(
  item: Omit<SavedPhraseItem, 'id' | 'createdAt'>
): { saved: boolean; list: SavedPhraseItem[] } {
  const existing = loadSavedPhrases();
  const key = makeSavedPhraseKey(item.sourceLang, item.targetLang, item.sourceText, item.translatedText);
  const found = existing.find(
    (p) => makeSavedPhraseKey(p.sourceLang, p.targetLang, p.sourceText, p.translatedText) === key
  );

  let next: SavedPhraseItem[];
  let saved: boolean;

  if (found) {
    next = existing.filter((p) => p.id !== found.id);
    saved = false;
  } else {
    const entry: SavedPhraseItem = {
      ...item,
      sourceText: item.sourceText.trim(),
      translatedText: item.translatedText.trim(),
      id: `saved_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
    };
    next = [entry, ...existing].slice(0, MAX_SAVED_ITEMS);
    saved = true;
  }

  try {
    localStorage.setItem(`${SAVED_STORAGE_PREFIX}${getUidKey()}`, JSON.stringify(next));
  } catch {}
  return { saved, list: next };
}

export function removeSavedPhrase(id: string): SavedPhraseItem[] {
  const next = loadSavedPhrases().filter((p) => p.id !== id);
  try {
    localStorage.setItem(`${SAVED_STORAGE_PREFIX}${getUidKey()}`, JSON.stringify(next));
  } catch {}
  return next;
}
