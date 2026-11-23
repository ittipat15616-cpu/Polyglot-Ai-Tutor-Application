import React, { useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { RoleplayDifficulty, RoleplayMission } from '../../data/roleplay';

interface CustomMissionModalProps {
  activeLang: 'EN' | 'CN';
  byokKey?: string | null;
  onMissionGenerated: (mission: RoleplayMission) => void;
  onClose: () => void;
}

const EXAMPLE_PROMPTS = [
  'ต่อรองราคาซื้อของที่ตลาดนัดกลางคืนกับแม่ค้า',
  'โทรไปเลื่อนนัดหมอฟันและถามเรื่องค่าใช้จ่าย',
  'ขอคืนเงินตั๋วคอนเสิร์ตที่ถูกเลื่อนวันจัดงาน',
  'พรีเซนต์ไอเดียโปรเจกต์ใหม่ให้หัวหน้าทีมฟังแบบกระชับ',
];

export const CustomMissionModal: React.FC<CustomMissionModalProps> = ({
  activeLang,
  byokKey,
  onMissionGenerated,
  onClose,
}) => {
  const [prompt, setPrompt] = useState('');
  const [difficulty, setDifficulty] = useState<RoleplayDifficulty>('medium');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (trimmed.length < 4) {
      setError('กรุณาพิมพ์รายละเอียดสถานการณ์ที่อยากซ้อมพูดอย่างน้อย 4 ตัวอักษรครับ');
      return;
    }

    setError(null);
    setIsGenerating(true);
    try {
      const resp = await fetch('/api/roleplay-custom-mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          difficulty,
          lang: activeLang,
          byokKey: byokKey || undefined,
        }),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.mission) {
        throw new Error(json?.error || 'ไม่สามารถสร้างด่านจำลองได้ในขณะนี้');
      }
      onMissionGenerated(json.mission as RoleplayMission);
    } catch (err: any) {
      setError(err?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้งครับ');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-3 sm:p-5"
      onClick={() => !isGenerating && onClose()}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/70">
          <div>
            <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
              Custom Roleplay Mission
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-0.5">
              สร้างด่านจำลองสถานการณ์เอง
            </h3>
          </div>
          <button
            type="button"
            disabled={isGenerating}
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer disabled:opacity-40"
            aria-label="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-800">
              อยากซ้อมพูดสถานการณ์อะไร?
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
              placeholder="เช่น ฉันอยากซ้อมสัมภาษณ์งานตำแหน่ง Marketing กับ HR ชาวต่างชาติ หรือ ซ้อมสั่งอาหารเจที่ร้านอาหารในปักกิ่ง..."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
            />
          </div>

          {/* Quick inspiration chips */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-slate-500">ไอเดียตัวอย่าง (กดเลือกได้เลย):</div>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_PROMPTS.map((sample, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => setPrompt(sample)}
                  className="text-left text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 transition-colors cursor-pointer"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty Selector */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-800">
              ระดับความยากของคู่สนทนา AI
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'easy', label: 'ระดับง่าย', sub: 'พูดช้า ศัพท์พื้นฐาน' },
                { id: 'medium', label: 'ระดับกลาง', sub: 'ความเร็วธรรมชาติ' },
                { id: 'hard', label: 'ระดับสูง', sub: 'มืออาชีพ มีโจทย์ท้าทาย' },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => setDifficulty(opt.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    difficulty === opt.id
                      ? 'bg-indigo-50/70 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-900">{opt.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={isGenerating}
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium cursor-pointer disabled:opacity-40"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isGenerating || prompt.trim().length < 4}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>กำลังออกแบบการ์ดภารกิจ...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>สร้างด่านฟรี</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
