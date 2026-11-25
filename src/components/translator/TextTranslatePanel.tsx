import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeftRight,
  Volume2,
  Turtle,
  Copy,
  Check,
  Star,
  Mic,
  MicOff,
  Sparkles,
  Wand2,
  Clipboard,
  Trash2,
  Loader2,
  Key,
  BookOpen,
  Zap,
} from 'lucide-react';
import {
  BasicTranslateResponse,
  DeepTranslateResponse,
  TRANSLATOR_LANGUAGES,
  TRANSLATOR_LANG_MAP,
  TRANSLATOR_TONES,
  TranslatorLang,
  TranslatorSourceLang,
  TranslatorTone,
} from '../../types/translator';
import {
  addTranslatorHistory,
  isPhraseSaved,
  toggleSavedPhrase,
  translateBasic,
  translateDeepAi,
  TranslatorAiError,
} from '../../services/translatorService';
import { playTranslatorTTS, stopThaiTTS } from '../../utils/audio';
import { openLoginModal } from '../../services/authHeaders';
import { getByokQuotaStatus, syncByokDailyUsageWithFirestore } from '../../services/byokService';
import { getTotalCredits, loadUserSubscription } from '../../services/subscriptionService';
import { auth } from '../../firebase';
import ByokQuotaFallbackModal, { QuotaFallbackReason } from '../ByokQuotaFallbackModal';
import VocabBreakdownCard from './VocabBreakdownCard';

interface TextTranslatePanelProps {
  defaultForeignLang: TranslatorLang;
  restorePayload?: {
    nonce: number;
    sourceLang: TranslatorLang;
    targetLang: TranslatorLang;
    sourceText: string;
  } | null;
  hasByok: boolean;
  aiQuotaRemaining: number;
  aiQuotaLimit: number;
  onOpenByok: () => void;
  onNotify: (msg: string) => void;
  onHistoryChanged: () => void;
  onSavedListChanged: () => void;
  onJumpToPolish: (text: string, lang: TranslatorLang) => void;
}

const QUICK_STARTERS: Array<{ label: string; src: TranslatorSourceLang; tgt: TranslatorLang; text: string }> = [
  {
    label: 'สั่งอาหาร (ไทย → จีน)',
    src: 'TH',
    tgt: 'CN',
    text: 'ขอโทษครับ ช่วยแนะนำเมนูยอดนิยมของร้านนี้ให้หน่อยได้ไหมครับ ขอไม่เผ็ดนะครับ',
  },
  {
    label: 'อีเมลงาน (ไทย → อังกฤษ)',
    src: 'TH',
    tgt: 'EN',
    text: 'รบกวนช่วยส่งไฟล์สรุปการประชุมให้ภายในวันนี้หน่อยนะครับ ขอบคุณมากครับ',
  },
  {
    label: 'เที่ยวญี่ปุ่น (ไทย → ญี่ปุ่น)',
    src: 'TH',
    tgt: 'JP',
    text: 'ขอโทษครับ สถานีรถไฟที่ใกล้ที่สุดเดินไปทางไหนครับ',
  },
  {
    label: 'ช้อปปิ้งเกาหลี (ไทย → เกาหลี)',
    src: 'TH',
    tgt: 'KR',
    text: 'อันนี้มีขนาดใหญ่กว่านี้ไหมครับ ขอจ่ายด้วยบัตรเครดิตได้ไหม',
  },
];

