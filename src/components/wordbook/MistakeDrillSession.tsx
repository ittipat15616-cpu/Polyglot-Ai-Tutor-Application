import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Sparkles,
  Volume2,
  XCircle,
} from 'lucide-react';
import { MistakeEntry } from '../../types/mistakes';
import { WordbookLang } from '../../types/wordbook';
import {
  MASTERY_STREAK_TARGET,
  recordMistakeDrillAttempt,
} from '../../services/mistakeService';
import { allCNVocab, allENVocab } from '../../data/vocabData';
import SaveToWordbookButton from './SaveToWordbookButton';

interface MistakeDrillSessionProps {
  items: MistakeEntry[];
  lang: WordbookLang;
  onExit: () => void;
  onAskAI?: (prompt: string) => void;
}

function normalizeAnswer(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:'"()（）？。，！\s]+/g, '');
}

/**
 * Deterministic shuffle seeded by item id so choices stay stable while viewing a card.
 */
function seededShuffle<T>(arr: T[], seedStr: string): T[] {
  const copy = [...arr];
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  for (let i = copy.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildDrillOptions(item: MistakeEntry, lang: WordbookLang): string[] | null {
  // 1. Use authentic options when the original exam had multiple-choice options
  if (item.options && item.options.length >= 2) {
    return item.options;
  }

  // 2. For vocab_exam mistakes, generate 3 clean local distractors (0 Baht) from the app's vocab bank
  if (item.source === 'vocab_exam') {
    const bank = lang === 'CN' ? allCNVocab : allENVocab;
    const isTargetWord =
      item.vocabWord &&
      normalizeAnswer(item.correctAnswer) === normalizeAnswer(item.vocabWord);
    const correctClean = item.correctAnswer.trim();
    const correctNorm = normalizeAnswer(correctClean);

    const distractors: string[] = [];
    const seen = new Set<string>([correctNorm]);

    // Deterministic start offset into bank
    let offset = 0;
    for (let i = 0; i < item.id.length; i++) offset = (offset * 17 + item.id.charCodeAt(i)) % Math.max(1, bank.length);

    for (let step = 0; step < bank.length && distractors.length < 3; step++) {
      const candidate = bank[(offset + step * 7) % bank.length];
      const text = isTargetWord
        ? candidate.word
        : candidate.translations?.[0] || '';
      const norm = normalizeAnswer(text);
      if (text && norm && !seen.has(norm)) {
        seen.add(norm);
        distractors.push(text);
      }
    }

    if (distractors.length === 3) {
      return seededShuffle([correctClean, ...distractors], item.id);
    }
  }

  return null;
}

export const MistakeDrillSession: React.FC<MistakeDrillSessionProps> = ({
  items,
  lang,
  onExit,
  onAskAI,
}) => {
  const isChinese = lang === 'CN';
  const [currentIdx, setCurrentIdx] = useState(0);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [attemptResult, setAttemptResult] = useState<{
    isCorrect: boolean;
    updatedEntry: MistakeEntry;
  } | null>(null);

  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionGraduated, setSessionGraduated] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentItem = items[currentIdx];

  const choiceOptions = useMemo(
    () => (currentItem ? buildDrillOptions(currentItem, lang) : null),
    [currentItem, lang]
  );

  const speakText = async (text: string) => {
    if (!text.trim()) return;
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {}
    }
    setIsSpeaking(true);
    try {
      const voice = isChinese ? 'zh-CN-XiaoxiaoNeural' : 'en-US-JennyNeural';
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang: isChinese ? 'CN' : 'EN', voice }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.audio) {
          const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
          audioRef.current = audio;
          audio.onended = () => setIsSpeaking(false);
          audio.onerror = () => setIsSpeaking(false);
          await audio.play();
          return;
        }
      }
    } catch {}
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = isChinese ? 'zh-CN' : 'en-US';
      utter.onend = () => setIsSpeaking(false);
      utter.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utter);
    } catch {
      setIsSpeaking(false);
    }
  };

  const finalizeAttempt = async (isCorrect: boolean) => {
    if (!currentItem || attemptResult) return;
    const updated =
      (await recordMistakeDrillAttempt(currentItem.id, isCorrect)) || currentItem;

    setAttemptResult({ isCorrect, updatedEntry: updated });
    setRevealed(true);
    if (isCorrect) {
      setSessionCorrect((c) => c + 1);
      if (updated.status === 'mastered' && currentItem.status !== 'mastered') {
        setSessionGraduated((g) => g + 1);
      }
    }
  };

  const handleSelectOption = async (opt: string, optIdx: number) => {
    if (attemptResult || !currentItem) return;
    setSelectedChoice(opt);

    const isCorrect =
      currentItem.correctOptionIndex !== undefined && currentItem.options
        ? optIdx === currentItem.correctOptionIndex
        : normalizeAnswer(opt) === normalizeAnswer(currentItem.correctAnswer);

    await finalizeAttempt(isCorrect);
  };

  const handleSubmitTyped = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentItem || attemptResult || !typedAnswer.trim()) return;

    const userNorm = normalizeAnswer(typedAnswer);
    const validTargets = [
      currentItem.correctAnswer,
      ...(currentItem.acceptedAnswers || []),
    ].map(normalizeAnswer);

    const isCorrect = validTargets.some((t) => t && t === userNorm);
    await finalizeAttempt(isCorrect);
  };

  const handleNext = () => {
    if (currentIdx + 1 >= items.length) {
      setIsDone(true);
      return;
    }
    setCurrentIdx((i) => i + 1);
    setTypedAnswer('');
    setSelectedChoice(null);
    setRevealed(false);
    setAttemptResult(null);
  };

  if (isDone || !currentItem) {
    const pct = items.length > 0 ? Math.round((sessionCorrect / items.length) * 100) : 100;
    return (
      <div className="max-w-xl mx-auto py-8">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center shadow-xs space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={34} />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-extrabold text-slate-900">
              จบชุดติวซ่อมจุดอ่อนเรียบร้อย
            </h2>
            <p className="text-sm text-slate-600">
              ข้อที่ตอบถูกติดกันครบ {MASTERY_STREAK_TARGET} รอบถูกย้ายสถานะเป็น “ซ่อมผ่านแล้ว” อัตโนมัติครับ
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="text-xs font-semibold text-slate-500">ฝึกทั้งหมด</div>
              <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1">
                {items.length}
              </div>
              <div className="text-[11px] text-slate-400">ข้อ</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80">
              <div className="text-xs font-semibold text-indigo-700">ตอบถูกรอบนี้</div>
              <div className="text-2xl font-extrabold text-indigo-700 tabular-nums mt-1">
                {pct}%
              </div>
              <div className="text-[11px] text-indigo-600 tabular-nums">
                {sessionCorrect}/{items.length} ข้อ
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80">
              <div className="text-xs font-semibold text-emerald-700">ซ่อมผ่านใหม่</div>
              <div className="text-2xl font-extrabold text-emerald-700 tabular-nums mt-1">
                {sessionGraduated}
              </div>
              <div className="text-[11px] text-emerald-600">ข้อ (2/2 รอบ)</div>
            </div>
          </div>

          <button
            type="button"
            onClick={onExit}
            className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors cursor-pointer"
          >
            กลับไปที่สมุดซ่อมจุดอ่อน
          </button>
        </div>
      </div>
    );
  }

  const progressPct = Math.round(((currentIdx + (attemptResult ? 1 : 0)) / items.length) * 100);
  const currentStreak = attemptResult
    ? attemptResult.updatedEntry.consecutiveCorrect
    : currentItem.consecutiveCorrect;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold cursor-pointer"
        >
          <ArrowLeft size={15} />
          <span>กลับสมุดซ่อมจุดอ่อน</span>
        </button>

        <div className="text-xs font-bold text-slate-600 tabular-nums">
          ข้อที่ {currentIdx + 1} / {items.length}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 w-full bg-slate-200/80 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isChinese ? 'bg-rose-600' : 'bg-indigo-600'
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Drill Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-3.5 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>ที่มา: {currentItem.sourceLabel}</span>
          <span className="font-bold text-slate-700 tabular-nums">
            ความคืบหน้าปลดล็อก: {Math.min(MASTERY_STREAK_TARGET, currentStreak)}/{MASTERY_STREAK_TARGET} รอบติด
          </span>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* Prompt */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-snug">
                {currentItem.prompt}
              </h3>
              {currentItem.vocabWord && (
                <button
                  type="button"
                  onClick={() => speakText(currentItem.vocabWord || '')}
                  disabled={isSpeaking}
                  className="w-9 h-9 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 cursor-pointer"
                  title="ฟังเสียงคำศัพท์"
                >
                  {isSpeaking ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Volume2 size={15} />
                  )}
                </button>
              )}
            </div>

            {currentItem.reading && (
              <div
                className={`text-sm font-mono font-semibold ${
                  isChinese ? 'text-rose-600' : 'text-indigo-600'
                }`}
              >
                {currentItem.reading}
              </div>
            )}

            <div className="text-xs text-slate-500">
              ครั้งก่อนคุณเคยตอบ:{' '}
              <span className="font-semibold text-rose-600 line-through">
                {currentItem.userWrongAnswer}
              </span>{' '}
              · พลาดสะสม {currentItem.wrongCount} ครั้ง
            </div>
          </div>

          {/* Interactive Answer Area */}
          {choiceOptions ? (
            <div className="grid grid-cols-1 gap-2.5">
              {choiceOptions.map((opt, idx) => {
                const isCorrectOpt =
                  currentItem.correctOptionIndex !== undefined && currentItem.options
                    ? idx === currentItem.correctOptionIndex
                    : normalizeAnswer(opt) === normalizeAnswer(currentItem.correctAnswer);
                const isSelected = selectedChoice === opt;

                let cls =
                  'w-full text-left px-4 py-3.5 rounded-2xl border text-sm font-bold transition-colors flex items-center justify-between gap-3 ';
                if (!attemptResult) {
                  cls +=
                    'bg-white border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 text-slate-800 cursor-pointer';
                } else if (isCorrectOpt) {
                  cls += 'bg-emerald-50 border-emerald-400 text-emerald-900';
                } else if (isSelected && !isCorrectOpt) {
                  cls += 'bg-rose-50 border-rose-400 text-rose-900';
                } else {
                  cls += 'bg-slate-50 border-slate-200 text-slate-400';
                }

                return (
                  <button
                    key={`${opt}_${idx}`}
                    type="button"
                    disabled={Boolean(attemptResult)}
                    onClick={() => handleSelectOption(opt, idx)}
                    className={cls}
                  >
                    <span>{opt}</span>
                    {attemptResult && isCorrectOpt && (
                      <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                    )}
                    {attemptResult && isSelected && !isCorrectOpt && (
                      <XCircle size={18} className="text-rose-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {!attemptResult && (
                <form onSubmit={handleSubmitTyped} className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    placeholder="พิมพ์คำตอบที่ถูกต้อง..."
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:border-indigo-400"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!typedAnswer.trim()}
                    className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    ตรวจคำตอบ
                  </button>
                </form>
              )}

              {!revealed && !attemptResult && (
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={() => setRevealed(true)}
                    className="text-xs font-bold text-slate-500 hover:text-indigo-600 underline cursor-pointer"
                  >
                    หรือกดเปิดดูเฉลยแล้วประเมินตัวเอง
                  </button>
                </div>
              )}

              {revealed && !attemptResult && (
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-500">เฉลยที่ถูกต้อง</div>
                    <div className="text-lg font-extrabold text-emerald-700 mt-0.5">
                      {currentItem.correctAnswer}
                    </div>
                  </div>
                  {currentItem.explanationTh && (
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {currentItem.explanationTh}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => finalizeAttempt(false)}
                      className="py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw size={14} />
                      <span>ยังจำไม่ได้ / พลาด</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => finalizeAttempt(true)}
                      className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 size={14} />
                      <span>ตอบถูก / เข้าใจแล้ว</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Post-Attempt Feedback Banner */}
          {attemptResult && (
            <div
              className={`rounded-2xl border p-4 space-y-3 animate-in fade-in duration-200 ${
                attemptResult.isCorrect
                  ? 'bg-emerald-50/80 border-emerald-200'
                  : 'bg-rose-50/80 border-rose-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {attemptResult.isCorrect ? (
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle size={18} className="text-rose-600 shrink-0" />
                  )}
                  <span
                    className={`text-sm font-extrabold ${
                      attemptResult.isCorrect ? 'text-emerald-900' : 'text-rose-900'
                    }`}
                  >
                    {attemptResult.isCorrect
                      ? attemptResult.updatedEntry.status === 'mastered'
                        ? 'ยอดเยี่ยม! ตอบถูกครบ 2 รอบติด — ซ่อมจุดอ่อนข้อนี้ผ่านแล้ว'
                        : 'ถูกต้อง! (ถูกติดกัน 1/2 รอบ — ตอบถูกอีกครั้งจะซ่อมผ่านทันที)'
                      : `ยังไม่ถูก — เฉลยคือ "${currentItem.correctAnswer}" (รีเซ็ตเป็น 0/2 รอบ)`}
                  </span>
                </div>
              </div>

              {currentItem.explanationTh && (
                <p className="text-xs text-slate-700 leading-relaxed">
                  {currentItem.explanationTh}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
                <div className="flex items-center gap-2 flex-wrap">
                  {currentItem.vocabWord && (
                    <SaveToWordbookButton
                      word={currentItem.vocabWord}
                      lang={lang}
                      meaningTh={currentItem.vocabMeaningTh || currentItem.correctAnswer}
                      reading={currentItem.reading}
                      example={currentItem.vocabExample}
                      source="lessons"
                      sourceLabel={currentItem.sourceLabel}
                      size="xs"
                      compactLabel
                    />
                  )}
                  {onAskAI && (
                    <button
                      type="button"
                      onClick={() =>
                        onAskAI(
                          `ช่วยอธิบายข้อที่ฉันเคยทำผิดข้อนี้ให้เข้าใจง่ายๆ หน่อยครับ: "${currentItem.prompt}" ฉันตอบว่า "${currentItem.userWrongAnswer}" แต่เฉลยคือ "${currentItem.correctAnswer}"`
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 text-xs font-bold text-indigo-700 cursor-pointer"
                    >
                      <Bot size={13} />
                      <span>ถาม AI อธิบาย</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer"
                >
                  <span>{currentIdx + 1 >= items.length ? 'ดูสรุปผล' : 'ข้อถัดไป'}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tip Footer */}
      <div className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
        <Sparkles size={12} />
        <span>กฎปลดล็อกจุดอ่อน: ตอบถูกติดต่อกัน 2 รอบเพื่อย้ายเป็นสถานะ “ซ่อมผ่านแล้ว”</span>
      </div>
    </div>
  );
};

export default MistakeDrillSession;
