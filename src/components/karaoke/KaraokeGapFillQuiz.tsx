import React, { useMemo, useState } from 'react';
import { KaraokeLanguage, KaraokeLine } from '../../types/karaoke';
import { Volume2, CheckCircle2, XCircle, RotateCcw, Trophy, Play } from 'lucide-react';

interface KaraokeGapFillQuizProps {
  lines: KaraokeLine[];
  language: KaraokeLanguage;
  onSeekToLine: (timeSec: number) => void;
  onQuizComplete?: (score: number, total: number) => void;
}

interface QuizQuestion {
  id: number;
  line: KaraokeLine;
  targetWord: string;
  maskedLine: string;
  options: string[];
}

function buildGapFillQuestions(lines: KaraokeLine[], language: KaraokeLanguage): QuizQuestion[] {
  const isChinese = language === 'zh';
  const candidatePool: Array<{ line: KaraokeLine; word: string }> = [];
  const usedWords = new Set<string>();

  for (const line of lines) {
    if (!line.text || line.text.trim().length < 6) continue;
    if (isChinese) {
      const hanMatches: string[] = Array.from(line.text.match(/[\u4E00-\u9FFF]{2,3}/g) ?? []);
      const pick = hanMatches.find((w) => w.length === 2 && !usedWords.has(w)) || hanMatches[0];
      if (pick && !usedWords.has(pick)) {
        usedWords.add(pick);
        candidatePool.push({ line, word: pick });
      }
    } else {
      const words: string[] = Array.from(line.text.match(/[A-Za-z]{4,}/g) ?? []);
      const stopWords = new Set([
        'that', 'this', 'with', 'from', 'have', 'they', 'them', 'when', 'what', 'your',
        'will', 'just', 'been', 'were', 'there', 'their', 'about', 'into', 'like', 'know',
      ]);
      const pick = words.find((w) => !stopWords.has(w.toLowerCase()) && !usedWords.has(w.toLowerCase()));
      if (pick) {
        usedWords.add(pick.toLowerCase());
        candidatePool.push({ line, word: pick });
      }
    }
  }

  // Evenly pick up to 8 questions across the song
  const maxQ = Math.min(8, candidatePool.length);
  if (maxQ === 0) return [];

  const step = Math.max(1, Math.floor(candidatePool.length / maxQ));
  const picked: Array<{ line: KaraokeLine; word: string }> = [];
  for (let i = 0; i < candidatePool.length && picked.length < maxQ; i += step) {
    picked.push(candidatePool[i]);
  }

  const allDistractors = candidatePool.map((c) => c.word);
  const fallbackDistractors = isChinese
    ? ['梦想', '幸福', '回忆', '未来', '温柔', '勇敢', '时间', '世界']
    : ['forever', 'tonight', 'memory', 'believe', 'heart', 'shadow', 'moment', 'dream'];

  return picked.map((item, idx) => {
    const distractors = [
      ...allDistractors.filter((w) => w.toLowerCase() !== item.word.toLowerCase()),
      ...fallbackDistractors,
    ]
      .filter((w, i, arr) => arr.indexOf(w) === i && w.toLowerCase() !== item.word.toLowerCase())
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const options = [item.word, ...distractors].sort(() => Math.random() - 0.5);
    const maskedLine = item.line.text.replace(item.word, '______');

    return {
      id: idx,
      line: item.line,
      targetWord: item.word,
      maskedLine,
      options,
    };
  });
}

