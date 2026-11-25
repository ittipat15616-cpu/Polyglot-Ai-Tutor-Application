import React, { useEffect, useState } from 'react';
import { AlertCircle, FileText, Key, Loader2, Lock, LogIn, Sparkles, X, Zap } from 'lucide-react';
import { ReadingLang, ReadingStory } from '../../types/reading';
import { auth } from '../../firebase';
import { openLoginModal } from '../../services/authHeaders';
import {
  analyzeCustomArticleWithAI,
  saveCustomArticle,
} from '../../services/readingService';
import {
  consumeByokFreeQuota,
  getByokQuotaStatus,
  getStoredByokKey,
  syncByokDailyUsageWithFirestore,
} from '../../services/byokService';
import {
  deductCredit,
  getTotalCredits,
  loadUserSubscription,
} from '../../services/subscriptionService';
import ByokQuotaFallbackModal, { QuotaFallbackReason } from '../ByokQuotaFallbackModal';

interface CustomArticleModalProps {
  isOpen: boolean;
  lang: ReadingLang;
  onClose: () => void;
  onCreated: (story: ReadingStory) => void;
}

const CREDIT_COST = 2;

export default function CustomArticleModal({
  isOpen,
  lang,
  onClose,
  onCreated,
}: CustomArticleModalProps) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSignedIn, setIsSignedIn] = useState<boolean>(() => Boolean(auth.currentUser));
  const [quotaStatus, setQuotaStatus] = useState(() => getByokQuotaStatus('reading_analyze'));

  const [fallbackReason, setFallbackReason] = useState<QuotaFallbackReason | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    const refresh = () => {
      setIsSignedIn(Boolean(auth.currentUser));
      setQuotaStatus(getByokQuotaStatus('reading_analyze'));
    };
    refresh();
    if (auth.currentUser) {
      syncByokDailyUsageWithFirestore()
        .then(refresh)
        .catch(refresh);
    }
    window.addEventListener('byok_key_updated', refresh);
    window.addEventListener('byok_quota_updated', refresh);
    return () => {
      window.removeEventListener('byok_key_updated', refresh);
      window.removeEventListener('byok_quota_updated', refresh);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isCn = lang === 'CN';
  const charCount = text.trim().length;

  const runAnalysis = async (mode: 'byok' | 'credits') => {
    if (!auth.currentUser) {
      setIsSignedIn(false);
      setErrorMsg('กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้ AI วิเคราะห์บทความส่วนตัวหรือใช้สิทธิ์ BYOK ครับ');
      return;
    }

    setErrorMsg(null);
    setFallbackReason(null);
    setIsAnalyzing(true);

    try {
      if (mode === 'credits') {
        const sub = await loadUserSubscription();
        if (getTotalCredits(sub) < CREDIT_COST) {
          setIsAnalyzing(false);
          setFallbackReason('insufficient_credits');
          return;
        }
      }

      const byokKey = mode === 'byok' ? getStoredByokKey() : null;
      const result = await analyzeCustomArticleWithAI({
        text: text.trim(),
        lang,
        title: title.trim(),
        byokKey,
      });

      if (result.error || !result.story) {
        if (result.authRequired) {
          setIsSignedIn(false);
          setErrorMsg(result.error || 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้ AI วิเคราะห์บทความส่วนตัวครับ');
          setIsAnalyzing(false);
          return;
        }
        if (mode === 'byok' && (result.isQuota429 || result.byokInvalidKey)) {
          setIsAnalyzing(false);
          setFallbackReason('byok_google_429');
          return;
        }
        setErrorMsg(result.error || 'ไม่สามารถวิเคราะห์บทความได้ กรุณาลองใหม่');
        setIsAnalyzing(false);
        return;
      }

      // Deduct quota/credits ONLY after successful analysis
      if (mode === 'byok') {
        await consumeByokFreeQuota('reading_analyze');
        setQuotaStatus(getByokQuotaStatus('reading_analyze'));
      } else {
        await deductCredit(CREDIT_COST);
      }

      const saved = await saveCustomArticle(result.story);
      setTitle('');
      setText('');
      setIsAnalyzing(false);
      onCreated(saved);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่');
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      setIsSignedIn(false);
      setErrorMsg('กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้ AI วิเคราะห์บทความส่วนตัวหรือใช้สิทธิ์ BYOK ครับ');
      return;
    }
    if (charCount < 30) {
      setErrorMsg('กรุณาวางบทความอย่างน้อย 30 ตัวอักษร');
      return;
    }
    if (charCount > 3500) {
      setErrorMsg('บทความยาวเกิน 3,500 ตัวอักษร กรุณาตัดให้กระชับขึ้น');
      return;
    }

    await syncByokDailyUsageWithFirestore().catch(() => {});
    const status = getByokQuotaStatus('reading_analyze');
    setQuotaStatus(status);

    if (status.hasKey && status.canUseFree) {
      await runAnalysis('byok');
      return;
    }

    if (status.hasKey && !status.canUseFree) {
      setFallbackReason('byok_daily_exhausted');
      return;
    }

    // No BYOK: check credits and confirm 2 credits
    const sub = await loadUserSubscription();
    if (getTotalCredits(sub) < CREDIT_COST) {
      setFallbackReason('insufficient_credits');
    } else {
      setFallbackReason('no_byok_credit_confirm');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
        <div className="bg-white w-full max-w-xl rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in duration-200">
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                  isCn ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
                }`}
              >
                <FileText size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  วางบทความ{isCn ? 'ภาษาจีน' : 'ภาษาอังกฤษ'}ส่วนตัว
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  AI จะแบ่งประโยค แปลไทย{isCn ? ' ใส่พินอิน' : ''} ดึงคำศัพท์เด่น และสร้างควิซ 3 ข้อให้พร้อมอ่านซ้ำฟรีตลอดไป
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isAnalyzing}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Cost / BYOK / Auth Lock Banner */}
            {!isSignedIn ? (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between gap-2 text-xs text-amber-900">
                <div className="flex items-center gap-2 font-semibold">
                  <Lock size={14} className="text-amber-600 shrink-0" />
                  <span>กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้ AI วิเคราะห์บทความส่วนตัวหรือใช้สิทธิ์ BYOK</span>
                </div>
                <span className="text-amber-700/80 font-mono tabular-nums shrink-0">
                  {charCount} / 3,500
                </span>
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                {quotaStatus.hasKey ? (
                  <div className={`flex items-center gap-2 font-semibold ${quotaStatus.canUseFree ? 'text-emerald-700' : 'text-amber-700'}`}>
                    <Key size={14} />
                    <span>
                      {quotaStatus.canUseFree
                        ? `BYOK ฟรีวันนี้เหลือ ${quotaStatus.remaining}/${quotaStatus.limit} บทความ`
                        : `BYOK ครบโควตาวันนี้แล้ว (เหลือ 0/${quotaStatus.limit}) · ใช้ ${CREDIT_COST} เครดิตต่อได้`}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-slate-700 font-semibold">
                    <Zap size={14} className="text-amber-500" />
                    <span>ใช้ {CREDIT_COST} เครดิต / บทความ (หรือเชื่อม BYOK ฟรีวันละ 3 บทความ)</span>
                  </div>
                )}
                <span className="text-slate-400 font-mono tabular-nums">
                  {charCount} / 3,500
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ชื่อเรื่อง (ไม่บังคับ — AI ตั้งให้ได้)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isAnalyzing}
                placeholder={isCn ? 'เช่น 今天的科技新闻' : 'e.g., Morning Routine Tips'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                เนื้อหาบทความ{isCn ? 'ภาษาจีน' : 'ภาษาอังกฤษ'} *
              </label>
              <textarea
                rows={7}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={isAnalyzing}
                placeholder={
                  isCn
                    ? 'วางย่อหน้าข่าว เรื่องสั้น หรือบทความภาษาจีนที่นี่ (30–3,500 ตัวอักษร)...'
                    : 'Paste an English news paragraph, blog excerpt, or short story here (30–3,500 characters)...'
                }
                className="w-full px-3.5 py-3 rounded-xl border border-slate-200 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 resize-none"
              />
            </div>

            {errorMsg && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700 font-medium flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isAnalyzing}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              {!isSignedIn ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openLoginModal();
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-all"
                >
                  <LogIn size={16} />
                  <span>เข้าสู่ระบบด้วย Google</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isAnalyzing || charCount < 30}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-xs transition-all disabled:opacity-50 ${
                    isCn ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>กำลังแปลและสร้างควิซ...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>
                        {quotaStatus.canUseFree
                          ? `วิเคราะห์บทความ (ฟรี BYOK · เหลือ ${quotaStatus.remaining}/${quotaStatus.limit})`
                          : `วิเคราะห์บทความ (${CREDIT_COST} เครดิต)`}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <ByokQuotaFallbackModal
        isOpen={Boolean(fallbackReason)}
        onClose={() => setFallbackReason(null)}
        feature="reading_analyze"
        reason={fallbackReason || 'no_byok_credit_confirm'}
        creditCost={CREDIT_COST}
        onUseCredits={() => runAnalysis('credits')}
        isBusy={isAnalyzing}
      />
    </>
  );
}
