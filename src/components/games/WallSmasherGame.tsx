import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Volume2, Heart, Trophy, Sparkles, RefreshCw, ShieldAlert, Clock, Hammer } from 'lucide-react';
import { VocabWord } from '../../data/vocabData';
import { playTTS } from "../../utils/audio";
import { soundFx } from '../../utils/soundEffects';
import { saveGameStageStars } from '../../services/userPersistence';

interface WallSmasherGameProps {
  vocabList: VocabWord[];
  activeLang: 'EN' | 'CN' | 'TH';
  onBack: () => void;
  stageInfo?: { stageNumber: number; totalStages: number; startIndex: number; endIndex: number; subLevel?: string };
  onNextStage?: () => void;
}

interface Brick {
  id: string;
  char: string;
  used: boolean;
}

export default function WallSmasherGame({ vocabList, activeLang, onBack, stageInfo, onNextStage }: WallSmasherGameProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isWin, setIsWin] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [targetWords, setTargetWords] = useState<VocabWord[]>([]);
  
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [isSmashed, setIsSmashed] = useState(false);
  
  // Time limit per wall (15s)
  const [timeLeft, setTimeLeft] = useState(15);

  // Brick Typer States
  const [targetWordStr, setTargetWordStr] = useState<string>('');
  const [displayText, setDisplayText] = useState<string>(''); // Thai translation
  const [displaySubtext, setDisplaySubtext] = useState<string>(''); // Pinyin if any
  
  const [bricks, setBricks] = useState<Brick[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState<Brick[]>([]);
  const [shakeWall, setShakeWall] = useState(false);
  const [shakeBricks, setShakeBricks] = useState(false);

  useEffect(() => {
    if (vocabList && vocabList.length > 0) {
      startGame();
    }
  }, [vocabList]);

  const startGame = () => {
    if (vocabList.length === 0) return;
    const countToUse = vocabList.length;
    const shuffled = [...vocabList].sort(() => Math.random() - 0.5).slice(0, countToUse);
    setTargetWords(shuffled);
    setCurrentIndex(0);
    setLives(3);
    setScore(0);
    setIsGameOver(false);
    setIsWin(false);
    setIsPlaying(true);
    setupRound(0, shuffled);
  };

  const setupRound = (index: number, words: VocabWord[]) => {
    if (index >= words.length) {
      const mistakes = 3 - lives;
      saveGameStageStars('WALL', stageInfo?.subLevel || activeLang, stageInfo?.stageNumber || 1, mistakes);
      setIsWin(true);
      setIsPlaying(false);
      soundFx.playVictory();
      return;
    }

    const currentWord = words[index];
    const translation = currentWord.translations[0] || currentWord.word;
    
    setDisplayText(translation);
    setDisplaySubtext(currentWord.pinyin || '');
    
    const rawTarget = currentWord.word.trim();
    // Remove spaces for typing target to make it easier (just chars)
    const targetStr = rawTarget.replace(/\s+/g, '');
    setTargetWordStr(targetStr);
    setCurrentAnswer([]);
    setIsSmashed(false);
    setTimeLeft(15);

    // Generate bricks
    let chars: string[] = [];
    if (activeLang === 'CN') {
       chars = targetStr.split('');
       const otherWords = words.filter(w => w.id !== currentWord.id);
       for (let i = 0; i < 3; i++) {
         const randomWord = otherWords[Math.floor(Math.random() * otherWords.length)];
         if (randomWord) {
             const randomChar = randomWord.word.charAt(Math.floor(Math.random() * randomWord.word.length));
             if (randomChar && randomChar !== ' ') chars.push(randomChar);
         }
       }
    } else {
       chars = targetStr.split('');
       const alphabet = "abcdefghijklmnopqrstuvwxyz";
       for(let i=0; i<3; i++) {
           chars.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
       }
    }

    const shuffledChars = chars.sort(() => Math.random() - 0.5);
    setBricks(shuffledChars.map((char, i) => ({ id: `${index}-${i}-${char}`, char, used: false })));
  };

  const speak = (text: string) => playTTS(text, activeLang);

  const handleSmashSuccess = useCallback(() => {
    setIsSmashed(true);
    soundFx.playCorrect('WALL');
    setScore((prev) => prev + 150);
    
    const currentWord = targetWords[currentIndex];
    if (currentWord) {
      speak(currentWord.word);
    }
    
    setTimeout(() => {
      const nextIdx = currentIndex + 1;
      setupRound(nextIdx, targetWords);
      setCurrentIndex(nextIdx);
    }, 1200);
  }, [currentIndex, targetWords, activeLang]);

  const handleBrickClick = (brick: Brick) => {
    if (brick.used || isSmashed || isGameOver || isWin || !isPlaying) return;

    const nextIndex = currentAnswer.length;
    if (nextIndex >= targetWordStr.length) return;

    const expectedChar = targetWordStr[nextIndex];

    const isCorrect = activeLang === 'CN' 
        ? brick.char === expectedChar
        : brick.char.toLowerCase() === expectedChar.toLowerCase();

    if (isCorrect) {
      soundFx.playCorrect('SCRAMBLE');
      setBricks(prev => prev.map(b => b.id === brick.id ? { ...b, used: true } : b));
      const newAnswer = [...currentAnswer, brick];
      setCurrentAnswer(newAnswer);

      // Trigger a small wall shake to simulate hitting the wall
      setShakeWall(true);
      setTimeout(() => setShakeWall(false), 150);

      if (newAnswer.length === targetWordStr.length) {
        handleSmashSuccess();
      }
    } else {
      soundFx.playWrong('SCRAMBLE');
      setLives(prev => {
        const newLives = prev - 1;
        if (newLives <= 0) {
          setIsGameOver(true);
          setIsPlaying(false);
          soundFx.playGameOver();
        }
        return newLives;
      });
      setShakeBricks(true);
      setTimeout(() => setShakeBricks(false), 300);
    }
  };

  // Wall countdown timer (15 seconds per wall)
  useEffect(() => {
    if (!isPlaying || isSmashed || isGameOver || isWin) return;
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          soundFx.playWrong('WALL');
          soundFx.playDamage();
          setLives((l) => {
            const nextL = l - 1;
            if (nextL <= 0) {
              setIsGameOver(true);
              setIsPlaying(false);
              soundFx.playGameOver();
            } else {
              const nextIdx = currentIndex + 1;
              setCurrentIndex(nextIdx);
              setupRound(nextIdx, targetWords);
            }
            return nextL;
          });
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying, isSmashed, isGameOver, isWin, currentIndex, targetWords]);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 bg-stone-900 text-white rounded-3xl shadow-2xl relative border border-stone-800">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-6 border-b border-stone-800">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-stone-400 hover:text-white bg-stone-800 px-4 py-2 rounded-xl transition-colors font-medium text-sm"
        >
          <ArrowLeft size={18} /> ย้อนกลับ
        </button>
        <div className="text-center">
          <h2 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-red-500 via-orange-400 to-yellow-400 bg-clip-text text-transparent flex items-center justify-center gap-2">
            <Hammer size={24} className="text-orange-400" /> Wall Smasher
          </h2>
          <p className="text-xs text-stone-400 mt-0.5">เรียงบล็อกตัวอักษรเพื่อทลายกำแพง!</p>
        </div>
      </div>

      {!isPlaying && !isGameOver && !isWin ? (
        /* START SCREEN */
        <div className="py-12 px-4 flex flex-col items-center text-center max-w-lg mx-auto">
          <div className="w-24 h-24 bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-orange-500/30 rounded-3xl flex items-center justify-center text-orange-400 mb-6 shadow-inner relative">
            <Hammer size={48} />
          </div>
          <h3 className="text-2xl font-bold mb-2">เรียงบล็อกทลายกำแพง! 🧱💥</h3>
          <p className="text-sm text-stone-400 mb-6 leading-relaxed">
            - เลือกบล็อกตัวอักษรให้ตรงกับคำศัพท์เพื่อสร้างรอยร้าว<br />
            - เรียงครบทุกตัวอักษรเพื่อทลายกำแพงให้สิ้นซาก!<br />
            - ระวัง! การเลือกบล็อกผิดจะทำให้เสียพลังชีวิต
          </p>
          <button
            onClick={startGame}
            className="w-full bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-stone-950 font-black py-4 rounded-2xl shadow-xl shadow-red-500/20 transition-all transform active:scale-95 text-lg flex items-center justify-center gap-2"
          >
            <Sparkles size={22} /> เริ่มเกมทลายกำแพง!
          </button>
        </div>
      ) : (
        /* GAMEPLAY BOARD */
        <div className="py-6 flex flex-col items-center">
          {/* Progress Banner & Timer */}
          <div className="w-full flex items-center justify-between mb-4 px-2">
            <div className="text-xs font-bold text-stone-400 flex items-center gap-2">
              <span>ด่านที่ <span className="text-orange-400 font-mono text-base">{currentIndex + 1}</span> / {targetWords.length}</span>
              <span className={`flex items-center gap-1 bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-lg border border-amber-500/30 text-xs font-mono font-bold ${timeLeft <= 5 ? 'text-red-400 border-red-500/30 animate-pulse' : ''}`}>
                <Clock size={14} /> {timeLeft}s
              </span>
            </div>
            <div className="flex items-center gap-2 bg-stone-800/80 px-3.5 py-1 rounded-xl border border-stone-700">
              <Trophy size={16} className="text-yellow-400" />
              <span className="font-mono font-bold text-yellow-400">{score}</span>
            </div>
          </div>

          {/* Lives Indicator */}
          <div className="flex justify-center gap-2 mb-4">
            {[1, 2, 3].map((l) => (
              <motion.div
                key={l}
                animate={l > lives ? { scale: 0.8, opacity: 0.3, filter: 'grayscale(100%)' } : { scale: [1, 1.1, 1] }}
                transition={l <= lives ? { repeat: Infinity, duration: 2, delay: l * 0.2 } : {}}
              >
                <Heart size={24} className="text-rose-500 fill-rose-500 drop-shadow-md" />
              </motion.div>
            ))}
          </div>

          {/* THE WALL */}
          <div className="w-full relative flex flex-col items-center justify-center my-2">
            <AnimatePresence mode="wait">
              {!isSmashed ? (
                <motion.div
                  key={currentIndex}
                  initial={{ y: -30, opacity: 0 }}
                  animate={{ 
                    y: 0, 
                    opacity: 1, 
                    x: shakeWall ? [-5, 5, -5, 5, 0] : 0 
                  }}
                  transition={{ x: { duration: 0.2 } }}
                  exit={{ scale: 1.2, opacity: 0, filter: 'brightness(2)' }}
                  className="w-full bg-stone-800 border-4 border-stone-700 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden flex flex-col items-center justify-center text-center min-h-[220px]"
                >
                  <div className="absolute top-4 right-4 bg-orange-500/20 border border-orange-500/40 text-orange-300 text-xs sm:text-sm px-3.5 py-1.5 rounded-full font-bold shadow-sm flex items-center gap-1.5">
                    <Sparkles size={14} className="text-orange-400" />
                    เรียงตัวอักษร
                  </div>

                  <h3 className="text-3xl sm:text-4xl font-black text-amber-300 tracking-wide my-4">
                    {displayText}
                  </h3>
                  
                  {displaySubtext && (
                    <div className="text-stone-400 text-sm font-medium mb-4">{displaySubtext}</div>
                  )}

                  {/* Answer Slots */}
                  <div className="flex flex-wrap justify-center gap-2 mt-4">
                    {targetWordStr.split('').map((char, idx) => {
                      const answeredBrick = currentAnswer[idx];
                      return (
                        <div 
                          key={idx}
                          className={`w-10 h-12 sm:w-12 sm:h-14 rounded-xl border-2 flex items-center justify-center text-xl sm:text-2xl font-bold transition-all
                            ${answeredBrick 
                              ? 'bg-amber-500 border-amber-400 text-stone-950 shadow-[0_0_15px_rgba(245,158,11,0.5)]' 
                              : 'bg-stone-900/50 border-stone-700 text-transparent'
                            }
                          `}
                        >
                          {answeredBrick ? answeredBrick.char : '_'}
                        </div>
                      )
                    })}
                  </div>

                </motion.div>
              ) : (
                /* SMASHED WALL EFFECT */
                <motion.div
                  initial={{ scale: 1 }}
                  animate={{ scale: 1.1, opacity: 0 }}
                  transition={{ duration: 0.8 }}
                  className="w-full min-h-[220px] bg-amber-500/20 border-4 border-amber-400 rounded-3xl flex items-center justify-center text-amber-300 text-3xl sm:text-4xl font-black tracking-widest uppercase shadow-[0_0_50px_rgba(245,158,11,0.6)]"
                >
                  💥 SMASHED! 💥
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* LETTER BRICKS TO CHOOSE */}
          {!isSmashed && (
            <motion.div 
               className="w-full mt-6"
               animate={{ x: shakeBricks ? [-5, 5, -5, 5, 0] : 0 }}
               transition={{ duration: 0.3 }}
            >
              <div className="flex flex-wrap justify-center gap-3">
                <AnimatePresence>
                  {bricks.map((brick) => (
                    !brick.used && (
                      <motion.button
                        key={brick.id}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleBrickClick(brick)}
                        className="w-14 h-14 sm:w-16 sm:h-16 bg-stone-700 border-b-4 border-stone-900 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl font-black text-white shadow-lg active:border-b-0 active:translate-y-1 transition-all"
                      >
                        {brick.char}
                      </motion.button>
                    )
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

        </div>
      )}

      {/* WIN MODAL */}
      {isWin && (
        <div className="fixed inset-0 z-[100] bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-stone-900 border border-stone-800 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl relative"
          >
            <div className="w-20 h-20 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-3xl flex items-center justify-center mx-auto mb-4 animate-bounce">
              <Trophy size={40} />
            </div>
            <h3 className="text-2xl font-black text-white mb-1">คุณทลายกำแพงครบทุกด่าน! 🎉</h3>
            <p className="text-sm text-stone-400 mb-6">เก่งมาก! ทลายกำแพงได้ทั้งหมด {targetWords.length} ด่าน</p>
            
            <div className="bg-stone-800/60 border border-stone-700/60 rounded-2xl p-4 mb-6">
              <div className="text-xs text-stone-400 mb-1">คะแนนรวม</div>
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
        <div className="fixed inset-0 z-[100] bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-stone-900 border border-stone-800 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl relative"
          >
            <div className="w-20 h-20 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <ShieldAlert size={40} />
            </div>
            <h3 className="text-2xl font-black text-white mb-1">กำแพงถล่มใส่! 💥</h3>
            <p className="text-sm text-stone-400 mb-6">หัวใจหมดลงที่ด่าน {currentIndex + 1}</p>
            
            <div className="bg-stone-800/60 border border-stone-700/60 rounded-2xl p-4 mb-6">
              <div className="text-xs text-stone-400 mb-1">คะแนนที่ทำได้</div>
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
