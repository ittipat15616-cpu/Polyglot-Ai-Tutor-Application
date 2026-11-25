import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { SrsRating, WordbookEntry, WordbookLang } from '../../types/wordbook';
import {
  previewNextIntervalDays,
  reviewWordWithSrs,
} from '../../services/wordbookService';

interface SrsReviewDeckProps {
  entries: WordbookEntry[];
  lang: WordbookLang;
  isPracticeAllMode?: boolean;
  onExit: () => void;
}

const SOURCE_LABELS_TH: Record<string, string> = {
  lessons: 'คลังคำศัพท์',
  flashcards: 'แฟลชการ์ด',
  karaoke: 'คาราโอเกะ',
  reading: 'อ่านเรื่องสั้น',
  manual: 'เพิ่มเอง',
};

export const SrsReviewDeck: React.FC<SrsReviewDeckProps> = ({
  entries,
  lang,
  isPracticeAllMode = false,
  onExit,
}) => {
  const [queue, setQueue] = useState<WordbookEntry[]>(() => [...entries]);
  const [revealed, setRevealed] = useState(false);
  const [hideReadingOnFront, setHideReadingOnFront] = useState(false);
  const [autoPlayAudio, setAutoPlayAudio] = useState(true);
  const [speakingTarget, setSpeakingTarget] = useState<'word' | 'example' | null>(null);
  const [isRating, setIsRating] = useState(false);

  const [completedCount, setCompletedCount] = useState(0);
  const [rememberedFirstTry, setRememberedFirstTry] = useState(0);
  const [missedIds, setMissedIds] = useState<Record<string, boolean>>({});
  const [totalInitial] = useState(entries.length);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isChinese = lang === 'CN';
  const currentCard = queue[0] || null;

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {}
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setSpeakingTarget(null);
  }, []);

  const speakText = useCallback(
    async (text: string, target: 'word' | 'example') => {
      if (!text.trim()) return;
      stopAudio();
      setSpeakingTarget(target);
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
            audio.onended = () => setSpeakingTarget(null);
            audio.onerror = () => setSpeakingTarget(null);
            await audio.play();
            return;
          }
        }
      } catch {
        // Fall through to browser speech synthesis
      }
      try {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = isChinese ? 'zh-CN' : 'en-US';
        utter.onend = () => setSpeakingTarget(null);
        utter.onerror = () => setSpeakingTarget(null);
        window.speechSynthesis.speak(utter);
      } catch {
        setSpeakingTarget(null);
      }
    },
    [isChinese, stopAudio]
  );

  // Auto-play pronunciation when moving to a new card
  useEffect(() => {
    if (currentCard && autoPlayAudio) {
      speakText(currentCard.word, 'word');
    }
    return () => {
      stopAudio();
    };
  }, [currentCard?.id, autoPlayAudio, speakText, stopAudio]);

  const handleRate = useCallback(
    async (rating: SrsRating) => {
      if (!currentCard || isRating) return;
      setIsRating(true);
      stopAudio();

      try {
        const updated = await reviewWordWithSrs(currentCard.id, rating);
        const updatedCard = updated || currentCard;

        if (rating === 'again') {
          setMissedIds((prev) => ({ ...prev, [currentCard.id]: true }));
          // Re-insert this card 2-3 positions later in the queue so the user drills it again
          setQueue((prev) => {
            const rest = prev.slice(1);
            const insertAt = Math.min(2, rest.length);
            return [...rest.slice(0, insertAt), updatedCard, ...rest.slice(insertAt)];
          });
        } else {
          setCompletedCount((c) => c + 1);
          if (!missedIds[currentCard.id]) {
            setRememberedFirstTry((c) => c + 1);
          }
          setQueue((prev) => prev.slice(1));
        }
        setRevealed(false);
      } finally {
        setIsRating(false);
      }
    },
    [currentCard, isRating, missedIds, stopAudio]
  );

  // Keyboard shortcuts: Space to flip, 1/2/3 to rate
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!currentCard) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!revealed) setRevealed(true);
      } else if (revealed) {
        if (e.key === '1') handleRate('again');
        else if (e.key === '2') handleRate('hard');
        else if (e.key === '3') handleRate('good');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentCard, revealed, handleRate]);

  // Completed summary view
  if (!currentCard) {
    const accuracyPct =
      totalInitial > 0 ? Math.round((rememberedFirstTry / totalInitial) * 100) : 100;

    return (
      <div className="max-w-xl mx-auto py-8">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center shadow-xs space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={34} />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-extrabold text-slate-900">
              ทบทวนครบทุกคำเรียบร้อยแล้ว
            </h2>
            <p className="text-sm text-slate-600">
              ระบบ SRS จัดตารางวันทบทวนรอบถัดไปให้คำศัพท์ทั้งหมดแล้วครับ
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="text-xs font-semibold text-slate-500">ทบทวนสำเร็จ</div>
              <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1">
                {completedCount}
              </div>
              <div className="text-[11px] text-slate-400">คำ</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80">
              <div className="text-xs font-semibold text-emerald-700">จำได้ในรอบแรก</div>
              <div className="text-2xl font-extrabold text-emerald-700 tabular-nums mt-1">
                {accuracyPct}%
              </div>
              <div className="text-[11px] text-emerald-600 tabular-nums">
                {rememberedFirstTry}/{totalInitial} คำ
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80">
              <div className="text-xs font-semibold text-indigo-700">ภาษาที่ฝึก</div>
              <div className="text-2xl font-extrabold text-indigo-700 mt-1">
                {isChinese ? 'CN' : 'EN'}
              </div>
              <div className="text-[11px] text-indigo-600">
                {isChinese ? 'ภาษาจีน' : 'ภาษาอังกฤษ'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onExit}
            className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors cursor-pointer"
          >
            กลับไปที่สมุดคำศัพท์ส่วนตัว
          </button>
        </div>
      </div>
    );
  }

  const progressPct =
    totalInitial > 0 ? Math.min(100, Math.round((completedCount / totalInitial) * 100)) : 0;
  const goodIntervalDays = previewNextIntervalDays(currentCard, 'good');

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            stopAudio();
            onExit();
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
        >
          <ArrowLeft size={15} />
          <span>กลับสมุดคำศัพท์</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHideReadingOnFront((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
              hideReadingOnFront
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            title={isChinese ? 'ซ่อนพินอินก่อนเปิดเฉลยเพื่อฝึกอ่านอักษรจีน' : 'ซ่อนคำอ่านก่อนเปิดเฉลย'}
          >
            {hideReadingOnFront ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>{isChinese ? 'ซ่อนพินอิน' : 'ซ่อนคำอ่าน'}</span>
          </button>

          <button
            type="button"
            onClick={() => setAutoPlayAudio((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
              autoPlayAudio
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
            title="เปิด/ปิดเสียงอ่านอัตโนมัติเมื่อขึ้นคำใหม่"
          >
            {autoPlayAudio ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>เสียงอัตโนมัติ</span>
          </button>
        </div>
      </div>

      {/* Progress Strip */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>
            {isPracticeAllMode ? 'โหมดฝึกทบทวนเพิ่มเติม' : 'ทบทวนตามตาราง SRS วันนี้'}
          </span>
          <span className="tabular-nums">
            ผ่านแล้ว {completedCount} / {totalInitial} คำ (เหลือในคิว {queue.length})
          </span>
        </div>
        <div className="h-2 w-full bg-slate-200/80 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isChinese ? 'bg-rose-600' : 'bg-indigo-600'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Interactive Review Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Card Meta Header */}
        <div className="px-6 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-500">
          <span>
            ที่มา: {SOURCE_LABELS_TH[currentCard.source] || currentCard.source}
            {currentCard.sourceLabel ? ` · ${currentCard.sourceLabel}` : ''}
          </span>
          <span className="tabular-nums font-medium text-slate-600">
            ทบทวนแล้ว {currentCard.repetitions} ครั้ง
          </span>
        </div>

        {/* Front & Revealed Content */}
        <div className="p-6 sm:p-10 text-center space-y-6 min-h-[320px] flex flex-col justify-center">
          <div className="space-y-3">
            <div
              className={`text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight break-words ${
                isChinese ? 'font-serif' : ''
              }`}
            >
              {currentCard.word}
            </div>

            {currentCard.reading && (!hideReadingOnFront || revealed) && (
              <div
                className={`text-lg font-mono font-semibold ${
                  isChinese ? 'text-rose-600' : 'text-indigo-600'
                }`}
              >
                {currentCard.reading}
              </div>
            )}

            <div className="pt-1 flex justify-center">
              <button
                type="button"
                onClick={() => speakText(currentCard.word, 'word')}
                disabled={speakingTarget === 'word'}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                  speakingTarget === 'word'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                }`}
              >
                {speakingTarget === 'word' ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Volume2 size={15} />
                )}
                <span>ฟังเสียงคำศัพท์</span>
              </button>
            </div>
          </div>

          {!revealed ? (
            <div className="pt-4">
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-colors cursor-pointer"
              >
                ดูคำแปลและตัวอย่าง (Space)
              </button>
            </div>
          ) : (
            <div className="pt-6 border-t border-slate-100 space-y-5 text-left animate-in fade-in duration-200">
              <div className="text-center space-y-1">
                {currentCard.partOfSpeech && (
                  <div className="text-xs font-semibold text-slate-400">
                    {currentCard.partOfSpeech}
                  </div>
                )}
                <div className="text-2xl font-extrabold text-slate-900">
                  {currentCard.meaningTh}
                </div>
              </div>

              {currentCard.example && (
                <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-400">ตัวอย่างประโยค</div>
                    <p className="text-sm sm:text-base font-medium text-slate-800 leading-relaxed">
                      {currentCard.example}
                    </p>
                    {currentCard.exampleTh && (
                      <p className="text-xs sm:text-sm text-slate-500">
                        {currentCard.exampleTh}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => speakText(currentCard.example || '', 'example')}
                    disabled={speakingTarget === 'example'}
                    className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 text-indigo-600 flex items-center justify-center shrink-0 cursor-pointer"
                    title="ฟังเสียงประโยคตัวอย่าง"
                  >
                    {speakingTarget === 'example' ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Volume2 size={15} />
                    )}
                  </button>
                </div>
              )}

              {currentCard.note && (
                <div className="text-xs text-slate-600 bg-amber-50/70 border border-amber-200/70 rounded-xl px-3.5 py-2.5">
                  <span className="font-bold text-amber-800">โน้ตช่วยจำ: </span>
                  {currentCard.note}
                </div>
              )}

              {/* 3 SRS Rating Buttons */}
              <div className="pt-2 space-y-2">
                <div className="text-center text-xs font-semibold text-slate-500">
                  ประเมินความจำของคุณเพื่อคำนวณรอบทบทวนถัดไป
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    disabled={isRating}
                    onClick={() => handleRate('again')}
                    className="flex flex-col items-center justify-center py-3 px-2 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 transition-colors cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1 text-sm font-extrabold">
                      <RotateCcw size={14} />
                      <span>จำไม่ได้</span>
                    </span>
                    <span className="text-[11px] font-medium text-rose-600 mt-0.5">
                      ทวนซ้ำรอบนี้ (กด 1)
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isRating}
                    onClick={() => handleRate('hard')}
                    className="flex flex-col items-center justify-center py-3 px-2 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 transition-colors cursor-pointer"
                  >
                    <span className="text-sm font-extrabold">พอจำได้</span>
                    <span className="text-[11px] font-medium text-amber-700 mt-0.5 tabular-nums">
                      อีก 1 วัน (กด 2)
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isRating}
                    onClick={() => handleRate('good')}
                    className="flex flex-col items-center justify-center py-3 px-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white transition-colors cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1 text-sm font-extrabold">
                      <Sparkles size={14} />
                      <span>จำแม่นแล้ว</span>
                    </span>
                    <span className="text-[11px] font-medium text-emerald-100 mt-0.5 tabular-nums">
                      อีก {goodIntervalDays} วัน (กด 3)
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SrsReviewDeck;
