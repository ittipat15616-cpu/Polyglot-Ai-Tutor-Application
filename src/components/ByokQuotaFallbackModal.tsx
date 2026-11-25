import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Key, Clock, AlertCircle, Sparkles, X, ArrowRight } from 'lucide-react';
import { loadUserSubscription, getTotalCredits } from '../services/subscriptionService';
import { ByokQuotaFeature, BYOK_DAILY_LIMITS, getResetTimeLabelThai } from '../services/byokService';

export type QuotaFallbackReason =
  | 'byok_daily_exhausted'
  | 'byok_google_429'
  | 'no_byok_credit_confirm'
  | 'insufficient_credits';

interface ByokQuotaFallbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: ByokQuotaFeature;
  reason: QuotaFallbackReason;
  creditCost: number;
  customTitle?: string;
  customSubtitle?: string;
  onUseCredits: () => void;
  isBusy?: boolean;
}

const FEATURE_META: Record<ByokQuotaFeature, { labelTh: string; unitTh: string }> = {
  vocab_exam: { labelTh: 'ตรวจข้อสอบคำศัพท์', unitTh: 'ครั้ง' },
  mock_test: { labelTh: 'ตรวจข้อสอบจำลองสอบ (AI)', unitTh: 'ครั้ง' },
  karaoke_translate: { labelTh: 'แปลเพลงใหม่จาก YouTube', unitTh: 'เพลง' },
  karaoke_explain: { labelTh: 'อธิบายคำศัพท์ในเพลงคาราโอเกะ (AI)', unitTh: 'คำ' },
  video_subtitle: { labelTh: 'ใส่ซับวิดีโอด้วย AI (≤ 5 นาที)', unitTh: 'คลิป' },
  reading_analyze: { labelTh: 'วิเคราะห์และแปลบทความส่วนตัว', unitTh: 'บทความ' },
  roleplay_custom: { labelTh: 'สร้างด่านจำลองสถานการณ์เอง (AI)', unitTh: 'ด่าน' },
  roleplay_report: { labelTh: 'วิเคราะห์ใบสรุปคะแนน Roleplay (AI)', unitTh: 'ครั้ง' },
  shadowing_analyze: { labelTh: 'วิเคราะห์เสียงฝึกพูดตามประโยค (AI)', unitTh: 'ครั้ง' },
  translate_ai: { labelTh: 'แปลภาษา AI เจาะลึก (Smart Translator)', unitTh: 'ครั้ง' },
};

