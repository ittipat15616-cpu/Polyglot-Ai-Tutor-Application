import React, { useState, useRef } from 'react';
import {
  Camera,
  Upload,
  Volume2,
  Copy,
  Check,
  Loader2,
  Key,
  Sparkles,
  RotateCcw,
  Utensils,
  Signpost,
  FileText,
  Image as ImageIcon,
  Info,
} from 'lucide-react';
import {
  ImageTranslateContext,
  ImageTranslateResponse,
  TRANSLATOR_LANGUAGES,
  TRANSLATOR_LANG_MAP,
  TranslatorLang,
} from '../../types/translator';
import {
  compressImageForOcr,
  translateImageAi,
  TranslatorAiError,
} from '../../services/translatorService';
import { playTranslatorTTS } from '../../utils/audio';
import { openLoginModal } from '../../services/authHeaders';
import { getByokQuotaStatus, syncByokDailyUsageWithFirestore } from '../../services/byokService';
import { getTotalCredits, loadUserSubscription } from '../../services/subscriptionService';
import { auth } from '../../firebase';
import ByokQuotaFallbackModal, { QuotaFallbackReason } from '../ByokQuotaFallbackModal';
import VocabBreakdownCard from './VocabBreakdownCard';

interface PhotoTranslatePanelProps {
  hasByok: boolean;
  onOpenByok: () => void;
  onSwitchToFreeText?: () => void;
  onNotify: (msg: string) => void;
  onSavedListChanged: () => void;
}

const CONTEXT_OPTIONS: Array<{
  id: ImageTranslateContext;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: 'general', label: 'ทั่วไป', icon: ImageIcon },
  { id: 'menu', label: 'เมนูอาหาร', icon: Utensils },
  { id: 'sign', label: 'ป้าย / ประกาศ', icon: Signpost },
  { id: 'document', label: 'เอกสาร / แชท', icon: FileText },
];