export const TextTranslatePanel: React.FC<TextTranslatePanelProps> = ({
  defaultForeignLang,
  restorePayload,
  hasByok,
  aiQuotaRemaining,
  aiQuotaLimit,
  onOpenByok,
  onNotify,
  onHistoryChanged,
  onSavedListChanged,
  onJumpToPolish,
}) => {
  const [sourceLang, setSourceLang] = useState<TranslatorSourceLang>('AUTO');
  const [targetLang, setTargetLang] = useState<TranslatorLang>(
    defaultForeignLang === 'TH' ? 'EN' : defaultForeignLang
  );
  const [inputText, setInputText] = useState('');
  const [tone, setTone] = useState<TranslatorTone>('polite');
  const [engineMode, setEngineMode] = useState<'basic' | 'deep'>('basic');

  const [basicResult, setBasicResult] = useState<BasicTranslateResponse | null>(null);
  const [deepResult, setDeepResult] = useState<DeepTranslateResponse | null>(null);
  const [isBasicLoading, setIsBasicLoading] = useState(false);
  const [isDeepLoading, setIsDeepLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiErrorBanner, setAiErrorBanner] = useState<{
    message: string;
    needsByok?: boolean;
    needsAuth?: boolean;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [starred, setStarred] = useState(false);
  const [fallbackModalReason, setFallbackModalReason] = useState<QuotaFallbackReason | null>(null);
  const [pendingAiArgs, setPendingAiArgs] = useState<{ text: string; tone: TranslatorTone } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);

  const activeTranslatedText =
    engineMode === 'deep' && deepResult
      ? deepResult.translatedText
      : basicResult?.translatedText || '';

  const activeReading =
    engineMode === 'deep' && deepResult
      ? deepResult.reading || ''
      : basicResult?.reading || '';

  const activeThaiPhonetic =
    engineMode === 'deep' && deepResult ? deepResult.thaiPhonetic || '' : '';

  const effectiveSourceLang: TranslatorLang =
    sourceLang === 'AUTO'
      ? deepResult?.detectedSourceLang || basicResult?.detectedSourceLang || 'TH'
      : sourceLang;

  // Handle restore from History/Saved drawer
  useEffect(() => {
    if (!restorePayload) return;
    setSourceLang(restorePayload.sourceLang);
    setTargetLang(restorePayload.targetLang);
    setInputText(restorePayload.sourceText);
    setDeepResult(null);
    setAiErrorBanner(null);
  }, [restorePayload]);

  // Keep starred indicator synchronized
  useEffect(() => {
    if (!inputText.trim() || !activeTranslatedText.trim()) {
      setStarred(false);
      return;
    }
    setStarred(isPhraseSaved(effectiveSourceLang, targetLang, inputText, activeTranslatedText));
  }, [inputText, activeTranslatedText, effectiveSourceLang, targetLang]);

  // Cleanup speech recognition & audio on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      try {
        recognitionRef.current?.stop();
      } catch {}
      stopThaiTTS();
    };
  }, []);

  // Debounced Free Unlimited Basic Translation whenever input or language changes
  useEffect(() => {
    const clean = inputText.trim();
    if (!clean) {
      setBasicResult(null);
      setDeepResult(null);
      setErrorMsg(null);
      setAiErrorBanner(null);
      setIsBasicLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsBasicLoading(true);
      setErrorMsg(null);
      try {
        const res = await translateBasic({
          text: clean,
          sourceLang,
          targetLang,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setBasicResult(res);
        // If user was viewing previous AI deep result for different text, clear stale deep result
        setDeepResult((prev) => (prev ? null : prev));
        addTranslatorHistory({
          sourceLang: res.detectedSourceLang,
          targetLang,
          sourceText: clean,
          translatedText: res.translatedText,
          reading: res.reading,
          isAiDeep: false,
        });
        onHistoryChanged();
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setErrorMsg(err?.message || 'ไม่สามารถแปลข้อความได้ในขณะนี้');
      } finally {
        if (!controller.signal.aborted) {
          setIsBasicLoading(false);
        }
      }
    }, 450);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText, sourceLang, targetLang]);

  const executeDeepTranslate = useCallback(
    async (chosenTone: TranslatorTone, cleanText: string, paidWithCredits: boolean) => {
      setEngineMode('deep');
      setIsDeepLoading(true);
      setAiErrorBanner(null);

      try {
        const res = await translateDeepAi({
          text: cleanText,
          sourceLang,
          targetLang,
          tone: chosenTone,
          paidWithCredits,
        });
        setDeepResult(res);
        addTranslatorHistory({
          sourceLang: res.detectedSourceLang,
          targetLang,
          sourceText: cleanText,
          translatedText: res.translatedText,
          reading: res.reading,
          thaiPhonetic: res.thaiPhonetic,
          tone: chosenTone,
          isAiDeep: true,
        });
        onHistoryChanged();
        if (paidWithCredits) {
          onNotify('แปลเจาะลึกด้วย AI สำเร็จ (-1 เครดิต)');
        }
      } catch (err: any) {
        if (err instanceof TranslatorAiError) {
          if (!paidWithCredits && (err.byokQuotaExhausted || err.byokInvalidKey)) {
            setPendingAiArgs({ text: cleanText, tone: chosenTone });
            setFallbackModalReason('byok_google_429');
            return;
          }
          if (!paidWithCredits && err.byokRequired) {
            const sub = await loadUserSubscription();
            setPendingAiArgs({ text: cleanText, tone: chosenTone });
            setFallbackModalReason(getTotalCredits(sub) >= 1 ? 'no_byok_credit_confirm' : 'insufficient_credits');
            return;
          }
          if (err.insufficientCredits) {
            setFallbackModalReason('insufficient_credits');
            return;
          }
          setAiErrorBanner({
            message: err.message,
            needsByok: Boolean(err.byokRequired || err.byokInvalidKey),
            needsAuth: Boolean(err.authRequired),
          });
        } else {
          setAiErrorBanner({
            message: err?.message || 'ไม่สามารถวิเคราะห์คำแปลด้วย AI ได้ในขณะนี้',
          });
        }
      } finally {
        setIsDeepLoading(false);
      }
    },
    [sourceLang, targetLang, onNotify, onHistoryChanged]
  );

  const runDeepTranslate = useCallback(
    async (overrideTone?: TranslatorTone, overrideText?: string) => {
      const clean = (overrideText ?? inputText).trim();
      if (!clean) {
        onNotify('กรุณาพิมพ์ข้อความที่ต้องการแปลเจาะลึกก่อนครับ');
        return;
      }
      const chosenTone = overrideTone || tone;
      if (overrideTone) setTone(overrideTone);

      if (!auth.currentUser?.uid) {
        setEngineMode('deep');
        setAiErrorBanner({
          message: 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้โหมด AI เจาะลึก (โหมดแปลพื้นฐานยังใช้ฟรีไม่อั้นได้ทันที)',
          needsAuth: true,
        });
        return;
      }

      await syncByokDailyUsageWithFirestore().catch(() => {});
      const quota = getByokQuotaStatus('translate_ai');

      if (quota.hasKey && quota.canUseFree) {
        await executeDeepTranslate(chosenTone, clean, false);
        return;
      }

      setPendingAiArgs({ text: clean, tone: chosenTone });
      if (quota.hasKey && !quota.canUseFree) {
        setFallbackModalReason('byok_daily_exhausted');
        return;
      }

      const sub = await loadUserSubscription();
      setFallbackModalReason(getTotalCredits(sub) >= 1 ? 'no_byok_credit_confirm' : 'insufficient_credits');
    },
    [inputText, tone, onNotify, executeDeepTranslate]
  );

  const handleSwapLanguages = () => {
    const resolvedSource =
      sourceLang === 'AUTO'
        ? deepResult?.detectedSourceLang || basicResult?.detectedSourceLang || (targetLang === 'TH' ? 'EN' : 'TH')
        : sourceLang;

    if (resolvedSource === targetLang) {
      setTargetLang(resolvedSource === 'TH' ? 'EN' : 'TH');
      return;
    }

    const prevTranslation = activeTranslatedText;
    setSourceLang(targetLang);
    setTargetLang(resolvedSource);
    setDeepResult(null);
    setAiErrorBanner(null);
    if (prevTranslation) {
      setInputText(prevTranslation);
    }
  };

  const handlePaste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip && clip.trim()) {
        setInputText(clip.slice(0, 2000));
        onNotify('วางข้อความจากคลิปบอร์ดแล้ว');
      }
    } catch {
      onNotify('ไม่สามารถอ่านคลิปบอร์ดอัตโนมัติได้ กรุณากด Ctrl+V หรือแตะค้างเพื่อวาง');
    }
  };

  const handleCopy = async (textToCopy: string = activeTranslatedText) => {
    if (!textToCopy.trim()) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      onNotify('คัดลอกคำแปลเรียบร้อยแล้ว');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onNotify('ไม่สามารถคัดลอกได้');
    }
  };

  const handleToggleStar = () => {
    if (!inputText.trim() || !activeTranslatedText.trim()) return;
    const res = toggleSavedPhrase({
      sourceLang: effectiveSourceLang,
      targetLang,
      sourceText: inputText.trim(),
      translatedText: activeTranslatedText.trim(),
      reading: activeReading || undefined,
      thaiPhonetic: activeThaiPhonetic || undefined,
      noteTh: engineMode === 'deep' ? `โทน${TRANSLATOR_TONES.find((t) => t.id === tone)?.labelTh || ''}` : undefined,
    });
    setStarred(res.saved);
    onSavedListChanged();
    onNotify(res.saved ? 'บันทึกประโยคลงคลังโปรดแล้ว' : 'นำออกจากคลังโปรดแล้ว');
  };

  const handleToggleDictation = () => {
    if (isDictating) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsDictating(false);
      return;
    }

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      onNotify('เบราว์เซอร์นี้ไม่รองรับการพิมพ์ด้วยเสียงโดยตรง แนะนำใช้โหมด "ล่าม 2 ฝั่ง" แทนครับ');
      return;
    }

    try {
      stopThaiTTS();
      const rec = new SpeechRecognitionCtor();
      const dictateLang = sourceLang === 'AUTO' ? 'TH' : sourceLang;
      rec.lang = TRANSLATOR_LANG_MAP[dictateLang].bcp47;
      rec.interimResults = true;
      rec.continuous = false;

      rec.onstart = () => setIsDictating(true);
      rec.onresult = (event: any) => {
        let combined = '';
        for (let i = 0; i < event.results.length; i++) {
          combined += event.results[i][0]?.transcript || '';
        }
        if (combined.trim()) {
          setInputText(combined.trim().slice(0, 2000));
        }
      };
      rec.onerror = () => {
        setIsDictating(false);
        onNotify('ไม่สามารถรับเสียงจากไมโครโฟนได้ กรุณาตรวจสอบสิทธิ์ไมโครโฟน');
      };
      rec.onend = () => setIsDictating(false);

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setIsDictating(false);
      onNotify('ไม่สามารถเปิดไมโครโฟนได้');
    }
  };

  return (
    <div className="space-y-4">
      {/* Language & Engine Bar */}
      <div className="bg-white border border-indigo-100 rounded-2xl p-3 sm:p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Language Pickers + Swap */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <select
            aria-label="ภาษาต้นทาง"
            value={sourceLang}
            onChange={(e) => {
              const next = e.target.value as TranslatorSourceLang;
              setSourceLang(next);
              if (next !== 'AUTO' && next === targetLang) {
                setTargetLang(next === 'TH' ? 'EN' : 'TH');
              }
            }}
            className="flex-1 min-w-0 bg-slate-50 border border-slate-200 hover:border-indigo-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="AUTO">
              ✨ ตรวจจับอัตโนมัติ
              {sourceLang === 'AUTO' && basicResult?.detectedSourceLang
                ? ` (${TRANSLATOR_LANG_MAP[basicResult.detectedSourceLang].labelTh})`
                : ''}
            </option>
            {TRANSLATOR_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.labelTh} ({l.nativeName})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleSwapLanguages}
            aria-label="สลับภาษาต้นทางและปลายทาง"
            className="p-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-transform active:scale-95 shrink-0 cursor-pointer"
            title="สลับภาษา"
          >
            <ArrowLeftRight size={16} />
          </button>

          <select
            aria-label="ภาษาปลายทาง"
            value={targetLang}
            onChange={(e) => {
              const next = e.target.value as TranslatorLang;
              setTargetLang(next);
              if (sourceLang !== 'AUTO' && sourceLang === next) {
                setSourceLang(next === 'TH' ? 'EN' : 'TH');
              }
            }}
            className="flex-1 min-w-0 bg-slate-50 border border-slate-200 hover:border-indigo-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            {TRANSLATOR_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.labelTh} ({l.nativeName})
              </option>
            ))}
          </select>
        </div>

        {/* Engine Mode Segmented 2-Button Toggle */}
        <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl shrink-0 self-start md:self-auto">
          <button
            type="button"
            onClick={() => {
              setEngineMode('basic');
              setAiErrorBanner(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              engineMode === 'basic'
                ? 'bg-white text-emerald-700 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Zap size={13} />
            <span>แบบฟรีไม่อั้น (0 เครดิต)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (inputText.trim() && !deepResult && !isDeepLoading) {
                runDeepTranslate();
              } else {
                setEngineMode('deep');
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              engineMode === 'deep'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-indigo-700'
            }`}
          >
            <Sparkles size={13} />
            <span>ใช้ AI เจาะลึก (BYOK / 1 เครดิต)</span>
          </button>
        </div>
      </div>

      {/* Main Split Translation Workspace (50% / 50% on Desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 bg-white border border-indigo-100 rounded-2xl overflow-hidden shadow-xs">
        {/* Left Pane: Source Input */}
        <div className="flex flex-col border-b lg:border-b-0 lg:border-r border-indigo-100/90 min-h-[250px]">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-500">
              {sourceLang === 'AUTO'
                ? basicResult?.detectedSourceLang
                  ? `ตรวจพบ: ${TRANSLATOR_LANG_MAP[basicResult.detectedSourceLang].flag} ${TRANSLATOR_LANG_MAP[basicResult.detectedSourceLang].labelTh}`
                  : 'พิมพ์หรือวางข้อความภาษาใดก็ได้'
                : `${TRANSLATOR_LANG_MAP[sourceLang].flag} ${TRANSLATOR_LANG_MAP[sourceLang].labelTh}`}
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleToggleDictation}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  isDictating
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'text-slate-500 hover:text-indigo-700 hover:bg-indigo-50'
                }`}
                title="พูดด้วยเสียงเพื่อพิมพ์"
              >
                {isDictating ? <MicOff size={13} /> : <Mic size={13} />}
                <span>{isDictating ? 'กำลังฟัง...' : 'พูด'}</span>
              </button>
              <button
                type="button"
                onClick={handlePaste}
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer"
                title="วางจากคลิปบอร์ด"
              >
                <Clipboard size={14} />
              </button>
              {inputText && (
                <button
                  type="button"
                  onClick={() => {
                    setInputText('');
                    setBasicResult(null);
                    setDeepResult(null);
                    setAiErrorBanner(null);
                    stopThaiTTS();
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  title="ล้างข้อความ"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value.slice(0, 2000))}
            placeholder="พิมพ์ข้อความที่ต้องการแปลที่นี่... (รองรับ ไทย อังกฤษ จีน ญี่ปุ่น เกาหลี)"
            rows={5}
            className="flex-1 w-full p-4 text-base sm:text-lg text-slate-900 placeholder:text-slate-400 bg-transparent resize-none focus:outline-none leading-relaxed"
          />

          {/* Quick Starters when empty */}
          {!inputText.trim() && (
            <div className="px-4 pb-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-400 mr-1">ลองกด:</span>
              {QUICK_STARTERS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => {
                    setSourceLang(q.src);
                    setTargetLang(q.tgt);
                    setInputText(q.text);
                  }}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200/80 transition-colors cursor-pointer"
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {/* Source Footer */}
          <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50/40">
            <div className="flex items-center gap-2">
              {inputText.trim() && (
                <button
                  type="button"
                  onClick={() => playTranslatorTTS(inputText.trim(), effectiveSourceLang)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-700 cursor-pointer"
                >
                  <Volume2 size={14} />
                  <span>ฟังต้นฉบับ</span>
                </button>
              )}
              <span className="text-xs text-slate-400 tabular-nums">{inputText.length} / 2,000</span>
            </div>

            {inputText.trim() && (
              <button
                type="button"
                disabled={isDeepLoading}
                onClick={() => runDeepTranslate()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                {isDeepLoading ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>กำลังวิเคราะห์...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} />
                    <span>เจาะลึกโทน & แยกศัพท์ (AI)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Right Pane: Translation Result */}
        <div className="flex flex-col bg-indigo-50/25 min-h-[250px]">
          <div className="px-4 py-2.5 border-b border-indigo-100/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
              <span>
                {TRANSLATOR_LANG_MAP[targetLang].flag} {TRANSLATOR_LANG_MAP[targetLang].labelTh}
              </span>
              {engineMode === 'deep' && deepResult ? (
                <span className="text-[11px] font-semibold text-indigo-600">
                  • ✦ AI โทน{TRANSLATOR_TONES.find((t) => t.id === tone)?.labelTh}
                </span>
              ) : basicResult ? (
                <span className="text-[11px] font-semibold text-emerald-700">
                  • ● แปลไวฟรี
                </span>
              ) : null}
            </div>

            {activeTranslatedText && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => playTranslatorTTS(activeTranslatedText, targetLang)}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-700 hover:bg-white transition-colors cursor-pointer"
                  title="ฟังเสียงปกติ (1.0x)"
                >
                  <Volume2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => playTranslatorTTS(activeTranslatedText, targetLang, { slow: true })}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-700 hover:bg-white transition-colors cursor-pointer"
                  title="ฟังเสียงช้าเพื่อฝึกออกเสียง (0.75x)"
                >
                  <Turtle size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy()}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-700 hover:bg-white transition-colors cursor-pointer"
                  title="คัดลอกคำแปล"
                >
                  {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                </button>
                <button
                  type="button"
                  onClick={handleToggleStar}
                  className={`p-1.5 rounded-lg hover:bg-white transition-colors cursor-pointer ${
                    starred ? 'text-amber-500' : 'text-slate-500 hover:text-amber-500'
                  }`}
                  title={starred ? 'นำออกจากคลังโปรด' : 'ติดดาวเก็บไว้ฟังซ้ำ'}
                >
                  <Star size={15} fill={starred ? 'currentColor' : 'none'} />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 p-4 flex flex-col justify-between gap-3">
            {isDeepLoading || (isBasicLoading && !activeTranslatedText) ? (
              <div className="space-y-3 py-3 animate-pulse">
                <div className="h-6 bg-indigo-200/50 rounded-lg w-5/6" />
                <div className="h-6 bg-indigo-200/40 rounded-lg w-3/5" />
                <div className="h-3.5 bg-indigo-200/30 rounded-lg w-2/5 mt-3" />
              </div>
            ) : errorMsg && !activeTranslatedText ? (
              <div className="my-auto text-sm text-rose-600 bg-rose-50/80 border border-rose-200 rounded-xl p-3.5">
                {errorMsg}
              </div>
            ) : activeTranslatedText ? (
              <div className="space-y-2.5">
                <p className="text-xl sm:text-2xl font-semibold text-slate-900 leading-relaxed break-words whitespace-pre-wrap">
                  {activeTranslatedText}
                </p>

                {activeReading && (
                  <div className="text-sm font-medium text-indigo-700 leading-snug break-words">
                    {activeReading}
                  </div>
                )}

                {activeThaiPhonetic && (
                  <div className="text-xs text-slate-600 bg-white/80 border border-indigo-100/80 rounded-xl px-3 py-2 leading-relaxed">
                    <span className="font-bold text-slate-500 mr-1.5">คำอ่านไทย:</span>
                    {activeThaiPhonetic}
                  </div>
                )}

                {engineMode === 'deep' && deepResult?.toneNoteTh && (
                  <p className="text-xs text-slate-500 leading-relaxed pt-1">
                    {deepResult.toneNoteTh}
                  </p>
                )}
              </div>
            ) : (
              <div className="my-auto text-slate-400 text-sm py-8">
                คำแปลพร้อมคำอ่านและเสียงพูดจะแสดงที่นี่ทันทีเมื่อคุณเริ่มพิมพ์
              </div>
            )}

            {/* Output Footer: Quick Polish Jump */}
            {activeTranslatedText && (
              <div className="pt-2.5 border-t border-indigo-100/80 flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] text-slate-400">
                  {isBasicLoading ? 'กำลังอัปเดตคำแปล...' : 'เสียงอ่าน Neural ฟรีครบ 5 ภาษา'}
                </span>
                <button
                  type="button"
                  onClick={() => onJumpToPolish(activeTranslatedText, targetLang)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  <Wand2 size={13} />
                  <span>นำคำแปลนี้ไปเกลาต่อ</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inline Tone Switcher Bar */}
      <div className="bg-white border border-indigo-100 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-600">ปรับโทนภาษา (AI):</span>
          {TRANSLATOR_TONES.map((t) => {
            const active = tone === t.id && engineMode === 'deep' && Boolean(deepResult);
            return (
              <button
                key={t.id}
                type="button"
                disabled={isDeepLoading}
                onClick={() => {
                  setTone(t.id);
                  if (inputText.trim()) {
                    runDeepTranslate(t.id);
                  }
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : tone === t.id
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200 hover:text-indigo-700'
                }`}
                title={t.shortDesc}
              >
                {t.labelTh}
              </button>
            );
          })}
        </div>

        <span className="text-[11px] font-medium text-slate-500">
          {hasByok
            ? `สิทธิ์ BYOK เหลือ ${aiQuotaRemaining}/${aiQuotaLimit} วันนี้ (ครบสิทธิ์ใช้ 1 เครดิต/ครั้ง)`
            : 'ใช้ BYOK ฟรี 150/วัน หรือ 1 เครดิต/ครั้ง (แปลพื้นฐานฟรีตลอด)'}
        </span>
      </div>

      {/* Friendly BYOK / Auth Guidance Banner (only when AI Deep fails due to missing key/login/quota) */}
      {aiErrorBanner && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs sm:text-sm text-amber-950 leading-relaxed font-medium">
            {aiErrorBanner.message}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {aiErrorBanner.needsAuth && (
              <button
                type="button"
                onClick={() => openLoginModal()}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                เข้าสู่ระบบด้วย Google
              </button>
            )}
            {aiErrorBanner.needsByok && (
              <button
                type="button"
                onClick={onOpenByok}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                <Key size={14} />
                <span>ตั้งค่า BYOK ฟรี</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Progressive Learning Concept Deck (shown after AI Deep Translate completes) */}
      {deepResult && (
        <div className="space-y-4">
          {/* 1. Vocabulary Breakdown -> 1-Click Save to SRS Wordbook */}
          {deepResult.breakdown.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1.5">
                  <BookOpen size={14} className="text-indigo-600" />
                  <span>แยกคำศัพท์สำคัญ ({deepResult.breakdown.length} คำ) — กดบันทึกเข้าสมุดศัพท์ได้ทันที</span>
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {deepResult.breakdown.map((item, idx) => (
                  <VocabBreakdownCard
                    key={`${item.word}_${idx}`}
                    item={item}
                    exampleSentence={targetLang !== 'TH' ? deepResult.translatedText : inputText.trim()}
                    exampleTh={targetLang === 'TH' ? deepResult.translatedText : inputText.trim()}
                    onNotify={onNotify}
                    onSavedListChanged={onSavedListChanged}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 2. Grammar Notes & Alternatives */}
          {(deepResult.grammarNotes.length > 0 || deepResult.alternatives.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {deepResult.grammarNotes.length > 0 && (
                <section className="bg-white border border-indigo-100 rounded-2xl p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    เกร็ดไวยากรณ์ & โครงสร้างประโยค
                  </h3>
                  <div className="space-y-2.5">
                    {deepResult.grammarNotes.map((g, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-50/90 border border-slate-200/70 space-y-1"
                      >
                        <div className="text-sm font-bold text-indigo-800">{g.pattern}</div>
                        <p className="text-xs text-slate-600 leading-relaxed">{g.explanationTh}</p>
                        {g.example && (
                          <p className="text-xs text-slate-500 italic pt-0.5">ตัวอย่าง: {g.example}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {deepResult.alternatives.length > 0 && (
                <section className="bg-white border border-indigo-100 rounded-2xl p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    สำนวนทางเลือกในระดับภาษาอื่น
                  </h3>
                  <div className="space-y-2.5">
                    {deepResult.alternatives.map((alt, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-indigo-50/25 border border-indigo-100/90 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-indigo-700">{alt.toneLabelTh}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => playTranslatorTTS(alt.text, targetLang)}
                              className="p-1 rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-white cursor-pointer"
                              title="ฟังเสียง"
                            >
                              <Volume2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopy(alt.text)}
                              className="p-1 rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-white cursor-pointer"
                              title="คัดลอก"
                            >
                              <Copy size={13} />
                            </button>
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{alt.text}</p>
                        {alt.reading && (
                          <p className="text-xs text-indigo-600">{alt.reading}</p>
                        )}
                        <p className="text-xs text-slate-500">{alt.nuanceTh}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      )}
      <ByokQuotaFallbackModal
        isOpen={Boolean(fallbackModalReason)}
        onClose={() => {
          setFallbackModalReason(null);
          setPendingAiArgs(null);
        }}
        feature="translate_ai"
        reason={fallbackModalReason || 'no_byok_credit_confirm'}
        creditCost={1}
        isBusy={isDeepLoading}
        onUseCredits={async () => {
          const args = pendingAiArgs || { text: inputText.trim(), tone };
          setFallbackModalReason(null);
          setPendingAiArgs(null);
          if (args.text) {
            await executeDeepTranslate(args.tone, args.text, true);
          }
        }}
      />
    </div>
  );
};

export default TextTranslatePanel;
