import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Crosshair, Zap, Trophy, RefreshCw, ShieldAlert, Volume2, Shield, Clock } from 'lucide-react';
import { VocabWord } from '../../data/vocabData';
import { playTTS } from "../../utils/audio";
import { soundFx } from '../../utils/soundEffects';
import { saveGameStageStars } from '../../services/userPersistence';
import { areHomophones } from '../../utils/homophones';

interface LaserCannonGameProps {
  vocabList: VocabWord[];
  activeLang: 'EN' | 'CN' | 'TH';
  onBack: () => void;
  stageInfo?: { stageNumber: number; totalStages: number; startIndex: number; endIndex: number; subLevel?: string };
  onNextStage?: () => void;
}

export default function LaserCannonGame({ vocabList, activeLang, onBack, stageInfo, onNextStage }: LaserCannonGameProps) {
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
  const [typedInput, setTypedInput] = useState<string>('');

  const [shieldHp, setShieldHp] = useState<number>(100);
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);

  // 15-second timer per target
  const [timeLeft, setTimeLeft] = useState<number>(15);
  const [firingLaser, setFiringLaser] = useState<boolean>(false);
  const [shakeInput, setShakeInput] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const speak = (text: string) => playTTS(text, activeLang);

  const startGame = () => {
    if (vocabList.length === 0) return;

    const countToUse = vocabList.length;
    const shuffled = [...vocabList].sort(() => Math.random() - 0.5).slice(0, countToUse);
    setTargetWords(shuffled);
    setCurrentIndex(0);
    setShieldHp(100);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setIsGameOver(false);
    setIsWin(false);
    setIsPlaying(true);
    setupRound(0, shuffled);
  };

  const setupRound = (index: number, words: VocabWord[]) => {
    if (index >= words.length) {
      const mistakes = Math.max(0, Math.floor((100 - shieldHp) / 25));
      saveGameStageStars('CANNON', stageInfo?.subLevel || activeLang, stageInfo?.stageNumber || 1, mistakes);
      setIsWin(true);
      setIsPlaying(false);
      soundFx.playVictory();
      return;
    }

    setTypedInput('');
    setTimeLeft(15);
    setFiringLaser(false);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  // Handle player submitting typed answer via Enter or button
  const handleFireCannon = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (firingLaser || !isPlaying || isGameOver || isWin) return;

    const currentWord = targetWords[currentIndex];
    if (!currentWord) return;

    const cleanInput = typedInput.toLowerCase().replace(/\s+|[.,/#!$%^&*;:{}=\-_`~()（）|]/g, '');
    const cleanTarget = currentWord.word.toLowerCase().replace(/\s+|[.,/#!$%^&*;:{}=\-_`~()（）|]/g, '');
    const cleanPinyin = activeLang === 'CN' ? (currentWord.pinyin || '').toLowerCase().replace(/[^a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü0-9]/g, '') : '';

    // Look up if typed word exists in vocabList and is a homophone
    const inputWordObj = vocabList.find(w => w.word.toLowerCase().replace(/\s+|[.,/#!$%^&*;:{}=\-_~()（）|]/g, '') === cleanInput);
    const isPinyinHomophone = activeLang === 'CN' && inputWordObj && inputWordObj.pinyin && currentWord.pinyin && 
       inputWordObj.pinyin.toLowerCase().replace(/[^a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü0-9]/g, '') === cleanPinyin;
       
    const isMatch = cleanInput === cleanTarget 
      || (cleanPinyin && cleanInput === cleanPinyin)
      || areHomophones(cleanInput, cleanTarget)
      || isPinyinHomophone;

    if (isMatch) {
      // SUCCESSFUL LASER HIT!
      setFiringLaser(true);
      soundFx.playCorrect('CANNON');
      speak(currentWord.word);

      const nextCombo = combo + 1;
      setCombo(nextCombo);
      if (nextCombo > maxCombo) setMaxCombo(nextCombo);
      setScore((prev) => prev + 150 + nextCombo * 25);

      setTimeout(() => {
        const nextIdx = currentIndex + 1;
        setCurrentIndex(nextIdx);
        setupRound(nextIdx, targetWords);
      }, 700);
    } else {
      // MISSED TYPING (WRONG SPELLING)
      soundFx.playWrong('CANNON');
      soundFx.playDamage();
      setCombo(0);
      setShakeInput(true);
      setTimeout(() => setShakeInput(false), 500);

      const nextHp = shieldHp - 25;
      setShieldHp(nextHp);

      if (nextHp <= 0) {
        setTimeout(() => {
          setIsGameOver(true);
          setIsPlaying(false);
          soundFx.playGameOver();
        }, 500);
      }
    }
  };

  // 15-second timer per target
  useEffect(() => {
    if (!isPlaying || firingLaser || isGameOver || isWin) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Time expired! Target hits base
          soundFx.playWrong('CANNON');
          soundFx.playDamage();
          setCombo(0);

          setShieldHp((hp) => {
            const nextHp = hp - 25;
            if (nextHp <= 0) {
              setIsGameOver(true);
              setIsPlaying(false);
              soundFx.playGameOver();
            } else {
              const nextIdx = currentIndex + 1;
              setCurrentIndex(nextIdx);
              setupRound(nextIdx, targetWords);
            }
            return nextHp;
          });
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying, firingLaser, isGameOver, isWin, currentIndex, targetWords]);

  const currentObj = targetWords[currentIndex];

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
          <h2 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 bg-clip-text text-transparent flex items-center justify-center gap-2">
            <Crosshair size={24} className="text-cyan-400 animate-spin-slow" /> Laser Cannon Defend
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">เกมพิมพ์คำตอบยิงป้อมเลเซอร์ทลายอุกกาบาต</p>
        </div>

        <div className="bg-slate-800/90 border border-slate-700 px-3.5 py-1.5 rounded-xl flex items-center gap-2">
          <Trophy size={18} className="text-amber-400" />
          <span className="font-mono font-bold text-amber-400">{score}</span>
        </div>
      </div>

      {!isPlaying && !isGameOver && !isWin ? (
        /* START SCREEN */
        <div className="py-12 px-4 flex flex-col items-center text-center max-w-lg mx-auto">
          <div className="w-24 h-24 bg-cyan-500/10 border border-cyan-500/30 rounded-3xl flex items-center justify-center text-cyan-400 mb-6 shadow-inner relative">
            <Crosshair size={48} />
            <div className="absolute -bottom-2 -right-2 bg-cyan-600 text-slate-950 p-2 rounded-full shadow-md animate-bounce">
              <Zap size={18} />
            </div>
          </div>

          <h3 className="text-2xl font-bold mb-2">พิมพ์คำตอบเพื่อยิงเลเซอร์ทำลายอุกกาบาต! ⌨️⚡</h3>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            ดูคำแปลภาษาไทยบนอุกกาบาตที่กำลังเคลื่อนเข้าหาฐาน พิมพ์คำศัพท์ภาษา{activeLang === 'CN' ? 'จีน' : 'อังกฤษ'} แล้วกด Enter ยิงเลเซอร์ทำลายเป้าหมายภายใน 15 วินาที!
          </p>

          <button
            onClick={startGame}
            className="w-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 font-black py-4 rounded-2xl shadow-xl shadow-cyan-500/20 transition-all transform active:scale-95 text-lg flex items-center justify-center gap-2"
          >
            <Zap size={22} /> เริ่มเกมพิมพ์คำตอบยิงเลเซอร์!
          </button>
        </div>
      ) : (
        /* GAMEPLAY BOARD */
        <div className="py-6 flex flex-col items-center">
          {/* Status Header: Shield HP & 15s Timer */}
          <div className="w-full flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                <Shield size={16} className="text-cyan-400" />
                <div className="w-24 bg-slate-800 h-3 rounded-full overflow-hidden border border-slate-700">
                  <div
                    className="bg-gradient-to-r from-cyan-500 to-teal-400 h-full transition-all duration-300"
                    style={{ width: `${shieldHp}%` }}
                  />
                </div>
                <span className="text-xs font-mono font-bold text-cyan-400">{shieldHp}%</span>
              </div>
              {combo > 1 && (
                <span className="text-xs font-black px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg animate-pulse">
                  🔥 {combo} COMBO!
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-xl font-mono font-bold text-sm">
                <Clock size={16} className="animate-spin-slow" /> {timeLeft}s
              </div>
              <div className="text-xs font-bold text-slate-400">
                คำที่ <span className="text-cyan-400 font-mono text-base">{currentIndex + 1}</span> / {targetWords.length}
              </div>
            </div>
          </div>

          {/* MAIN LASER CANNON BATTLEFIELD */}
          <div className="w-full relative min-h-[300px] bg-slate-900/90 border-2 border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-between overflow-hidden shadow-2xl">
            {/* Background Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:32px_32px] opacity-20 pointer-events-none" />

            {/* APPROACHING ASTEROID TARGET (TOP) */}
            <AnimatePresence mode="wait">
              {currentObj && !firingLaser && (
                <motion.div
                  key={currentIndex}
                  initial={{ y: -60, scale: 0.8, opacity: 0 }}
                  animate={{ y: 0, scale: 1, opacity: 1 }}
                  exit={{ scale: 1.3, opacity: 0 }}
                  className="z-20 bg-slate-950 border-2 border-cyan-500/50 p-6 rounded-3xl shadow-[0_0_30px_rgba(6,182,212,0.25)] flex flex-col items-center text-center max-w-md w-full relative"
                >
                  <div className="absolute -top-3 px-3 py-0.5 bg-cyan-500 text-slate-950 text-[10px] font-black rounded-full uppercase tracking-wider shadow-sm">
                    เป้าหมายที่กำลังเข้ามา
                  </div>

                  <h3 className="text-3xl sm:text-4xl font-black text-cyan-300 tracking-wide mt-2 mb-1">
                    {currentObj.translations[0] || currentObj.word}
                  </h3>

                  <div className="flex items-center gap-2 text-slate-400 text-xs mt-1">
                    <span>พิมพ์เป็นภาษา{activeLang === 'CN' ? 'จีน' : 'อังกฤษ'}</span>
                    <button
                      type="button"
                      onClick={() => speak(currentObj.word)}
                      className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full transition-colors"
                      title="ฟังเสียงคำอ่านตัวอย่าง"
                    >
                      <Volume2 size={14} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* FIRING LASER BEAM ANIMATION */}
            {firingLaser && (
              <motion.div
                initial={{ height: 0, opacity: 1 }}
                animate={{ height: '220px', opacity: 1 }}
                exit={{ opacity: 0 }}
                className="z-30 w-3 bg-gradient-to-t from-cyan-500 via-teal-300 to-white shadow-[0_0_30px_#22d3ee] rounded-full my-auto"
              />
            )}

            {/* LASER CANNON TURRET (BOTTOM) */}
            <div className="z-20 flex flex-col items-center mt-6">
              <div className="w-20 h-20 bg-cyan-500/10 border-2 border-cyan-400/60 rounded-full flex items-center justify-center text-cyan-300 shadow-[0_0_25px_rgba(6,182,212,0.3)] relative">
                <Crosshair size={40} className="animate-spin-slow" />
                <div className="absolute w-4 h-4 bg-cyan-400 rounded-full animate-ping" />
              </div>
              <span className="text-[11px] font-bold text-cyan-400/80 mt-2 uppercase tracking-widest">
                ป้อมปืนเลเซอร์ควบคุมสปีด
              </span>
            </div>
          </div>

          {/* INPUT TYPING FORM */}
          <form
            onSubmit={handleFireCannon}
            className={`w-full mt-6 flex gap-3 ${shakeInput ? 'animate-shake' : ''}`}
          >
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={typedInput}
                onChange={(e) => setTypedInput(e.target.value)}
                placeholder={activeLang === 'CN' ? 'พิมพ์คำศัพท์ภาษาจีนหรือ Pinyin ที่นี่...' : 'พิมพ์คำศัพท์ภาษาอังกฤษที่นี่...'}
                disabled={firingLaser}
                className="w-full bg-slate-900 border-2 border-slate-700 focus:border-cyan-400 text-cyan-300 font-mono font-bold text-lg sm:text-xl px-5 py-4 rounded-2xl outline-none transition-all shadow-inner placeholder:text-slate-600 placeholder:text-base placeholder:font-sans"
              />
            </div>

            <button
              type="submit"
              disabled={firingLaser || !typedInput.trim()}
              className="bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 disabled:opacity-40 text-slate-950 font-black px-6 sm:px-8 py-4 rounded-2xl shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2 shrink-0 text-base"
            >
              <Zap size={20} />
              <span>ยิงเลเซอร์</span>
            </button>
          </form>
        </div>
      )}

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

            <h3 className="text-2xl font-black text-white mb-1">ปกป้องป้อมปราการสำเร็จ! 🚀✨</h3>
            <p className="text-sm text-slate-400 mb-6">พิมพ์คำตอบทำลายอุกกาบาตได้ทั้งหมด {targetWords.length} ด่าน</p>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 mb-6 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-400 mb-1">คะแนนรวม</div>
                <div className="text-2xl font-black text-cyan-400">{score}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">คอมโบสูงสุด</div>
                <div className="text-2xl font-black text-emerald-400">x{maxCombo}</div>
              </div>
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
              <ShieldAlert size={40} />
            </div>

            <h3 className="text-2xl font-black text-white mb-1">เกราะพลังงานถูกทำลาย! 💥</h3>
            <p className="text-sm text-slate-400 mb-6">เกราะหมดลงที่ด่าน {currentIndex + 1}</p>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 mb-6">
              <div className="text-xs text-slate-400 mb-1">คะแนนที่คุณทำได้</div>
              <div className="text-3xl font-black text-cyan-400">{score}</div>
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
