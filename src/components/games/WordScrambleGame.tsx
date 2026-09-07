import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, RefreshCw, Trophy, Sparkles, Volume2, KeyRound, RotateCcw } from 'lucide-react';
import { VocabWord } from '../../data/vocabData';
import { playTTS } from "../../utils/audio";
import { soundFx } from '../../utils/soundEffects';
import { saveGameStageStars } from '../../services/userPersistence';

interface WordScrambleGameProps {
  vocabList: VocabWord[];
  activeLang: 'EN' | 'CN' | 'TH';
  onBack: () => void;
  stageInfo?: { stageNumber: number; totalStages: number; startIndex: number; endIndex: number; subLevel?: string };
  onNextStage?: () => void;
}

export default function WordScrambleGame({ vocabList, activeLang, onBack, stageInfo, onNextStage }: WordScrambleGameProps) {
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

  const [scrambledTiles, setScrambledTiles] = useState<{ id: string; char: string }[]>([]);
  const [selectedTiles, setSelectedTiles] = useState<{ id: string; char: string }[]>([]);

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [mistakes, setMistakes] = useState(0);

  const speak = (text: string) => playTTS(text, activeLang);

  // Helper to get target string for scrambling (Pinyin for Chinese, Word for English)
  const getTargetString = (wordObj: VocabWord): string => {
    if (activeLang === 'CN' && wordObj.pinyin) {
      return wordObj.pinyin.replace(/[^a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/g, '');
    }
    return wordObj.word.replace(/\s+/g, '');
  };

  const startGame = () => {
    if (vocabList.length === 0) return;
    const shuffled = [...vocabList].sort(() => Math.random() - 0.5);
    setTargetWords(shuffled);
    setCurrentIndex(0);
    setScore(0);
    setStreak(0);
    setMistakes(0);
    setIsGameOver(false);
    setIsWin(false);
    setIsPlaying(true);
    setupWord(0, shuffled);
  };

  const setupWord = (index: number, words: VocabWord[]) => {
    if (index >= words.length) {
      saveGameStageStars('SCRAMBLE', stageInfo?.subLevel || activeLang, stageInfo?.stageNumber || 1, mistakes);
      setIsWin(true);
      setIsPlaying(false);
      soundFx.playVictory();
      return;
    }

    const currentWord = words[index];
    const targetString = getTargetString(currentWord);

    // Split string into character tiles
    const chars = targetString.split('');
    const tileList = chars.map((char, i) => ({
      id: `tile_${i}_${Math.random().toString(36).substring(2, 5)}`,
      char,
    }));

    // Shuffle characters
    const shuffled = [...tileList].sort(() => Math.random() - 0.5);

    setScrambledTiles(shuffled);
    setSelectedTiles([]);
  };

  const handleTileClick = (tile: { id: string; char: string }) => {
    // Move from scrambled to selected
    setScrambledTiles((prev) => prev.filter((t) => t.id !== tile.id));
    const newSelected = [...selectedTiles, tile];
    setSelectedTiles(newSelected);

    // Check if fully assembled
    const currentWord = targetWords[currentIndex];
    const targetString = getTargetString(currentWord);

    if (newSelected.length === targetString.length) {
      const assembledWord = newSelected.map((t) => t.char).join('');
      if (assembledWord.toLowerCase() === targetString.toLowerCase()) {
        // SOLVED CORRECTLY
        soundFx.playCorrect('SCRAMBLE');
        speak(currentWord.word);
        const newStreak = streak + 1;
        setStreak(newStreak);
        setScore((prev) => prev + 120 + newStreak * 20);

        setTimeout(() => {
          const nextIdx = currentIndex + 1;
          setCurrentIndex(nextIdx);
          setupWord(nextIdx, targetWords);
        }, 600);
      } else {
        // WRONG ASSEMBLY
        soundFx.playWrong('SCRAMBLE');
        setStreak(0);
        setMistakes((m) => m + 1);
        setTimeout(() => {
          // Reset tiles for current word
          setupWord(currentIndex, targetWords);
        }, 600);
      }
    }
  };

  const handleRemoveTile = (tile: { id: string; char: string }) => {
    setSelectedTiles((prev) => prev.filter((t) => t.id !== tile.id));
    setScrambledTiles((prev) => [...prev, tile]);
  };

  const handleClear = () => {
    setupWord(currentIndex, targetWords);
  };

  const currentObj = targetWords[currentIndex];

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 bg-indigo-950 text-white rounded-3xl shadow-2xl relative border border-indigo-800 overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-6 border-b border-indigo-800/80">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-indigo-300 hover:text-white bg-indigo-900/80 px-4 py-2 rounded-xl transition-colors font-medium text-sm"
        >
          <ArrowLeft size={18} /> ย้อนกลับ
        </button>

        <div className="text-center">
          <h2 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent flex items-center justify-center gap-2">
            <KeyRound size={24} className="text-purple-400" /> Word Scramble
          </h2>
          <p className="text-xs text-indigo-300 mt-0.5">
            {activeLang === 'CN' ? 'เกมถอดรหัสเรียง Pinyin ภาษาจีน' : 'เกมถอดรหัสเรียงตัวอักษรสะกดคำ'}
          </p>
        </div>

        <div className="bg-indigo-900/90 border border-indigo-700 px-3.5 py-1.5 rounded-xl flex items-center gap-2">
          <Trophy size={18} className="text-amber-400" />
          <span className="font-mono font-bold text-amber-400">{score}</span>
        </div>
      </div>

      {!isPlaying && !isGameOver && !isWin ? (
        /* START SCREEN */
        <div className="py-12 px-4 flex flex-col items-center text-center max-w-lg mx-auto">
          <div className="w-24 h-24 bg-purple-500/10 border border-purple-500/30 rounded-3xl flex items-center justify-center text-purple-400 mb-6 shadow-inner">
            <KeyRound size={48} />
          </div>

          <h3 className="text-2xl font-bold mb-2">
            {activeLang === 'CN' ? 'แตะเรียง Pinyin เพื่อถอดรหัสคำศัพท์!' : 'แตะเรียงตัวอักษรเพื่อถอดรหัสคำศัพท์!'}
          </h3>
          <p className="text-sm text-indigo-300 mb-6 leading-relaxed">
            {activeLang === 'CN'
              ? 'ดูตัวอักษรจีนและความหมายภาษาไทย แล้วแตะบล็อกตัวอักษร Pinyin ที่สลับอยู่ให้เรียงถูกต้อง!'
              : 'ดูความหมายภาษาไทยและฟังเสียงอ่าน แล้วแตะบล็อกตัวอักษรที่สลับอยู่ให้เรียงถูกต้องตามคำศัพท์!'}
          </p>

          <button
            onClick={startGame}
            className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-purple-500/25 transition-all transform active:scale-95 text-lg flex items-center justify-center gap-2"
          >
            <Sparkles size={20} /> เริ่มถอดรหัสคำศัพท์!
          </button>
        </div>
      ) : (
        /* GAMEPLAY STAGE */
        <div className="py-6 flex flex-col items-center">
          {/* Progress Bar Header */}
          <div className="w-full flex items-center justify-between mb-4">
            <div className="text-xs font-bold text-indigo-300">
              {stageInfo && (
                <span className="text-amber-400 font-bold mr-2">
                  ด่านที่ {stageInfo.stageNumber}/{stageInfo.totalStages}
                </span>
              )}
              คำที่ <span className="text-purple-400 font-mono text-base">{currentIndex + 1}</span> / {targetWords.length}
            </div>
            <div className="text-xs font-bold text-purple-300 bg-purple-500/20 px-3 py-1 rounded-lg border border-purple-500/30">
              คอมโบสะกด: x{streak}
            </div>
          </div>

          {/* Word Hint Container */}
          {currentObj && (
            <div className="w-full bg-indigo-900/60 border border-indigo-800 p-6 rounded-3xl text-center mb-6 shadow-inner relative">
              {activeLang === 'CN' ? (
                <>
                  <span className="text-xs font-bold text-purple-300 uppercase tracking-widest block mb-1">
                    คำศัพท์ภาษาจีน & ความหมาย
                  </span>
                  <h3 className="text-4xl font-black text-amber-300 mb-1 tracking-wider">
                    {currentObj.word}
                  </h3>
                  <div className="text-lg font-bold text-slate-200 mb-2">
                    ({currentObj.translations[0]})
                  </div>
                </>
              ) : (
                <>
                  <span className="text-xs font-bold text-purple-300 uppercase tracking-widest block mb-2">
                    คำแปลภาษาไทย
                  </span>
                  <h3 className="text-3xl font-black text-amber-300 mb-2">
                    {currentObj.translations[0]}
                  </h3>
                </>
              )}

              <div className="flex items-center justify-center gap-2 mt-1">
                <button
                  onClick={() => speak(currentObj.word)}
                  className="p-2 bg-indigo-800 hover:bg-indigo-700 text-indigo-200 rounded-full transition-colors flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold"
                >
                  <Volume2 size={16} /> ฟังเสียงอ่าน
                </button>
              </div>
            </div>
          )}

          {/* Instruction Subtitle */}
          <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-3">
            {activeLang === 'CN' ? 'แตะเรียงตัวอักษร Pinyin ด้านล่าง:' : 'แตะเรียงตัวอักษรภาษาอังกฤษด้านล่าง:'}
          </div>

          {/* SELECTED ASSEMBLED TILES DISPLAY */}
          <div className="w-full min-h-[80px] bg-slate-950/80 border-2 border-dashed border-purple-500/40 rounded-2xl p-4 flex items-center justify-center gap-2 mb-6 flex-wrap">
            <AnimatePresence>
              {selectedTiles.map((tile) => (
                <motion.button
                  key={tile.id}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  onClick={() => handleRemoveTile(tile)}
                  className="w-11 h-13 sm:w-12 sm:h-14 bg-gradient-to-b from-purple-500 to-indigo-600 text-white font-black text-xl sm:text-2xl rounded-xl shadow-lg border border-purple-400 flex items-center justify-center active:scale-95"
                >
                  {tile.char}
                </motion.button>
              ))}
            </AnimatePresence>
            {selectedTiles.length === 0 && (
              <span className="text-xs text-indigo-400 font-medium">
                {activeLang === 'CN' ? 'แตะตัวอักษร Pinyin ด้านล่างเพื่อสะกดที่นี่' : 'แตะตัวอักษรด้านล่างเพื่อสะกดคำที่นี่'}
              </span>
            )}
          </div>

          {/* SCRAMBLED TILES CHOICES */}
          <div className="flex items-center justify-center gap-2 flex-wrap max-w-xl mb-6">
            {scrambledTiles.map((tile) => (
              <motion.button
                key={tile.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleTileClick(tile)}
                className="w-11 h-13 sm:w-12 sm:h-14 bg-indigo-900/90 hover:bg-purple-500 text-white font-bold text-xl sm:text-2xl rounded-xl border border-indigo-700 hover:border-purple-400 flex items-center justify-center shadow-md transition-colors"
              >
                {tile.char}
              </motion.button>
            ))}
          </div>

          <button
            onClick={handleClear}
            className="text-xs text-indigo-300 hover:text-white flex items-center gap-1.5 bg-indigo-900/60 px-4 py-2 rounded-xl border border-indigo-800"
          >
            <RotateCcw size={14} /> ล้างเรียงใหม่
          </button>
        </div>
      )}

      {/* WIN MODAL */}
      {isWin && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-indigo-950 border border-indigo-800 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl relative"
          >
            <div className="w-20 h-20 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-3xl flex items-center justify-center mx-auto mb-4 animate-bounce">
              <Trophy size={40} />
            </div>

            <h3 className="text-2xl font-black text-white mb-1">
              {activeLang === 'CN' ? 'เรียง Pinyin ถอดรหัสสำเร็จ! 🎉' : 'ถอดรหัสเรียงคำศัพท์ครบถ้วน! 🎉'}
            </h3>
            <p className="text-sm text-indigo-300 mb-6">คุณสามารถสะกดได้ถูกต้องทุกคำ ({targetWords.length} คำ)</p>

            <div className="bg-indigo-900/60 border border-indigo-800 rounded-2xl p-4 mb-6">
              <div className="text-xs text-indigo-300 mb-1">คะแนนรวม</div>
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