export const ByokQuotaFallbackModal: React.FC<ByokQuotaFallbackModalProps> = ({
  isOpen,
  onClose,
  feature,
  reason,
  creditCost,
  customTitle,
  customSubtitle,
  onUseCredits,
  isBusy = false,
}) => {
  const [totalCredits, setTotalCredits] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) return;
    loadUserSubscription().then((s) => {
      setTotalCredits(getTotalCredits(s));
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const meta = FEATURE_META[feature];
  const dailyLimit = BYOK_DAILY_LIMITS[feature];
  const hasEnoughCredits = totalCredits >= creditCost;
  const resetLabel = getResetTimeLabelThai();

  let title = customTitle || '';
  let description = customSubtitle || '';

  if (!title) {
    if (reason === 'byok_daily_exhausted') {
      title = `ใช้สิทธิ์ฟรี BYOK ครบ ${dailyLimit}/${dailyLimit} ${meta.unitTh} ของวันนี้แล้ว`;
      description = `สิทธิ์ฟรีประจำวันสำหรับ "${meta.labelTh}" จะรีเซ็ตอัตโนมัติเวลา ${resetLabel} แต่คุณสามารถเลือกใช้เครดิตในแอปเพื่อทำต่อได้ทันที`;
    } else if (reason === 'byok_google_429') {
      title = 'Google API Key ส่วนตัวติดขีดจำกัดชั่วคราว (429)';
      description = `คีย์ฟรีจาก Google AI Studio ของคุณใช้ครบโควตารอบนี้แล้ว (รีเซ็ต ${resetLabel}) คุณสามารถสลับมาใช้เครดิตในแอปเพื่อดำเนินการต่อได้ทันทีโดยไม่เสียคำตอบเดิม`;
    } else if (reason === 'insufficient_credits') {
      title = 'เครดิต AI ในแอปไม่เพียงพอ';
      description = `การ${meta.labelTh}ใช้ ${creditCost} เครดิต (คงเหลือ ${totalCredits} เครดิต) คุณสามารถเติมเครดิต หรือเชื่อม Gemini API Key ส่วนตัว (BYOK) เพื่อรับสิทธิ์ฟรีทุกวันได้ครับ`;
    } else {
      title = `ยืนยันการใช้ ${creditCost} เครดิตสำหรับ${meta.labelTh}`;
      description =
        feature === 'karaoke_translate'
          ? `เมื่อแปลและบันทึกสำเร็จแล้ว ระบบจะเก็บลงคลังกลางเพื่อให้เปิดใช้งานซ้ำฟรีตลอดไป หรือคุณสามารถเชื่อม BYOK ฟรีเพื่อรับสิทธิ์ฟรีวันละ ${dailyLimit} ${meta.unitTh}`
          : `คุณยังไม่ได้เชื่อมคีย์ฟรี BYOK หรือต้องการใช้สิทธิ์ผ่านเซิร์ฟเวอร์ระบบ (${creditCost} เครดิต/ครั้ง) — หรือเชื่อมคีย์ฟรี BYOK เพื่อรับสิทธิ์ฟรีวันละ ${dailyLimit} ${meta.unitTh}`;
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-3 border-b border-slate-100">
            <div className="flex items-start gap-3">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                  reason === 'byok_google_429' || reason === 'insufficient_credits'
                    ? 'bg-amber-50 text-amber-600 border border-amber-200'
                    : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                }`}
              >
                {reason === 'byok_google_429' || reason === 'insufficient_credits' ? (
                  <AlertCircle size={22} />
                ) : (
                  <Zap size={22} />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 leading-snug">{title}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="ปิดหน้าต่าง"
            >
              <X size={18} />
            </button>
          </div>

          {/* Credit Status Card */}
          <div className="p-6 space-y-4">
            <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-slate-500">ค่าบริการเมื่อใช้เซิร์ฟเวอร์ระบบ</div>
                <div className="text-lg font-extrabold text-slate-900 mt-0.5 flex items-center gap-1.5">
                  <Zap size={18} className="text-amber-500" />
                  <span>{creditCost} เครดิต</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium text-slate-500">เครดิตคงเหลือของคุณ</div>
                <div
                  className={`text-lg font-extrabold mt-0.5 ${
                    hasEnoughCredits ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {totalCredits} เครดิต
                </div>
              </div>
            </div>

            {(reason === 'byok_daily_exhausted' || reason === 'byok_google_429') && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-indigo-50/60 border border-indigo-100 rounded-xl px-3.5 py-2.5">
                <Clock size={14} className="text-indigo-500 shrink-0" />
                <span>สิทธิ์ฟรี BYOK รีเซ็ตทุกวันเวลา <strong>{resetLabel}</strong></span>
              </div>
            )}

            {/* Primary CTA */}
            <div className="space-y-2.5 pt-1">
              {hasEnoughCredits ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={onUseCredits}
                  className="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Zap size={16} />
                  <span>ใช้ {creditCost} เครดิตในแอปทำต่อทันที</span>
                  <ArrowRight size={15} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    window.dispatchEvent(new CustomEvent('open-subscription-modal', { detail: { tab: 'topup' } }));
                  }}
                  className="w-full py-3 px-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles size={16} />
                  <span>เติมเครดิต / ดูแพ็กเกจสมาชิก</span>
                </button>
              )}

              {/* Offer BYOK setup if user does not have BYOK yet */}
              {(reason === 'no_byok_credit_confirm' || reason === 'insufficient_credits') && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    window.dispatchEvent(new CustomEvent('open-byok-modal'));
                  }}
                  className="w-full py-2.5 px-4 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-xs transition-all flex items-center justify-center gap-2"
                >
                  <Key size={14} />
                  <span>เชื่อมคีย์ฟรี BYOK (ใช้ฟรีวันละ {dailyLimit} {meta.unitTh})</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-2xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 font-semibold text-xs transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ByokQuotaFallbackModal;
