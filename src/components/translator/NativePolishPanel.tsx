import React, { useState, useEffect } from 'react';
import {
  Wand2,
  Volume2,
  Turtle,
  Copy,
  Check,
  Star,
  ArrowRight,
  Loader2,
  Key,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  PolishResponse,
  PolishSituation,
  TRANSLATOR_LANGUAGES,
  TRANSLATOR_TONES,
  TranslatorLang,
  TranslatorTone,
} from '../../types/translator';
import {
  polishSentenceAi,
  toggleSavedPhrase,
  translateBasic,
  TranslatorAiError,
} from '../../services/translatorService';
import { playTranslatorTTS } from '../../utils/audio';
import { openLoginModal } from '../../services/authHeaders';
import { getByokQuotaStatus, syncByokDailyUsageWithFirestore } from '../../services/byokService';
import { getTotalCredits, loadUserSubscription } from '../../services/subscriptionService';
import { auth } from '../../firebase';
import ByokQuotaFallbackModal, { QuotaFallbackReason } from '../ByokQuotaFallbackModal';

interface NativePolishPanelProps {
  initialText?: string;
  initialLang?: TranslatorLang;
  hasByok: boolean;
  onOpenByok: () => void;
  onNotify: (msg: string) => void;
  onSavedListChanged: () => void;
}

const SITUATION_OPTIONS: Array<{ id: PolishSituation; label: string }> = [
  { id: 'general', label: 'ทั่วไป' },
  { id: 'work_email', label: 'อีเมล / งาน' },
  { id: 'friend_chat', label: 'แชทเพื่อน' },
  { id: 'travel_service', label: 'ท่องเที่ยว / สั่งอาหาร' },
];

const SAMPLE_POLISH_BY_LANG: Record<TranslatorLang, string> = {
  EN: 'I want to ask if you can send me the file today because tomorrow I have meeting.',
  CN: '我明天有事，可不可以换一天见面？谢谢你。',
  JP: 'すみません、明日行けません。別の日がいいです。',
  KR: '죄송한데 내일 못 가요. 다른 날에 만나요.',
  TH: 'รบกวนช่วยส่งไฟล์งานให้วันนี้หน่อยนะ พรุ่งนี้ต้องเอาไปประชุมแล้ว',
};

