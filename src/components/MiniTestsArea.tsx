import React, { useState, useMemo } from 'react';
import { HelpCircle, Sparkles, CheckCircle2, XCircle, Trophy, RefreshCw, Sliders, ArrowRight, Play, Award } from 'lucide-react';
import { allCNVocab, allENVocab, VocabWord } from '../data/vocabData';

interface MiniTestsAreaProps {
  activeLang: 'EN' | 'CN' | 'TH';
}

interface Question {
  id: string;
  wordObj: VocabWord;
  options: string[];
  correctAnswer: string;
}

export default function MiniTestsArea({ activeLang }: MiniTestsAreaProps) {
  const [testState, setTestState] = useState<'SETUP' | 'TESTING' | 'RESULT'>('SETUP');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [questionCount, setQuestionCount] = useState<number>(10);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [showAnswer, setShowAnswer] = useState(false);

  // Filter vocabulary pool
  const vocabPool = useMemo(() => {
    const rawList = activeLang === 'CN' ? allCNVocab : allENVocab;
    if (selectedLevel === 'ALL') return rawList;
    return rawList.filter((w) => w.level.toUpperCase() === selectedLevel.toUpperCase());
  }, [activeLang, selectedLevel]);

  const levelOptions = activeLang === 'CN'
    ? ['ALL', 'HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'HSK7-9']
    : ['ALL', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  const startTest = () => {
    if (vocabPool.length === 0) return;

    const shuffled = [...vocabPool].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, Math.min(questionCount, vocabPool.length));

    const qList: Question[] = chosen.map((item, idx) => {
      const correct = item.translations[0] || item.word;
      const otherTrans = vocabPool
        .filter((w) => w.id !== item.id)
        .map((w) => w.translations[0])
        .filter(Boolean);

      const shuffledOther = otherTrans.sort(() => Math.random() - 0.5).slice(0, 3);
      const opts = [correct, ...shuffledOther].sort(() => Math.random() - 0.5);

      return {
        id: `q_${idx}_${item.id}`,
        wordObj: item,
        options: opts,
        correctAnswer: correct,
      };
    });

    setQuestions(qList);
    setCurrentIndex(0);
    setUserAnswers({});
    setShowAnswer(false);
    setTestState('TESTING');
  };

  const handleSelectOption = (option: string) => {
    setUserAnswers((prev) => ({ ...prev, [currentIndex]: option }));
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setShowAnswer(false);
    } else {
      setTestState('RESULT');
    }
  };

  const calculateScore = () => {
    let count = 0;
    questions.forEach((q, idx) => {
      if (userAnswers[idx] === q.correctAnswer) count++;
    });
    return count;
  };

  const currentQ = questions[currentIndex];

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 bg-slate-900 text-white rounded-3xl shadow-2xl border border-slate-800">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
            <HelpCircle size={28} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              มินิเทส (Mini-Test Multiple Choice)
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              แบบทดสอบประเมินคลังศัพท์สั้นๆ วัดความแม่นยำภาษา {activeLang === 'CN' ? 'จีน (HSK)' : 'อังกฤษ (IELTS)'}
            </p>
          </div>
        </div>
      </div>

      {testState === 'SETUP' && (
        <div className="py-12 px-4 flex flex-col items-center text-center max-w-lg mx-auto">
          <div className="w-20 h-20 bg-indigo-500/10 border border-indigo-500/30 rounded-3xl flex items-center justify-center text-indigo-400 mb-6 shadow-inner">
            <Award size={40} />
          </div>

          <h2 className="text-2xl font-bold mb-2">ตั้งค่ามินิเทสเพื่อเริ่มทดสอบ</h2>
          <p className="text-sm text-slate-400 mb-8 leading-relaxed">
            เลือกเลเวลคำศัพท์และจำนวนข้อที่ต้องการทดสอบ แล้วเริ่มทำข้อสอบแบบตัวเลือก 4 ตัวเลือก!
          </p>

          <div className="w-full bg-slate-800/60 border border-slate-700/80 p-6 rounded-2xl mb-8 flex flex-col gap-6 text-left">
            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-3">
                ระดับคำศัพท์
              </label>
              <div className="flex flex-wrap gap-2">
                {levelOptions.map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setSelectedLevel(lvl)}
                    className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                      selectedLevel === lvl
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                        : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-3">
                จำนวนข้อในมินิเทส
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[10, 20, 30].map((count) => (
                  <button
                    key={count}
                    onClick={() => setQuestionCount(count)}
                    className={`py-3 rounded-xl font-bold text-sm transition-all border ${
                      questionCount === count
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md scale-105'
                        : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {count} ข้อ
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={startTest}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-600/25 transition-all transform active:scale-95 text-lg flex items-center justify-center gap-2"
          >
            <Play size={20} fill="currentColor" /> เริ่มทำมินิเทส
          </button>
        </div>
      )}

      {testState === 'TESTING' && currentQ && (
        <div className="py-8 max-w-2xl mx-auto">
          {/* Progress Header */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-bold text-slate-400">
              ข้อที่ <span className="text-indigo-400 font-mono text-base">{currentIndex + 1}</span> / {questions.length}
            </span>
            <span className="text-xs bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full font-bold border border-indigo-500/30">
              ระดับ: {currentQ.wordObj.level}
            </span>
          </div>

          {/* Question Card */}
          <div className="bg-slate-800/80 border border-slate-700 p-8 rounded-3xl text-center mb-8 shadow-xl relative overflow-hidden">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest block mb-2">
              คำศัพท์โจทย์
            </span>
            <h2 className="text-4xl font-black text-white mb-2">{currentQ.wordObj.word}</h2>
            {currentQ.wordObj.pinyin && (
              <p className="text-sm text-slate-400">Pinyin: {currentQ.wordObj.pinyin}</p>
            )}
            {currentQ.wordObj.phonetic && (
              <p className="text-sm text-slate-400">Phonetic: {currentQ.wordObj.phonetic}</p>
            )}
          </div>

          {/* Options List */}
          <div className="flex flex-col gap-3 mb-8">
            {currentQ.options.map((opt, i) => {
              const isSelected = userAnswers[currentIndex] === opt;
              return (
                <button
                  key={i}
                  onClick={() => handleSelectOption(opt)}
                  className={`p-4 rounded-2xl font-bold text-left transition-all border flex items-center justify-between shadow-md text-base ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-600/30 scale-[1.01]'
                      : 'bg-slate-800/80 border-slate-700/80 text-slate-200 hover:border-indigo-500/60 hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-xl bg-slate-900/60 border border-slate-700 flex items-center justify-center text-xs font-mono font-bold text-slate-400">
                      {String.fromCharCode(65 + i)}
                    </span>
                    {opt}
                  </span>
                  {isSelected && <CheckCircle2 size={20} className="text-white" />}
                </button>
              );
            })}
          </div>

          {/* Action Button */}
          <button
            onClick={handleNext}
            disabled={!userAnswers[currentIndex]}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 disabled:pointer-events-none text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-base shadow-lg"
          >
            {currentIndex < questions.length - 1 ? (
              <>
                ข้อถัดไป <ArrowRight size={18} />
              </>
            ) : (
              'ส่งคำตอบมินิเทส'
            )}
          </button>
        </div>
      )}

      {testState === 'RESULT' && (
        <div className="py-12 px-4 flex flex-col items-center text-center max-w-lg mx-auto">
          <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-3xl flex items-center justify-center mx-auto mb-4 animate-bounce">
            <Trophy size={40} />
          </div>

          <h2 className="text-3xl font-black text-white mb-2">สรุปผลการทำมินิเทส</h2>
          <p className="text-sm text-slate-400 mb-8">ประเมินความแม่นยำคลังศัพท์เรียบร้อยแล้ว</p>

          <div className="w-full bg-slate-800/60 border border-slate-700/80 p-6 rounded-2xl mb-8 grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-400 mb-1">ตอบถูกต้อง</div>
              <div className="text-3xl font-black text-emerald-400">
                {calculateScore()} / {questions.length}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">คิดเป็นเปอร์เซ็นต์</div>
              <div className="text-3xl font-black text-indigo-400">
                {Math.round((calculateScore() / questions.length) * 100)}%
              </div>
            </div>
          </div>

          <button
            onClick={() => setTestState('SETUP')}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-base shadow-lg"
          >
            <RefreshCw size={18} /> ทำแบบทดสอบมินิเทสใหม่
          </button>
        </div>
      )}
    </div>
  );
}
