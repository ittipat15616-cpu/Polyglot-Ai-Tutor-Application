import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  MapPin,
  Phone,
  Sparkles,
  Volume2,
  X,
  AlertTriangle,
  HelpCircle,
  Loader2,
  Star,
} from 'lucide-react';
import {
  DIFFICULTY_META,
  RoleplayCorrectionStyle,
  RoleplayMission,
  RoleplayProgressRecord,
} from '../../data/roleplay';
import { playRoleplayPhraseAudio, stopRoleplayPhraseAudio } from './ttsHelper';

interface RoleplayBriefingModalProps {
  mission: RoleplayMission;
  activeLang: 'EN' | 'CN';
  mode: 'briefing' | 'reference';
  completedObjectives?: [boolean, boolean, boolean];
  existingProgress?: RoleplayProgressRecord;
  initialAssistMode?: boolean;
  initialCorrectionStyle?: RoleplayCorrectionStyle;
  onStartMission?: (options: {
    assistMode: boolean;
    correctionStyle: RoleplayCorrectionStyle;
  }) => void;
  onClose: () => void;
}

export const RoleplayBriefingModal: React.FC<RoleplayBriefingModalProps> = ({
  mission,
  activeLang,
  mode,
  completedObjectives = [false, false, false],
  existingProgress,
  initialAssistMode = true,
  initialCorrectionStyle = 'after_call',
  onStartMission,
  onClose,
}) => {
  const [assistMode, setAssistMode] = useState<boolean>(initialAssistMode);
  const [correctionStyle, setCorrectionStyle] = useState<RoleplayCorrectionStyle>(initialCorrectionStyle);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      stopRoleplayPhraseAudio();
    };
  }, []);

  const diffMeta = DIFFICULTY_META[mission.difficulty];
  const levelCode = activeLang === 'CN' ? diffMeta.hskCn : diffMeta.cefrEn;

  const handlePlayPhrase = async (idx: number, text: string) => {
    if (playingIdx === idx) {
      stopRoleplayPhraseAudio();
      setPlayingIdx(null);
      return;
    }
    setPlayingIdx(idx);
    try {
      await playRoleplayPhraseAudio(text, activeLang);
    } finally {
      setPlayingIdx((prev) => (prev === idx ? null : prev));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4 bg-slate-50/70">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold">
              <span className="text-indigo-600 uppercase tracking-wide">
                {mode === 'reference' ? 'การ์ดภารกิจระหว่างคุย' : mission.isCustom ? 'ด่านจำลองพิเศษ' : `Mission #${String(mission.number).padStart(2, '0')}`}
              </span>
              <span className="text-slate-300">·</span>
              <span className={diffMeta.colorClass}>
                {diffMeta.labelTh} ({levelCode})
              </span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                <MapPin className="w-3 h-3" />
                {mission.location}
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 mt-1 leading-snug">
              {mission.titleTh}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{mission.titleEn}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors shrink-0 cursor-pointer"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          {/* Existing Best Record Banner (if previously played in briefing mode) */}
          {mode === 'briefing' && existingProgress && existingProgress.playCount > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-amber-50/70 border border-amber-200/70 text-xs sm:text-sm">
              <div className="flex items-center gap-2 text-amber-900 font-medium">
                <span>สถิติสูงสุดของคุณ:</span>
                <span className="inline-flex items-center gap-0.5">
                  {[1, 2, 3].map((n) => (
                    <Star
                      key={n}
                      className={`w-4 h-4 ${
                        n <= existingProgress.stars
                          ? 'fill-amber-400 text-amber-500'
                          : 'text-amber-200'
                      }`}
                    />
                  ))}
                </span>
              </div>
              <span className="text-amber-800 font-semibold tabular-nums">
                คะแนนสูงสุด {existingProgress.bestScore}/100 · เล่นแล้ว {existingProgress.playCount} ครั้ง
              </span>
            </div>
          )}

          {/* Roles Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                บทบาทของคุณ (Your Role)
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-1">
                {mission.userRoleTh}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200/70">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-500">
                คู่สนทนา AI (AI Character)
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-1">
                {mission.aiRoleName} — {mission.aiRoleTitleTh}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{mission.aiRoleTitleEn}</div>
            </div>
          </div>

          {/* Scenario */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              สถานการณ์จำลอง
            </h4>
            <p className="text-sm text-slate-800 leading-relaxed bg-slate-50/60 border border-slate-200/70 rounded-xl p-3.5">
              {mission.scenarioTh}
            </p>
            {mission.twistTh && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 text-xs sm:text-sm text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">จุดหักมุมที่อาจเจอระหว่างคุย: </span>
                  <span>{mission.twistTh}</span>
                </div>
              </div>
            )}
          </div>

          {/* 3 Mission Objectives */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                ภารกิจที่ต้องทำให้สำเร็จ (3 ข้อ)
              </h4>
              {mode === 'reference' && (
                <span className="text-xs font-semibold text-emerald-700 tabular-nums">
                  สำเร็จแล้ว {completedObjectives.filter(Boolean).length}/3 ข้อ
                </span>
              )}
            </div>
            <div className="space-y-2">
              {mission.objectives.map((obj, idx) => {
                const isDone = mode === 'reference' && completedObjectives[idx];
                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-sm transition-colors ${
                      isDone
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                        : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <span className={`font-medium ${isDone ? 'line-through decoration-emerald-500/60' : ''}`}>
                        {idx + 1}. {obj}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Survival Kit with Audio Preview */}
          {mission.survivalKit && mission.survivalKit.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  ประโยคตัวช่วยเอาตัวรอด (กดฟังเสียงซ้อมก่อนได้)
                </h4>
                <span className="text-[11px] text-slate-400">
                  {activeLang === 'CN' ? 'ภาษาจีนกลาง + พินอิน' : 'ภาษาอังกฤษ'}
                </span>
              </div>
              <div className="space-y-2">
                {mission.survivalKit.map((phrase, idx) => {
                  const targetText = activeLang === 'CN' ? phrase.cn : phrase.en;
                  const isPlaying = playingIdx === idx;
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 hover:border-indigo-200 transition-colors"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-sm font-semibold text-slate-900 leading-snug">
                          {targetText}
                        </div>
                        {activeLang === 'CN' && phrase.pinyin && (
                          <div className="text-xs text-indigo-600 font-medium">
                            {phrase.pinyin}
                          </div>
                        )}
                        <div className="text-xs text-slate-500">{phrase.th}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePlayPhrase(idx, targetText)}
                        className={`p-2 rounded-lg border transition-colors shrink-0 cursor-pointer ${
                          isPlaying
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:text-indigo-600 hover:border-indigo-300'
                        }`}
                        title="ฟังเสียงอ่าน"
                        aria-label="ฟังเสียงอ่านประโยคตัวช่วย"
                      >
                        {isPlaying ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pre-call Options (Briefing mode only) */}
          {mode === 'briefing' && (
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                ตั้งค่าก่อนเริ่มสาย
              </h4>

              {/* Assist Mode Toggle */}
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-start gap-2.5 min-w-0">
                  <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      เปิดปุ่ม "ขอตัวช่วย (ใบ้ประโยค)" ระหว่างคุย
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      ถ้านึกไม่ออก กดปุ่มขอตัวช่วยเพื่อให้ AI ขึ้นประโยคตัวอย่างบนกระดานให้ทันที
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={assistMode}
                  onClick={() => setAssistMode((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${
                    assistMode ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
                      assistMode ? 'translate-x-5.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Correction Style Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setCorrectionStyle('after_call')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    correctionStyle === 'after_call'
                      ? 'bg-indigo-50/70 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-900">
                    สรุปและแก้ให้หลังจบสาย
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    คุยไหลลื่นเหมือนเหตุการณ์จริง ไม่ขัดจังหวะ (แนะนำ)
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setCorrectionStyle('realtime')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    correctionStyle === 'realtime'
                      ? 'bg-indigo-50/70 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-900">
                    ขึ้นกระดานแนะนำระหว่างคุย
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    AI ยังคุยในบทบาท แต่จะขึ้นคำแนะนำบนกระดานให้เงียบๆ
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
          {mode === 'briefing' ? (
            <>
              <span className="text-xs text-slate-500 hidden sm:inline">
                อ่านได้ไม่จำกัดเวลา พร้อมเมื่อไหร่กดเริ่มได้เลย
              </span>
              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
                >
                  ปิด
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopRoleplayPhraseAudio();
                    onStartMission?.({ assistMode, correctionStyle });
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Phone className="w-4 h-4" />
                  <span>เริ่มภารกิจ (กดโทรออก)</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between w-full gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                สายยังเชื่อมต่ออยู่ปกติ สามารถปิดการ์ดนี้เพื่อคุยต่อได้ทันที
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-colors whitespace-nowrap cursor-pointer"
              >
                กลับไปคุยต่อ
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
