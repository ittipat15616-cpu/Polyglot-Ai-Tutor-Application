import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  RotateCcw,
  Sparkles,
  Star,
  Volume2,
  X,
  BookOpen,
  CloudCheck,
  Zap,
  AlertCircle,
} from 'lucide-react';
import { RoleplayMission, RoleplayReportData } from '../../data/roleplay';
import { playRoleplayPhraseAudio, stopRoleplayPhraseAudio } from './ttsHelper';

interface RoleplayReportModalProps {
  mission: RoleplayMission;
  nextMission: RoleplayMission | null;
  report: RoleplayReportData | null;
  isLoading: boolean;
  isAiUpgrading?: boolean;
  hasByok?: boolean;
  byokQuotaRemaining?: number;
  byokQuotaLimit?: number;
  aiError?: string | null;
  savedToCloud: boolean;
  onSelectFreeSummary?: () => void;
  onRequestAiReport?: () => void;
  onRetry: () => void;
  onNextMission?: (next: RoleplayMission) => void;
  onBackToLobby: () => void;
}

function formatDuration(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const RoleplayReportModal: React.FC<RoleplayReportModalProps> = ({
  mission,
  nextMission,
  report,
  isLoading,
  isAiUpgrading = false,
  hasByok = false,
  byokQuotaRemaining = 0,
  byokQuotaLimit = 100,
  aiError = null,
  savedToCloud,
  onSelectFreeSummary,
  onRequestAiReport,
  onRetry,
  onNextMission,
  onBackToLobby,
}) => {
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      stopRoleplayPhraseAudio();
    };
  }, []);

  const handleSpeak = async (key: string, text: string, lang: 'EN' | 'CN') => {
    if (playingKey === key) {
      stopRoleplayPhraseAudio();
      setPlayingKey(null);
      return;
    }
    setPlayingKey(key);
    try {
      await playRoleplayPhraseAudio(text, lang);
    } finally {
      setPlayingKey((prev) => (prev === key ? null : prev));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-5">
      <div className="w-full max-w-2xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/80">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
              {report?.usedAiAnalysis
                ? 'Mission Report Card · วิเคราะห์เจาะลึกด้วย AI'
                : 'Mission Report Card · สรุปผลแบบฟรี (0 เครดิต)'}
            </div>
            <h3 className="text-lg font-bold text-slate-900 truncate mt-0.5">
              {mission.titleTh}
            </h3>
          </div>
          {!isLoading && !isAiUpgrading && (
            <button
              type="button"
              onClick={onBackToLobby}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
              aria-label="ปิด"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        {isLoading || !report ? (
          <div className="p-10 sm:p-14 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-slate-900">
                กำลังสรุปผลภารกิจของคุณ (ฟรี 0 เครดิต)...
              </h4>
              <p className="text-sm text-slate-500">
                ระบบกำลังคำนวณคะแนนและดาวจากภารกิจทั้ง 3 ข้อที่คุณทำสำเร็จในสาย
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
            {/* Explicit 2-Button Report Mode Choice */}
            {(onSelectFreeSummary || onRequestAiReport) && (
              <div className="p-2 rounded-2xl bg-slate-100 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isAiUpgrading}
                  onClick={() => onSelectFreeSummary?.()}
                  className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer disabled:opacity-60 ${
                    !report.usedAiAnalysis
                      ? 'bg-white border-emerald-300 text-emerald-700 shadow-xs'
                      : 'bg-transparent border-transparent text-slate-600 hover:bg-white/60'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>สรุปผลแบบฟรี (0 เครดิต)</span>
                </button>
                <button
                  type="button"
                  disabled={isAiUpgrading}
                  onClick={() => onRequestAiReport?.()}
                  className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer disabled:opacity-60 ${
                    report.usedAiAnalysis
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                      : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                  }`}
                >
                  {isAiUpgrading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>กำลังวิเคราะห์ด้วย AI...</span>
                    </>
                  ) : (
                    <>
                      {hasByok ? <Sparkles className="w-4 h-4 shrink-0" /> : <Zap className="w-4 h-4 shrink-0" />}
                      <span>
                        {report.usedAiAnalysis
                          ? 'วิเคราะห์เจาะลึกด้วย AI แล้ว'
                          : hasByok && byokQuotaRemaining > 0
                          ? `ใช้ AI วิเคราะห์ลึก (BYOK ฟรี ${byokQuotaRemaining}/${byokQuotaLimit})`
                          : 'ใช้ AI วิเคราะห์ลึก (BYOK / 1 เครดิต)'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}

            {aiError && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{aiError}</span>
              </div>
            )}

            {/* Hero Score & Stars */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-col items-center sm:items-start gap-2">
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3].map((n) => (
                    <Star
                      key={n}
                      className={`w-8 h-8 transition-transform ${
                        n <= report.stars
                          ? 'fill-amber-400 text-amber-500 scale-105'
                          : 'text-slate-200'
                      }`}
                    />
                  ))}
                </div>
                <div className="text-base font-bold text-slate-900">
                  {report.stars === 3
                    ? 'ยอดเยี่ยมมาก! ผ่านภารกิจระดับ 3 ดาว'
                    : report.stars === 2
                    ? 'ทำได้ดีมาก! ผ่านภารกิจ 2 ดาว'
                    : report.stars === 1
                    ? 'ผ่านภารกิจเริ่มต้น 1 ดาวแล้ว!'
                    : 'ยังเก็บดาวรอบนี้ไม่สำเร็จ ลองใหม่อีกรอบนะ!'}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    เวลาคุย {formatDuration(report.durationSeconds)}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span>
                    ภารกิจสำเร็จ {report.completedObjectives.filter(Boolean).length}/3 ข้อ
                  </span>
                  {savedToCloud && !mission.isCustom && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                        <CloudCheck className="w-3.5 h-3.5" />
                        บันทึกสถิติแล้ว
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-center justify-center px-5 py-3 rounded-2xl bg-white border border-slate-200 shrink-0 min-w-[112px]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  คะแนนรวม
                </span>
                <div className="text-3xl font-extrabold text-indigo-600 tabular-nums mt-0.5">
                  {report.overallScore}
                  <span className="text-sm font-semibold text-slate-400">/100</span>
                </div>
              </div>
            </div>

            {/* Coach Summary */}
            <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200/70 space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700">
                <Sparkles className="w-3.5 h-3.5" />
                คำแนะนำจากโค้ช AI
              </div>
              <p className="text-sm text-slate-800 leading-relaxed">{report.summaryTh}</p>
            </div>

            {/* Objectives Verification */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                สรุปภารกิจทั้ง 3 ข้อ
              </h4>
              <div className="space-y-2">
                {report.objectivesText.map((objText, idx) => {
                  const done = report.completedObjectives[idx];
                  return (
                    <div
                      key={idx}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border text-sm ${
                        done
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                          : 'bg-slate-50/70 border-slate-200 text-slate-600'
                      }`}
                    >
                      {done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                      )}
                      <span>
                        {idx + 1}. {objText}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4 Metrics Breakdown */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                คะแนนทักษะ 4 ด้าน
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { key: 'fluency', label: 'ความคล่องแคล่ว (Fluency)', val: report.metrics.fluency },
                  { key: 'grammar', label: 'ไวยากรณ์ (Grammar)', val: report.metrics.grammar },
                  { key: 'vocabulary', label: 'การใช้คำศัพท์ (Vocabulary)', val: report.metrics.vocabulary },
                  { key: 'naturalness', label: 'ความเป็นธรรมชาติ (Naturalness)', val: report.metrics.naturalness },
                ] as const).map((m) => (
                  <div
                    key={m.key}
                    className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">{m.label}</span>
                      <span className="font-bold text-slate-900 tabular-nums">{m.val}/100</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          m.val >= 80
                            ? 'bg-emerald-500'
                            : m.val >= 60
                            ? 'bg-indigo-500'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.max(4, m.val)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Better Way to Say It */}
            {report.improvements && report.improvements.length > 0 && (
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  พูดแบบนี้จะโปรขึ้น! (Better Way to Say It)
                </h4>
                <div className="space-y-3">
                  {report.improvements.map((item, idx) => {
                    const playId = `imp_${idx}`;
                    const isPlaying = playingKey === playId;
                    return (
                      <div
                        key={idx}
                        className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 space-y-2"
                      >
                        <div className="text-xs text-slate-500">
                          <span className="font-semibold text-slate-600">ที่คุณพูด: </span>
                          <span className="italic">"{item.said}"</span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-0.5">
                            <div className="text-sm font-bold text-indigo-700 leading-snug">
                              {item.better}
                            </div>
                            {report.lang === 'CN' && item.pinyin && (
                              <div className="text-xs text-indigo-500 font-medium">
                                {item.pinyin}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSpeak(playId, item.better, report.lang)}
                            className={`p-2 rounded-lg border shrink-0 transition-colors cursor-pointer ${
                              isPlaying
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:text-indigo-600 hover:border-indigo-300'
                            }`}
                            title="ฟังเสียงอ่าน"
                          >
                            {isPlaying ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Volume2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed pt-1 border-t border-slate-200/70">
                          {item.explanationTh}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Key Vocab */}
            {report.keyVocab && report.keyVocab.length > 0 && (
              <div className="space-y-2.5">
                <h4 className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <BookOpen className="w-3.5 h-3.5" />
                  คำศัพท์และประโยคน่าจำจากรอบนี้
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {report.keyVocab.map((v, idx) => {
                    const playId = `voc_${idx}`;
                    const isPlaying = playingKey === playId;
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2.5 p-3 rounded-xl bg-white border border-slate-200"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 leading-snug">
                            {v.word}
                          </div>
                          {report.lang === 'CN' && v.pinyin && (
                            <div className="text-xs text-indigo-600">{v.pinyin}</div>
                          )}
                          <div className="text-xs text-slate-500 mt-0.5">{v.meaningTh}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSpeak(playId, v.word, report.lang)}
                          className={`p-1.5 rounded-lg border shrink-0 transition-colors cursor-pointer ${
                            isPlaying
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:text-indigo-600'
                          }`}
                          title="ฟังเสียง"
                        >
                          {isPlaying ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        {!isLoading && (
          <div className="px-5 sm:px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={onBackToLobby}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
            >
              กลับหน้ารวมภารกิจ
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>เล่นด่านนี้ซ้ำ</span>
              </button>

              {nextMission && onNextMission && (
                <button
                  type="button"
                  onClick={() => onNextMission(nextMission)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>ไปด่านถัดไป</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
