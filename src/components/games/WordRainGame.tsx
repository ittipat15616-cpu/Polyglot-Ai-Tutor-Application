import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CloudRain, Trophy, Sparkles, RefreshCw, Snowflake, Flame, Volume2, Shield } from 'lucide-react';
import { VocabWord } from '../../data/vocabData';
import { playTTS } from "../../utils/audio";
import { soundFx } from '../../utils/soundEffects';
import { saveGameStageStars } from '../../services/userPersistence';

interface FallingWord {
  id: string;
  wordObj: VocabWord;
  x: number; // percentage from left
  y: number; // percentage from top
  speed: number;
}

interface WordRainGameProps {
  vocabList: VocabWord[];
  activeLang: 'EN' | 'CN' | 'TH';
  onBack: () => void;
  stageInfo?: { stageNumber: number; totalStages: number; startIndex: number; endIndex: number; subLevel?: string };
  onNextStage?: () => void;
}

export default function WordRainGame({ vocabList, activeLang, onBack, stageInfo, onNextStage }: WordRainGameProps) {
    const [isPlaying, setIsPlaying] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isWin, setIsWin] = useState(false);

  useEffect(() => {
    if (vocabList && vocabList.length > 0) {
      startGame();
    }
  }, [vocabList]);

  const [activeWord, setActiveWord] = useState<FallingWord | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [escapedCount, setEscapedCount] = useState(0);
  const [isFrozen, setIsFrozen] = useState(false);

  const poolRef = useRef<VocabWord[]>([]);

  const speak = (text: string) => playTTS(text, activeLang);

  const startGame = () => {
    if (vocabList.length === 0) return;
    const countToUse = vocabList.length;
    poolRef.current = [...vocabList].sort(() => Math.random() - 0.5).slice(0, countToUse);

    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setEscapedCount(0);
    setIsGameOver(false);
    setIsWin(false);
    setIsPlaying(true);
    spawnNextWord();
  };

  const spawnNextWord = () => {
    if (poolRef.current.length === 0) {
      saveGameStageStars('RAIN', stageInfo?.subLevel || activeLang, stageInfo?.stageNumber || 1, escapedCount);
      setIsWin(true);
      setIsPlaying(false);
      soundFx.playVictory();
      return;
    }

    const nextObj = poolRef.current.pop()!;
    const correctTrans = nextObj.translations[0] || nextObj.word;

    // Pick 3 distractors
    const otherTrans = vocabList
      .filter((w) => w.id !== nextObj.id)
      .map((w) => w.translations[0])
      .filter(Boolean);

    const shuffledOther = otherTrans.sort(() => Math.random() - 0.5).slice(0, 3);
    const opts = [correctTrans, ...shuffledOther].sort(() => Math.random() - 0.5);

    setActiveWord({
      id: nextObj.id,
      wordObj: nextObj,
      x: Math.floor(Math.random() * 60) + 20, // 20% - 80%
      y: 5,
      speed: 0.35 + Math.random() * 0.2,
    });
    setOptions(opts);
  };

  // Falling Loop
  useEffect(() => {
    if (!isPlaying || !activeWord || isFrozen) return;

    const interval = setInterval(() => {
      setActiveWord((prev) => {
        if (!prev) return null;
        const nextY = prev.y + prev.speed;
        if (nextY >= 82) {
          // ESCAPED TO BOTTOM
          handleMiss();
          return null;
        }
        return { ...prev, y: nextY };
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, activeWord, isFrozen]);

  const handleMiss = () => {
    setStreak(0);
    soundFx.playDamage();
    setEscapedCount((prev) => {
      const nextCount = prev + 1;
      if (nextCount >= 5) {
        setIsGameOver(true);
        setIsPlaying(false);
        soundFx.playGameOver();
      } else {
        spawnNextWord();
      }
      return nextCount;
    });
  };

  const handleAnswer = (option: string) => {
    if (!activeWord) return;

    const correctTrans = activeWord.wordObj.translations[0] || activeWord.wordObj.word;

    if (option === correctTrans) {
      // MATCH SUCCESS
      soundFx.playCorrect('RAIN');
      speak(activeWord.wordObj.word);
      const newStreak = streak + 1;
      setStreak(newStreak);
      if (newStreak > maxStreak) setMaxStreak(newStreak);
      setScore((prev) => prev + 100 + newStreak * 15);
      spawnNextWord();
    } else {
      // WRONG ANSWER
      soundFx.playWrong('RAIN');
      handleMiss();
    }
  };

  const triggerFreeze = () => {
    if (isFrozen) return;
    setIsFrozen(true);
    setTimeout(() => setIsFrozen(false), 4000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 bg-slate-950 text-white rounded-3xl shadow-2xl relative border border-slate-800 overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-800">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white bg-slate-800 px-4 py-2 rounded-xl transition-colors font-medium text-sm"
        >
          <ArrowLeft size={18} /> ย้อนกลับ
        </button>

        <div className="text-center">
          <h2 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent flex items-center justify-center gap-2">
            <CloudRain size={24} className="text-cyan-400" /> Word Rain
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">เกมเมฆคำศัพท์ตกกระทบฝ่าสายฝน</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={triggerFreeze}
            disabled={isFrozen}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
              isFrozen
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 animate-pulse'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-cyan-400'
            }`}
          >
            <Snowflake size={14} /> {isFrozen ? 'แช่แข็งแล้ว!' : 'แช่แข็งเวลา'}
          </button>

          <div className="bg-slate-800/90 border border-slate-700 px-3.5 py-1.5 rounded-xl flex items-center gap-2">
            <Trophy size={18} className="text-amber-400" />
            <span className="font-mono font-bold text-amber-400">{score}</span>
          </div>
        </div>
      </div>

      {!isPlaying && !isGameOver && !isWin ? (
        /* START SCREEN */
        <div className="py-12 px-4 flex flex-col items-center text-center max-w-lg mx-auto">
          <div className="w-24 h-24 bg-cyan-500/10 border border-cyan-500/30 rounded-3xl flex items-center justify-center text-cyan-400 mb-6 shadow-inner">
            <CloudRain size={48} />
          </div>

          <h3 className="text-2xl font-bold mb-2">จับคู่คำศัพท์ที่ร่วงหล่นก่อนตกถึงพื้น</h3>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            เลือกปุ่มคำแปลด้านล่างให้ตรงกับเมฆคำศัพท์ที่กำลังร่วงลงมา ห้ามปล่อยให้หลุดรอดเกิน 5 คำ!
          </p>

          <button
            onClick={startGame}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black py-4 rounded-2xl shadow-xl shadow-cyan-500/20 transition-all transform active:scale-95 text-lg flex items-center justify-center gap-2"
          >
            <Sparkles size={20} /> เริ่มลุย Word Rain!
          </button>
        </div>
      ) : isPlaying ? (
        /* GAMEPLAY STAGE */
        <div className="py-6 flex flex-col items-center">
          {/* Status Bar */}
          <div className="w-full flex items-center justify-between mb-4 bg-slate-900/80 border border-slate-800 p-3 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-lg">
                <Flame size={14} /> คอมโบ: x{streak}
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
              <Shield size={14} /> คำที่หลุดรอด: {escapedCount} / 5
            </div>
          </div>

          {/* RAIN CONTAINER SKY */}
          <div className="w-full h-[320px] bg-gradient-to-b from-slate-900 via-slate-900/90 to-blue-950/40 rounded-3xl border border-slate-800/80 relative overflow-hidden my-2 shadow-inner">
            {/* Ground Danger Line */}
            <div className="absolute bottom-0 left-0 w-full h-2 bg-gradient-to-r from-rose-500 via-orange-500 to-rose-500 animate-pulse z-10" />

            {/* Falling Word Bubble */}
            {activeWord && (
              <motion.div
                key={activeWord.id}
                style={{
                  position: 'absolute',
                  left: `${activeWord.x}%`,
                  top: `${activeWord.y}%`,
                  transform: 'translateX(-50%)',
                }}
                className="bg-cyan-500/20 backdrop-blur-md border-2 border-cyan-400 text-cyan-200 px-6 py-3 rounded-2xl shadow-xl shadow-cyan-500/20 font-black text-xl flex items-center gap-2"
              >
                <span>{activeWord.wordObj.word}</span>
                {activeWord.wordObj.pinyin && (
                  <span className="text-xs font-normal text-cyan-300">({activeWord.wordObj.pinyin})</span>
                )}
                <button
                  onClick={() => speak(activeWord.wordObj.word)}
                  className="p-1 bg-cyan-400/20 hover:bg-cyan-400/40 rounded-full text-cyan-300"
                >
                  <Volume2 size={16} />
                </button>
              </motion.div>
            )}
          </div>

          {/* ANSWER BUTTONS AT BOTTOM */}
          <div className="w-full grid grid-cols-2 gap-3 mt-4">
            {options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleAnswer(opt)}
                className="p-4 bg-slate-800/90 hover:bg-cyan-500 hover:text-slate-950 border border-slate-700/80 hover:border-cyan-400 rounded-2xl font-bold text-center transition-all shadow-md text-base"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* WIN MODAL */}
      {isWin && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl relative"
          >
            <div className="w-20 h-20 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-3xl flex items-center justify-center mx-auto mb-4 animate-bounce">
              <Trophy size={40} />
            </div>

            <h3 className="text-2xl font-black text-white mb-1">ลุยสายฝนสำเร็จทุกคำ! 🌧️✨</h3>
            <p className="text-sm text-slate-400 mb-6">ตอบคำศัพท์ที่ร่วงหล่นได้ครบถ้วน!</p>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 mb-6">
              <div className="text-xs text-slate-400 mb-1">คะแนนรวม</div>
              <div className="text-3xl font-black text-amber-400">{score}</div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-4 w-full">
              <button
                onClick={startGame}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 px-1 rounded-xl transition-all flex items-center justify-center gap-1.5 text-sm"
              >
                <RefreshCw size={16} /> ลองอีกครั้ง
              </button>
              <button
                onClick={onBack}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-1 rounded-xl transition-all flex items-center justify-center gap-1.5 text-sm"
              >
                กลับเมนูเกม
              </button>
              {onNextStage && (
                <button
                  onClick={onNextStage}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 px-1 rounded-xl transition-all flex items-center justify-center gap-1.5 text-sm shadow-lg shadow-emerald-500/20"
                >
                  เล่นด่านถัดไป
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* GAME OVER MODAL */}
      {isGameOver && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl relative"
          >
            <div className="w-20 h-20 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <CloudRain size={40} />
            </div>

            <h3 className="text-2xl font-black text-white mb-1">ฝนคำศัพท์ท่วมล้น! 🌧️</h3>
            <p className="text-sm text-slate-400 mb-6">มีคำศัพท์ร่วงหล่นลงพื้นเกิน 5 คำแล้ว</p>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 mb-6">
              <div className="text-xs text-slate-400 mb-1">คะแนนรวม</div>
              <div className="text-3xl font-black text-amber-400">{score}</div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-4 w-full">
              <button
                onClick={startGame}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 px-1 rounded-xl transition-all flex items-center justify-center gap-1.5 text-sm"
              >
                <RefreshCw size={16} /> ลองอีกครั้ง
              </button>
              <button
                onClick={onBack}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-1 rounded-xl transition-all flex items-center justify-center gap-1.5 text-sm"
              >
                กลับเมนูเกม
              </button>
              {onNextStage && (
                <button
                  onClick={onNextStage}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 px-1 rounded-xl transition-all flex items-center justify-center gap-1.5 text-sm shadow-lg shadow-emerald-500/20"
                >
                  เล่นด่านถัดไป
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
