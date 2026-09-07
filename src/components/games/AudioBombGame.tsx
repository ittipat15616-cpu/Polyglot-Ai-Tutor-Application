import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Bomb, Volume2, Trophy, Sparkles, RefreshCw, Clock, ShieldAlert, Zap } from 'lucide-react';
import { VocabWord } from '../../data/vocabData';
import { playTTS } from "../../utils/audio";
import { soundFx } from '../../utils/soundEffects';
import { saveGameStageStars } from '../../services/userPersistence';
import { areHomophones } from '../../utils/homophones';

interface AudioBombGameProps {
  vocabList: VocabWord[];
  activeLang: 'EN' | 'CN' | 'TH';
  onBack: () => void;
  stageInfo?: { stageNumber: number; totalStages: number; startIndex: number; endIndex: number; subLevel?: string };
  onNextStage?: () => void;
}

export default function AudioBombGame({ vocabList, activeLang, onBack, stageInfo, onNextStage }: AudioBombGameProps) {
    const [isPlaying, setIsPlaying] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isWin, setIsWin] = useState(false);

  useEffect(() => {
    if (vocabList && vocabList.length > 0) {
      startGame();
    }
  }, [vocabList]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [targetWords, setTargetWords] = useState<VocabWord[]>([]);
  const [options, setOptions] = useState<{ wordObj: VocabWord; color: string }[]>([]);

  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [defusedCount, setDefusedCount] = useState(0);

  const colors = [
    'from-rose-500 to-red-600 border-red-400 text-white',
    'from-blue-500 to-indigo-600 border-blue-400 text-white',
    'from-emerald-500 to-teal-600 border-emerald-400 text-white',
    'from-amber-500 to-yellow-600 border-yellow-400 text-slate-950',
  ];

  const speak = (text: string) => playTTS(text, activeLang);

  const startGame = () => {
    if (vocabList.length === 0) return;

    const countToUse = vocabList.length;
    const shuffled = [...vocabList].sort(() => Math.random() - 0.5).slice(0, countToUse);
    setTargetWords(shuffled);
    setCurrentIndex(0);
    setScore(0);
    setDefusedCount(0);
    setIsGameOver(false);
    setIsWin(false);
    setIsPlaying(true);
    setupBomb(0, shuffled);
  };

  const setupBomb = (index: number, words: VocabWord[]) => {
    if (index >= words.length) {
      saveGameStageStars('BOMB', stageInfo?.subLevel || activeLang, stageInfo?.stageNumber || 1, 0); // 0 mistakes because 1 mistake = game over
      setIsWin(true);
      setIsPlaying(false);
      soundFx.playVictory();
      return;
    }

    const targetObj = words[index];

    // Pick 3 distractors (Avoid Homophones & Synonyms)
    const otherWords = vocabList.filter((w) => {
      if (w.id === targetObj.id) return false;
      if (w.word.toLowerCase() === targetObj.word.toLowerCase()) return false;
      if (activeLang === 'CN' && w.pinyin && targetObj.pinyin) {
        if (w.pinyin.toLowerCase().replace(/\s/g,'') === targetObj.pinyin.toLowerCase().replace(/\s/g,'')) return false;
      }
      if (areHomophones(w.word, targetObj.word)) return false;
      return true;
    });
    const shuffledOther = otherWords.sort(() => Math.random() - 0.5).slice(0, 3);

    const candidates = [targetObj, ...shuffledOther].sort(() => Math.random() - 0.5);
    const mapped = candidates.map((w, i) => ({
      wordObj: w,
      color: colors[i % colors.length],
    }));

    setOptions(mapped);
    setTimeLeft(15);

    // Auto-play audio pronunciation
    setTimeout(() => {
      speak(targetObj.word);
    }, 300);
  };

  // Timer loop
  useEffect(() => {
    if (!isPlaying || isGameOver || isWin) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsGameOver(true);
          setIsPlaying(false);
          soundFx.playWrong('BOMB');
          soundFx.playGameOver();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying, isGameOver, isWin, currentIndex]);

  const handleCutWire = (candidateObj: VocabWord) => {
    const targetObj = targetWords[currentIndex];

    if (candidateObj.id === targetObj.id) {
      // DEFUSED CORRECTLY
      soundFx.playCorrect('BOMB');
      setDefusedCount((prev) => prev + 1);
      setScore((prev) => prev + 150 + timeLeft * 10);

      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      setupBomb(nextIdx, targetWords);
    } else {
      // EXPLODE!
      soundFx.playWrong('BOMB');
      soundFx.playGameOver();
      setIsGameOver(true);
      setIsPlaying(false);
    }
  };

  const targetObj = targetWords[currentIndex];

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 bg-red-950 text-white rounded-3xl shadow-2xl relative border border-red-900 overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-6 border-b border-red-900/80">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-red-300 hover:text-white bg-red-900/80 px-4 py-2 rounded-xl transition-colors font-medium text-sm"
        >
          <ArrowLeft size={18} /> ย้อนกลับ
        </button>

        <div className="text-center">
          <h2 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 bg-clip-text text-transparent flex items-center justify-center gap-2">
            <Bomb size={24} className="text-orange-400 animate-pulse" /> Audio Bomb Defuse
          </h2>
          <p className="text-xs text-red-300 mt-0.5">เกมฟังเสียงกู้ระเบิดเวลาคำศัพท์</p>
        </div>

        <div className="bg-red-900/90 border border-red-700 px-3.5 py-1.5 rounded-xl flex items-center gap-2">
          <Trophy size={18} className="text-yellow-400" />
          <span className="font-mono font-bold text-yellow-400">{score}</span>
        </div>
      </div>

      {!isPlaying && !isGameOver && !isWin ? (
        /* START SCREEN */
        <div className="py-12 px-4 flex flex-col items-center text-center max-w-lg mx-auto">
          <div className="w-24 h-24 bg-red-500/10 border border-red-500/30 rounded-3xl flex items-center justify-center text-red-400 mb-6 shadow-inner animate-pulse">
            <Bomb size={48} />
          </div>

          <h3 className="text-2xl font-bold mb-2">ฟังเสียงคำศัพท์แล้วตัดสายไฟกู้ระเบิด</h3>
          <p className="text-sm text-red-300 mb-6 leading-relaxed">
            ระบบจะเปิดเสียงอ่านคำศัพท์ ให้คุณฟังเสียงแล้วแตะตัดสายไฟคำแปลที่ถูกต้องให้ทันก่อนเวลาถอยหลังหมด!
          </p>

 

            <button
            onClick={startGame}
            className="w-full bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-400 hover:to-orange-500 text-slate-950 font-black py-4 rounded-2xl shadow-xl shadow-red-500/25 transition-all transform active:scale-95 text-lg flex items-center justify-center gap-2"
          >
            <Sparkles size={20} /> เริ่มเกมกู้ระเบิด!
          </button>
        </div>
      ) : (
        /* GAMEPLAY STAGE */
        <div className="py-6 flex flex-col items-center">
          {/* Progress Bar */}
          <div className="w-full flex items-center justify-between mb-4 bg-red-900/40 border border-red-900 p-3 rounded-2xl">
            <div className="text-xs font-bold text-red-300">
              ลูกที่ <span className="text-yellow-400 font-mono text-base">{currentIndex + 1}</span> / {targetWords.length}
            </div>

            {/* Bomb Timer Clock */}
            <div className="flex items-center gap-2 font-mono text-2xl font-black text-yellow-400 animate-pulse">
              <Clock size={20} className="text-red-400" />
              00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
            </div>
          </div>

          {/* BOMB CENTRAL DISPLAY */}
          <div className="w-full bg-stone-900 border-4 border-red-900 p-8 rounded-3xl text-center mb-8 shadow-2xl relative flex flex-col items-center justify-center min-h-[220px]">
            <div className="w-16 h-16 bg-red-500/20 border border-red-500/40 rounded-full flex items-center justify-center text-red-400 mb-4 animate-bounce">
              <Volume2 size={32} />
            </div>

            <h3 className="text-xl font-bold text-white mb-2">แตะลำโพงเพื่อฟังเสียงคำศัพท์ซ้ำ</h3>

            {targetObj && (
              <button
                onClick={() => speak(targetObj.word)}
                className="bg-gradient-to-r from-red-500 to-orange-500 text-slate-950 font-black px-6 py-2.5 rounded-full shadow-lg shadow-red-500/30 flex items-center gap-2 hover:scale-105 transition-all active:scale-95"
              >
                <Volume2 size={20} /> เล่นเสียงคำศัพท์
              </button>
            )}
          </div>

          {/* 4 COLOR WIRES OPTIONS */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
            {options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleCutWire(opt.wordObj)}
                className={`p-5 rounded-2xl font-black text-left transition-all border shadow-xl bg-gradient-to-r ${opt.color} hover:scale-[1.02] active:scale-95 flex items-center justify-between min-h-[70px]`}
              >
                <div>
                  <div className="text-lg font-bold">{opt.wordObj.translations[0]}</div>
                  <div className="text-xs opacity-80 mt-0.5">สายไฟเส้นที่ {i + 1}</div>
                </div>
                <div className="w-8 h-8 bg-black/20 rounded-full flex items-center justify-center border border-white/20">
                  ✂️
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* WIN MODAL */}
      {isWin && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-stone-900 border border-stone-800 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl relative"
          >
            <div className="w-20 h-20 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-3xl flex items-center justify-center mx-auto mb-4 animate-bounce">
              <Trophy size={40} />
            </div>

            <h3 className="text-2xl font-black text-white mb-1">กู้ระเบิดสำเร็จทุกชุด! 💣✨</h3>
            <p className="text-sm text-stone-400 mb-6">ทักษะการฟังของคุณยอดเยี่ยมมาก ปลดชนวนได้ทั้งหมด {targetWords.length} ลูก</p>

            <div className="bg-stone-800/60 border border-stone-700/60 rounded-2xl p-4 mb-6">
              <div className="text-xs text-stone-400 mb-1">คะแนนรวม</div>
              <div className="text-3xl font-black text-yellow-400">{score}</div>
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
            className="bg-stone-900 border border-stone-800 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl relative"
          >
            <div className="w-20 h-20 bg-red-500/20 text-red-400 border border-red-500/30 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <ShieldAlert size={40} />
            </div>

            <h3 className="text-2xl font-black text-white mb-1">ระเบิดทำงานแล้ว! 💥</h3>
            <p className="text-sm text-stone-400 mb-6">ตัดสายไฟผิดเส้นหรือหมดเวลาที่ลูก {currentIndex + 1}</p>

            <div className="bg-stone-800/60 border border-stone-700/60 rounded-2xl p-4 mb-6">
              <div className="text-xs text-slate-400 mb-1">คะแนนที่คุณทำได้</div>
              <div className="text-3xl font-black text-yellow-400">{score}</div>
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