export const KaraokeGapFillQuiz: React.FC<KaraokeGapFillQuizProps> = ({
  lines,
  language,
  onSeekToLine,
  onQuizComplete,
}) => {
  const [seed, setSeed] = useState(0);
  const questions = useMemo(() => buildGapFillQuestions(lines, language), [lines, language, seed]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleSelect = (qId: number, choice: string) => {
    if (submitted) return;
    setSelectedAnswers((prev) => ({ ...prev, [qId]: choice }));
  };

  const handleCheckAnswers = () => {
    setSubmitted(true);
    const score = questions.reduce(
      (acc, q) => acc + (selectedAnswers[q.id]?.toLowerCase() === q.targetWord.toLowerCase() ? 1 : 0),
      0
    );
    onQuizComplete?.(score, questions.length);
  };

  const handleReset = () => {
    setSelectedAnswers({});
    setSubmitted(false);
    setSeed((s) => s + 1);
  };

  if (questions.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        เนื้อเพลงนี้สั้นเกินไปสำหรับการสร้างแบบฝึกหัดเติมคำ
      </div>
    );
  }

  const answeredCount = Object.keys(selectedAnswers).length;
  const correctCount = questions.reduce(
    (acc, q) => acc + (selectedAnswers[q.id]?.toLowerCase() === q.targetWord.toLowerCase() ? 1 : 0),
    0
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header strip */}
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2 shrink-0">
        <div>
          <h4 className="text-sm font-bold text-slate-900">เกมฟังเพลงเติมคำที่หายไป (ฟรี 100%)</h4>
          <p className="text-[11px] text-slate-500">กดปุ่มฟังท่อนนั้นบน YouTube แล้วเลือกคำที่ได้ยินให้ถูกต้อง</p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 transition-colors"
        >
          <RotateCcw size={13} />
          <span>สุ่มชุดใหม่</span>
        </button>
      </div>

      {/* Score summary banner after submit */}
      {submitted && (
        <div className="mx-5 mt-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Trophy size={20} />
            </div>
            <div>
              <div className="text-sm font-extrabold text-emerald-900">
                คุณตอบถูก {correctCount} / {questions.length} ข้อ ({Math.round((correctCount / questions.length) * 100)}%)
              </div>
              <div className="text-xs text-emerald-700">
                {correctCount === questions.length
                  ? 'สุดยอดมาก! หูฟังแม่นระดับเจ้าของภาษาเลยครับ'
                  : 'ลองกดฟังท่อนที่ผิดซ้ำอีกครั้ง จะช่วยให้จำคำศัพท์ได้แม่นขึ้นมากครับ'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Questions List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {questions.map((q, idx) => {
          const picked = selectedAnswers[q.id];
          const isCorrect = picked?.toLowerCase() === q.targetWord.toLowerCase();

          return (
            <div
              key={q.id}
              className={`rounded-2xl border p-4 transition-all ${
                submitted
                  ? isCorrect
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : 'bg-rose-50/50 border-rose-200'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-indigo-600">ข้อที่ {idx + 1}</span>
                    {submitted &&
                      (isCorrect ? (
                        <CheckCircle2 size={15} className="text-emerald-600" />
                      ) : (
                        <XCircle size={15} className="text-rose-500" />
                      ))}
                  </div>
                  <p className="text-base font-bold text-slate-900 leading-relaxed">
                    {submitted ? q.line.text : q.maskedLine}
                  </p>
                  {q.line.thaiTranslation && (
                    <p className="text-xs text-slate-500">คำแปล: {q.line.thaiTranslation}</p>
                  )}
                </div>

                {q.line.timeSec >= 0 && (
                  <button
                    type="button"
                    onClick={() => onSeekToLine(Math.max(0, q.line.timeSec - 0.5))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 shrink-0 transition-colors"
                  >
                    <Play size={12} fill="currentColor" />
                    <span>ฟังท่อนนี้</span>
                  </button>
                )}
              </div>

              {/* Word Bank Options */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                {q.options.map((opt) => {
                  const isPicked = picked === opt;
                  const isAnswer = opt.toLowerCase() === q.targetWord.toLowerCase();

                  let btnStyle = 'bg-slate-50 hover:bg-indigo-50 border-slate-200 text-slate-700';
                  if (submitted) {
                    if (isAnswer) {
                      btnStyle = 'bg-emerald-600 border-emerald-600 text-white font-bold';
                    } else if (isPicked && !isAnswer) {
                      btnStyle = 'bg-rose-100 border-rose-300 text-rose-800 line-through';
                    } else {
                      btnStyle = 'bg-slate-50 border-slate-100 text-slate-400';
                    }
                  } else if (isPicked) {
                    btnStyle = 'bg-indigo-600 border-indigo-600 text-white font-bold shadow-2xs';
                  }

                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={submitted}
                      onClick={() => handleSelect(q.id, opt)}
                      className={`px-3 py-2 rounded-xl border text-sm font-medium text-left transition-all ${btnStyle}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Submit Bar */}
      {!submitted && (
        <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Volume2 size={14} className="text-indigo-500" />
            <span>ตอบแล้ว {answeredCount} / {questions.length} ข้อ</span>
          </div>
          <button
            type="button"
            disabled={answeredCount === 0}
            onClick={handleCheckAnswers}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm transition-all shadow-xs"
          >
            ตรวจคำตอบเลย
          </button>
        </div>
      )}
    </div>
  );
};

export default KaraokeGapFillQuiz;