export const NativePolishPanel: React.FC<NativePolishPanelProps> = ({
  initialText = '',
  initialLang = 'EN',
  hasByok,
  onOpenByok,
  onNotify,
  onSavedListChanged,
}) => {
  const [lang, setLang] = useState<TranslatorLang>(initialLang);
  const [tone, setTone] = useState<TranslatorTone>('polite');
  const [situation, setSituation] = useState<PolishSituation>('general');
  const [inputText, setInputText] = useState<string>(initialText);
  const [result, setResult] = useState<PolishResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsByok, setNeedsByok] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [freeCheckResult, setFreeCheckResult] = useState<string | null>(null);
  const [isCheckingFree, setIsCheckingFree] = useState(false);
  const [fallbackModalReason, setFallbackModalReason] = useState<QuotaFallbackReason | null>(null);
  const [pendingTone, setPendingTone] = useState<TranslatorTone | null>(null);

  useEffect(() => {
    if (initialText) {
      setInputText(initialText);
      setLang(initialLang);
      setResult(null);
      setErrorMsg(null);
    }
  }, [initialText, initialLang]);

  const executePolish = async (targetTone: TranslatorTone, clean: string, paidWithCredits: boolean) => {
    setIsLoading(true);
    setErrorMsg(null);
    setNeedsByok(false);
    setNeedsAuth(false);
    setIsStarred(false);
    setFreeCheckResult(null);

    try {
      const data = await polishSentenceAi({
        text: clean,
        lang,
        tone: targetTone,
        situation,
        paidWithCredits,
      });
      setResult(data);
      if (paidWithCredits) {
        onNotify('เกลาประโยคด้วย AI สำเร็จ (-1 เครดิต)');
      }
    } catch (err: any) {
      if (err instanceof TranslatorAiError) {
        if (!paidWithCredits && (err.byokQuotaExhausted || err.byokInvalidKey)) {
          setPendingTone(targetTone);
          setFallbackModalReason('byok_google_429');
          return;
        }
        if (!paidWithCredits && err.byokRequired) {
          const sub = await loadUserSubscription();
          setPendingTone(targetTone);
          setFallbackModalReason(getTotalCredits(sub) >= 1 ? 'no_byok_credit_confirm' : 'insufficient_credits');
          return;
        }
        if (err.insufficientCredits) {
          setFallbackModalReason('insufficient_credits');
          return;
        }
        setNeedsByok(Boolean(err.byokRequired || err.byokInvalidKey));
        setNeedsAuth(Boolean(err.authRequired));
      }
      setErrorMsg(err?.message || 'ไม่สามารถเกลาประโยคได้ในขณะนี้');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFreeMeaningCheck = async () => {
    const clean = inputText.trim();
    if (!clean) {
      onNotify('กรุณาพิมพ์ข้อความก่อนครับ');
      return;
    }
    setIsCheckingFree(true);
    setErrorMsg(null);
    setResult(null);
    try {
      const target = lang === 'TH' ? 'EN' : 'TH';
      const data = await translateBasic({
        text: clean,
        sourceLang: lang,
        targetLang: target,
      });
      setFreeCheckResult(data.translatedText);
    } catch (err: any) {
      setErrorMsg(err?.message || 'ไม่สามารถแปลเช็กความหมายได้ในขณะนี้');
    } finally {
      setIsCheckingFree(false);
    }
  };

  const handlePolish = async (overrideTone?: TranslatorTone) => {
    const clean = inputText.trim();
    if (!clean) {
      onNotify('กรุณาพิมพ์ประโยคที่ต้องการให้ AI เกลาก่อนครับ');
      return;
    }
    const targetTone = overrideTone || tone;
    if (overrideTone) setTone(overrideTone);

    if (!auth.currentUser?.uid) {
      setNeedsAuth(true);
      setErrorMsg('กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้ AI เกลาประโยคครับ (กดปุ่มแบบฟรีเพื่อแปลเช็กความหมายได้ทันที)');
      return;
    }

    await syncByokDailyUsageWithFirestore().catch(() => {});
    const quota = getByokQuotaStatus('translate_ai');
    if (quota.hasKey && quota.canUseFree) {
      await executePolish(targetTone, clean, false);
      return;
    }

    setPendingTone(targetTone);
    if (quota.hasKey && !quota.canUseFree) {
      setFallbackModalReason('byok_daily_exhausted');
      return;
    }

    const sub = await loadUserSubscription();
    setFallbackModalReason(getTotalCredits(sub) >= 1 ? 'no_byok_credit_confirm' : 'insufficient_credits');
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onNotify('คัดลอกประโยคที่เกลาแล้ว');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onNotify('ไม่สามารถคัดลอกได้');
    }
  };

  const handleToggleStar = () => {
    if (!result) return;
    const res = toggleSavedPhrase({
      sourceLang: lang,
      targetLang: 'TH',
      sourceText: result.polishedText,
      translatedText: result.meaningTh || inputText.trim(),
      reading: result.reading,
      thaiPhonetic: result.thaiPhonetic,
      noteTh: `เกลาประโยค (${TRANSLATOR_TONES.find((t) => t.id === tone)?.labelTh || tone})`,
    });
    setIsStarred(res.saved);
    onSavedListChanged();
    onNotify(res.saved ? 'บันทึกประโยคลงคลังโปรดแล้ว' : 'นำออกจากคลังโปรดแล้ว');
  };

  return (
    <div className="space-y-4">
      {/* Control Strip */}
      <div className="bg-white border border-indigo-100 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-500">ภาษาของประโยค:</span>
            <div className="inline-flex flex-wrap items-center gap-1 bg-slate-100/90 p-1 rounded-xl">
              {TRANSLATOR_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    setLang(l.code);
                    setResult(null);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    lang === l.code
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {l.flag} {l.labelTh}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-500">บริบท:</span>
            {SITUATION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSituation(opt.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  situation === opt.id
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-white text-slate-500 border-slate-200 hover:text-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tone Selector */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-500">โทนที่ต้องการ:</span>
          {TRANSLATOR_TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTone(t.id);
                if (result && inputText.trim()) {
                  handlePolish(t.id);
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                tone === t.id
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200 hover:text-indigo-700'
              }`}
              title={t.shortDesc}
            >
              {t.labelTh}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: User Draft */}
        <div className="bg-white border border-indigo-100 rounded-2xl flex flex-col min-h-[260px]">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">ประโยคที่คุณแต่งไว้ (Draft)</span>
            <div className="flex items-center gap-2">
              {!inputText && (
                <button
                  type="button"
                  onClick={() => setInputText(SAMPLE_POLISH_BY_LANG[lang])}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  ลองตัวอย่าง
                </button>
              )}
              {inputText && (
                <button
                  type="button"
                  onClick={() => {
                    setInputText('');
                    setResult(null);
                    setErrorMsg(null);
                  }}
                  className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
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
            placeholder={`พิมพ์ประโยคภาษา${TRANSLATOR_LANGUAGES.find((l) => l.code === lang)?.labelTh || ''}ที่อยากเกลาให้เป็นธรรมชาติ...`}
            className="flex-1 w-full p-4 text-base text-slate-900 placeholder:text-slate-400 bg-transparent resize-none focus:outline-none leading-relaxed"
            rows={5}
          />

          <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-400 tabular-nums">{inputText.length} / 2,000</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isCheckingFree || isLoading || !inputText.trim()}
                onClick={handleFreeMeaningCheck}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-50 text-emerald-800 text-xs font-bold transition-all cursor-pointer"
              >
                {isCheckingFree ? <Loader2 size={14} className="animate-spin" /> : null}
                <span>เช็กความหมายฟรี (0 เครดิต)</span>
              </button>
              <button
                type="button"
                disabled={isLoading || isCheckingFree || !inputText.trim()}
                onClick={() => handlePolish()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>กำลังเกลาประโยค...</span>
                  </>
                ) : (
                  <>
                    <Wand2 size={15} />
                    <span>ใช้ AI เกลา (BYOK / 1 เครดิต)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Polished Native Output */}
        <div className="bg-indigo-50/35 border border-indigo-100 rounded-2xl flex flex-col min-h-[260px]">
          <div className="px-4 py-3 border-b border-indigo-100/80 flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-800 inline-flex items-center gap-1.5">
              <Sparkles size={13} className="text-indigo-600" />
              <span>ประโยคฉบับเจ้าของภาษา (Native Polish)</span>
            </span>
            {result && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => playTranslatorTTS(result.polishedText, lang)}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-700 hover:bg-white transition-colors cursor-pointer"
                  title="ฟังเสียงปกติ (1.0x)"
                >
                  <Volume2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => playTranslatorTTS(result.polishedText, lang, { slow: true })}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-700 hover:bg-white transition-colors cursor-pointer"
                  title="ฟังเสียงช้าเพื่อฝึกออกเสียง (0.75x)"
                >
                  <Turtle size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(result.polishedText)}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-700 hover:bg-white transition-colors cursor-pointer"
                  title="คัดลอก"
                >
                  {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                </button>
                <button
                  type="button"
                  onClick={handleToggleStar}
                  className={`p-1.5 rounded-lg hover:bg-white transition-colors cursor-pointer ${
                    isStarred ? 'text-amber-500' : 'text-slate-500 hover:text-amber-500'
                  }`}
                  title="บันทึกเข้าคลังโปรด"
                >
                  <Star size={15} fill={isStarred ? 'currentColor' : 'none'} />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 p-4 flex flex-col justify-between gap-3">
            {isLoading ? (
              <div className="space-y-3 py-4 animate-pulse">
                <div className="h-5 bg-indigo-200/50 rounded-lg w-5/6" />
                <div className="h-5 bg-indigo-200/40 rounded-lg w-2/3" />
                <div className="h-3.5 bg-indigo-200/30 rounded-lg w-1/2 mt-4" />
              </div>
            ) : errorMsg ? (
              <div className="my-auto p-4 rounded-xl bg-white border border-amber-200 space-y-3">
                <p className="text-sm text-slate-700 leading-relaxed">{errorMsg}</p>
                {needsAuth && (
                  <button
                    type="button"
                    onClick={() => openLoginModal()}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                  >
                    เข้าสู่ระบบด้วย Google
                  </button>
                )}
                {needsByok && (
                  <button
                    type="button"
                    onClick={onOpenByok}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                  >
                    <Key size={14} />
                    <span>เชื่อมคีย์ฟรี BYOK (150 ครั้ง/วัน)</span>
                  </button>
                )}
              </div>
            ) : freeCheckResult ? (
              <div className="space-y-3">
                <div className="text-xs font-bold text-emerald-700">
                  ● ผลแปลเช็กความหมายแบบฟรี (0 เครดิต)
                </div>
                <p className="text-xl font-semibold text-slate-900 leading-relaxed break-words">
                  {freeCheckResult}
                </p>
                <p className="text-xs text-slate-500">
                  หากต้องการให้ AI ช่วยปรับสำนวนและไวยากรณ์ให้สละสลวยเหมือนเจ้าของภาษา กดปุ่ม &quot;ใช้ AI เกลา (BYOK / 1 เครดิต)&quot; ได้เลยครับ
                </p>
              </div>
            ) : result ? (
              <div className="space-y-3">
                <p className="text-xl font-semibold text-slate-900 leading-relaxed break-words">
                  {result.polishedText}
                </p>
                {result.reading && (
                  <p className="text-xs font-medium text-indigo-700">{result.reading}</p>
                )}
                {result.thaiPhonetic && (
                  <p className="text-xs text-slate-500">คำอ่านไทย: {result.thaiPhonetic}</p>
                )}
                {result.meaningTh && (
                  <div className="pt-2 border-t border-indigo-100/90 text-sm text-slate-700">
                    <span className="text-xs font-bold text-slate-400 mr-1.5">ความหมาย:</span>
                    {result.meaningTh}
                  </div>
                )}
                {result.overallFeedbackTh && (
                  <div className="p-3 rounded-xl bg-white/90 border border-indigo-100 text-xs text-slate-700 leading-relaxed">
                    {result.overallFeedbackTh}
                  </div>
                )}
              </div>
            ) : (
              <div className="my-auto text-center space-y-2 py-8 px-4">
                <Wand2 size={26} className="mx-auto text-indigo-300" />
                <p className="text-sm font-medium text-slate-500">
                  เลือก &quot;เช็กความหมายฟรี&quot; หรือ &quot;ใช้ AI เกลาให้เหมือนเจ้าของภาษา&quot;
                </p>
                {!hasByok && (
                  <p className="text-xs text-amber-700">
                    ใช้สิทธิ์ BYOK ฟรีวันละ 150 ครั้ง หรือ 1 เครดิต/ครั้ง
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Learning Deck: Changes & Alternatives */}
      {result && (result.changes.length > 0 || result.alternatives.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* What Changed */}
          {result.changes.length > 0 && (
            <div className="bg-white border border-indigo-100 rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                สิ่งที่ปรับให้เป็นธรรมชาติ ({result.changes.length} จุด)
              </h3>
              <div className="space-y-2.5">
                {result.changes.map((ch, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-50/90 border border-slate-200/70 space-y-1.5"
                  >
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="line-through text-rose-600/90 bg-rose-50 px-2 py-0.5 rounded-md font-medium">
                        {ch.original}
                      </span>
                      <ArrowRight size={13} className="text-slate-400 shrink-0" />
                      <span className="text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md font-bold">
                        {ch.improved}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{ch.reasonTh}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alternative Phrasings */}
          {result.alternatives.length > 0 && (
            <div className="bg-white border border-indigo-100 rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                สำนวนทางเลือกที่เจ้าของภาษานิยมใช้
              </h3>
              <div className="space-y-2.5">
                {result.alternatives.map((alt, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-indigo-100/80 bg-indigo-50/20 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-indigo-700">{alt.toneLabelTh}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => playTranslatorTTS(alt.text, lang)}
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
                    {alt.reading && <p className="text-xs text-indigo-600">{alt.reading}</p>}
                    <p className="text-xs text-slate-500">{alt.nuanceTh}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <ByokQuotaFallbackModal
        isOpen={Boolean(fallbackModalReason)}
        onClose={() => {
          setFallbackModalReason(null);
          setPendingTone(null);
        }}
        feature="translate_ai"
        reason={fallbackModalReason || 'no_byok_credit_confirm'}
        creditCost={1}
        isBusy={isLoading}
        onUseCredits={async () => {
          const clean = inputText.trim();
          const chosenTone = pendingTone || tone;
          setFallbackModalReason(null);
          setPendingTone(null);
          if (clean) {
            await executePolish(chosenTone, clean, true);
          }
        }}
      />
    </div>
  );
};

export default NativePolishPanel;
