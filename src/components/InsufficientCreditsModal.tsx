import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, Crown, Zap } from 'lucide-react';

interface InsufficientCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgradePlan: () => void;
  onTopupCredits: () => void;
}

export default function InsufficientCreditsModal({
  isOpen,
  onClose,
  onUpgradePlan,
  onTopupCredits
}: InsufficientCreditsModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden p-6 sm:p-7 text-center"
        >
          {/* Top Right Close Button (กากบาทมุมขวาบน) */}
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>

          {/* Icon Badge */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-500 flex items-center justify-center mb-4 shadow-sm">
            <AlertCircle size={36} className="animate-pulse" />
          </div>

          {/* Title */}
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">
            เครดิตไม่เพียงพอ
          </h3>

          {/* User-requested exact message */}
          <p className="text-slate-600 text-sm sm:text-base font-medium mb-5 leading-relaxed">
            เครดิตไม่พอ สามารถซื้อเพิ่มได้บริเวณนี้
          </p>

          {/* Rates breakdown indicator */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 mb-6 text-xs text-slate-600 space-y-1.5 text-left">
            <div className="flex items-center justify-between font-medium">
              <span>📞 คอลเสียง (ปิดกล้อง)</span>
              <span className="font-bold text-indigo-600">1 เครดิต / 30 วิ</span>
            </div>
            <div className="flex items-center justify-between font-medium">
              <span>📹 วิดีโอคอล (เปิดกล้อง)</span>
              <span className="font-bold text-purple-600">3 เครดิต / 30 วิ</span>
            </div>
            <div className="flex items-center justify-between font-medium">
              <span>🖼️ ส่งรูปภาพ / ตรวจข้อสอบ</span>
              <span className="font-bold text-emerald-600">3 เครดิต / ครั้ง</span>
            </div>
          </div>

          {/* Action Buttons (2 ปุ่ม: ซ้าย = อัปเกรดแพลน, ขวา = เติมเครดิต) */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {/* Left Button: อัปเกรดแพลน */}
            <button
              onClick={() => {
                onClose();
                onUpgradePlan();
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-sm sm:text-base shadow-lg shadow-indigo-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Crown size={18} className="shrink-0 text-amber-300" />
              <span>อัปเกรดแพลน</span>
            </button>

            {/* Right Button: เติมเครดิต */}
            <button
              onClick={() => {
                onClose();
                onTopupCredits();
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm sm:text-base shadow-lg shadow-emerald-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Zap size={18} className="shrink-0 text-amber-300" />
              <span>เติมเครดิต</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