export const PhotoTranslatePanel: React.FC<PhotoTranslatePanelProps> = ({
  hasByok,
  onOpenByok,
  onSwitchToFreeText,
  onNotify,
  onSavedListChanged,
}) => {
  const [targetLang, setTargetLang] = useState<TranslatorLang>('TH');
  const [imageContext, setImageContext] = useState<ImageTranslateContext>('menu');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imagePayload, setImagePayload] = useState<{ base64: string; mimeType: string } | null>(null);
  const [result, setResult] = useState<ImageTranslateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsByok, setNeedsByok] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fallbackModalReason, setFallbackModalReason] = useState<QuotaFallbackReason | null>(null);
  const [pendingArgs, setPendingArgs] = useState<{
    payload: { base64: string; mimeType: string };
    ctx: ImageTranslateContext;
    tLang: TranslatorLang;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const executeImageTranslation = async (
    payload: { base64: string; mimeType: string },
    ctx: ImageTranslateContext,
    tLang: TranslatorLang,
    paidWithCredits: boolean
  ) => {
    setIsLoading(true);
    setErrorMsg(null);
    setNeedsByok(false);
    setNeedsAuth(false);
    try {
      const data = await translateImageAi({
        imageBase64: payload.base64,
        mimeType: payload.mimeType,
        targetLang: tLang,
        imageContext: ctx,
        paidWithCredits,
      });
      setResult(data);
      if (paidWithCredits) {
        onNotify('อ่านและแปลจากรูปภาพสำเร็จ (-1 เครดิต)');
      }
    } catch (err: any) {
      if (err instanceof TranslatorAiError) {
        if (!paidWithCredits && (err.byokQuotaExhausted || err.byokInvalidKey)) {
          setPendingArgs({ payload, ctx, tLang });
          setFallbackModalReason('byok_google_429');
          return;
        }
        if (!paidWithCredits && err.byokRequired) {
          const sub = await loadUserSubscription();
          setPendingArgs({ payload, ctx, tLang });
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
      setErrorMsg(err?.message || 'ไม่สามารถอ่านและแปลรูปภาพได้ในขณะนี้');
    } finally {
      setIsLoading(false);
    }
  };

  const runImageTranslation = async (
    payload: { base64: string; mimeType: string },
    ctx: ImageTranslateContext = imageContext,
    tLang: TranslatorLang = targetLang
  ) => {
    if (!auth.currentUser?.uid) {
      setNeedsAuth(true);
      setErrorMsg('กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้ AI อ่านและแปลจากรูปภาพครับ');
      return;
    }

    await syncByokDailyUsageWithFirestore().catch(() => {});
    const quota = getByokQuotaStatus('translate_ai');
    if (quota.hasKey && quota.canUseFree) {
      await executeImageTranslation(payload, ctx, tLang, false);
      return;
    }

    setPendingArgs({ payload, ctx, tLang });
    if (quota.hasKey && !quota.canUseFree) {
      setFallbackModalReason('byok_daily_exhausted');
      return;
    }

    const sub = await loadUserSubscription();
    setFallbackModalReason(getTotalCredits(sub) >= 1 ? 'no_byok_credit_confirm' : 'insufficient_credits');
  };

  const handleFilePicked = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onNotify('กรุณาเลือกไฟล์รูปภาพ (JPG, PNG หรือ WebP)');
      return;
    }
    try {
      const compressed = await compressImageForOcr(file);
      setPreviewUrl(compressed.previewUrl);
      const payload = { base64: compressed.base64, mimeType: compressed.mimeType };
      setImagePayload(payload);
      setResult(null);
      await runImageTranslation(payload);
    } catch (err: any) {
      setErrorMsg(err?.message || 'ไม่สามารถประมวลผลรูปภาพได้');
    }
  };

  const handleReset = () => {
    setPreviewUrl(null);
    setImagePayload(null);
    setResult(null);
    setErrorMsg(null);
    setNeedsByok(false);
    setNeedsAuth(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleCopySummary = async () => {
    if (!result?.translatedSummary) return;
    try {
      await navigator.clipboard.writeText(result.translatedSummary);
      setCopied(true);
      onNotify('คัดลอกคำแปลจากรูปภาพแล้ว');
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div className="space-y-4">
      {/* Control Bar */}
      <div className="bg-white border border-indigo-100 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-slate-500 mr-1">ประเภทภาพ:</span>
          {CONTEXT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = imageContext === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setImageContext(opt.id);
                  if (imagePayload) runImageTranslation(imagePayload, opt.id, targetLang);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200 hover:text-indigo-700'
                }`}
              >
                <Icon size={13} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">แปลเป็น:</span>
          <select
            value={targetLang}
            onChange={(e) => {
              const nextLang = e.target.value as TranslatorLang;
              setTargetLang(nextLang);
              if (imagePayload) runImageTranslation(imagePayload, imageContext, nextLang);
            }}
            className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:border-indigo-400"
          >
            {TRANSLATOR_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.labelTh}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Hidden Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFilePicked(e.target.files?.[0])}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFilePicked(e.target.files?.[0])}
      />

      {/* Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Image Upload / Preview */}
        <div className="bg-white border border-indigo-100 rounded-2xl p-4 flex flex-col justify-between gap-4 min-h-[300px]">
          {previewUrl ? (
            <div className="space-y-3 flex-1 flex flex-col">
              <div className="relative rounded-xl overflow-hidden bg-slate-950/5 border border-slate-200 flex-1 flex items-center justify-center max-h-[380px]">
                <img
                  src={previewUrl}
                  alt="ภาพที่ต้องการแปล"
                  className="max-h-[380px] w-auto object-contain"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <RotateCcw size={13} />
                  <span>เปลี่ยนรูปภาพ</span>
                </button>
                <button
                  type="button"
                  disabled={isLoading || !imagePayload}
                  onClick={() => imagePayload && runImageTranslation(imagePayload)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 transition-colors cursor-pointer"
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  <span>แปลรูปนี้อีกครั้ง</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFilePicked(e.dataTransfer.files?.[0]);
              }}
              className="flex-1 border-2 border-dashed border-indigo-200/90 rounded-2xl bg-indigo-50/20 flex flex-col items-center justify-center text-center p-6 gap-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <Camera size={24} />
              </div>
              <div className="space-y-1 max-w-xs">
                <h3 className="text-sm font-bold text-slate-800">
                  ถ่ายรูปหรืออัปโหลดภาพป้าย เมนู หรือเอกสาร
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  AI อ่านข้อความในภาพได้ครบทั้งไทย อังกฤษ จีน ญี่ปุ่น และเกาหลี พร้อมอธิบายเมนูอาหารหรือเกร็ดสำคัญให้ทันที
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  <Camera size={15} />
                  <span>ถ่ายรูปด้วยกล้อง (AI)</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold transition-all cursor-pointer"
                >
                  <Upload size={15} />
                  <span>เลือกรูปจากเครื่อง (AI)</span>
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 text-[11px]">
                {!hasByok && (
                  <span className="text-amber-700 font-medium">
                    ใช้สิทธิ์ BYOK ฟรีวันละ 150 ครั้ง หรือ 1 เครดิต/ครั้ง
                  </span>
                )}
                {onSwitchToFreeText && (
                  <button
                    type="button"
                    onClick={onSwitchToFreeText}
                    className="font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    หรือสลับไปพิมพ์แปลฟรีไม่อั้น (0 เครดิต)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: OCR Translation Results */}
        <div className="bg-indigo-50/30 border border-indigo-100 rounded-2xl p-4 flex flex-col gap-3 min-h-[300px]">
          <div className="flex items-center justify-between pb-2.5 border-b border-indigo-100/80">
            <span className="text-xs font-bold text-indigo-900">
              ผลลัพธ์การอ่านและแปลภาพ
              {result?.detectedSourceLang && (
                <span className="ml-2 text-indigo-600 font-semibold">
                  • ตรวจพบภาษา {TRANSLATOR_LANG_MAP[result.detectedSourceLang].flag}{' '}
                  {TRANSLATOR_LANG_MAP[result.detectedSourceLang].labelTh}
                </span>
              )}
            </span>
            {result?.translatedSummary && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => playTranslatorTTS(result.translatedSummary, targetLang)}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-700 hover:bg-white cursor-pointer"
                  title="ฟังคำแปล"
                >
                  <Volume2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-700 hover:bg-white cursor-pointer"
                  title="คัดลอกคำแปล"
                >
                  {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                </button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="my-auto py-12 text-center space-y-3">
              <Loader2 size={28} className="animate-spin text-indigo-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">กำลังอ่านข้อความและแปลจากรูปภาพ...</p>
              <p className="text-xs text-slate-500">ใช้เวลาประมาณ 2–4 วินาที</p>
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
          ) : result ? (
            <div className="space-y-3 overflow-y-auto max-h-[420px] pr-1">
              {result.culturalNoteTh && (
                <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/80 flex items-start gap-2 text-xs text-amber-950 leading-relaxed">
                  <Info size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">เกร็ดน่าสนใจจากภาพ: </span>
                    {result.culturalNoteTh}
                  </div>
                </div>
              )}

              {result.items.length > 0 ? (
                <div className="space-y-2">
                  {result.items.map((line, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-white border border-indigo-100/90 space-y-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-bold text-slate-900 leading-snug">
                          {line.translated}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            playTranslatorTTS(line.original, result.detectedSourceLang)
                          }
                          className="p-1 rounded-lg text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 shrink-0 cursor-pointer"
                          title="ฟังเสียงภาษาต้นฉบับในภาพ"
                        >
                          <Volume2 size={14} />
                        </button>
                      </div>
                      <div className="text-xs text-slate-600">{line.original}</div>
                      {line.reading && (
                        <div className="text-xs font-medium text-indigo-600">{line.reading}</div>
                      )}
                      {line.noteTh && (
                        <div className="text-[11px] text-slate-500 pt-0.5">{line.noteTh}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-white border border-indigo-100 space-y-2">
                  <p className="text-base font-semibold text-slate-900 whitespace-pre-wrap leading-relaxed">
                    {result.translatedSummary || 'ไม่พบข้อความที่อ่านได้ในรูปภาพนี้'}
                  </p>
                  {result.extractedText && (
                    <p className="text-xs text-slate-500 pt-2 border-t border-slate-100 whitespace-pre-wrap">
                      ต้นฉบับ: {result.extractedText}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="my-auto text-center space-y-1.5 py-10 px-4">
              <p className="text-sm font-medium text-slate-500">
                คำแปลและรายการเมนู/ข้อความจะแสดงที่นี่ทันทีหลังเลือกรูป
              </p>
              <p className="text-xs text-slate-400">
                รองรับการกดฟังเสียงภาษาต้นฉบับและบันทึกคำศัพท์จากภาพเข้าสมุดศัพท์
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Key Vocabulary from Image */}
      {result && result.keyVocab.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
            คำศัพท์น่าเก็บจากรูปภาพ ({result.keyVocab.length} คำ)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {result.keyVocab.map((item, idx) => (
              <VocabBreakdownCard
                key={`${item.word}_${idx}`}
                item={item}
                onNotify={onNotify}
                onSavedListChanged={onSavedListChanged}
              />
            ))}
          </div>
        </div>
      )}
      <ByokQuotaFallbackModal
        isOpen={Boolean(fallbackModalReason)}
        onClose={() => {
          setFallbackModalReason(null);
          setPendingArgs(null);
        }}
        feature="translate_ai"
        reason={fallbackModalReason || 'no_byok_credit_confirm'}
        creditCost={1}
        isBusy={isLoading}
        onUseCredits={async () => {
          const args = pendingArgs || (imagePayload ? { payload: imagePayload, ctx: imageContext, tLang: targetLang } : null);
          setFallbackModalReason(null);
          setPendingArgs(null);
          if (args) {
            await executeImageTranslation(args.payload, args.ctx, args.tLang, true);
          }
        }}
      />
    </div>
  );
};

export default PhotoTranslatePanel;
