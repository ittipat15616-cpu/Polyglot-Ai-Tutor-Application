import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock, RefreshCw, Trophy, Sparkles, Volume2, CheckCircle2, Zap } from 'lucide-react';
import { VocabWord } from '../../data/vocabData';
import { playTTS } from "../../utils/audio";
import { soundFx } from '../../utils/soundEffects';
import { saveGameStageStars } from '../../services/userPersistence';

interface MatchCard {
  id: string;
  pairId: string; // matches counterpart
  text: string;
  subText?: string;
  side: 'left' | 'right';
  type: 'word' | 'translation';
  isMatched: boolean;
}

interface MatchMasterGameProps {
  vocabList: VocabWord[];
  activeLang: 'EN' | 'CN' | 'TH';
  onBack: () => void;
  timeLimitSeconds?: number;
  stageInfo?: { stageNumber: number; totalStages: number; startIndex: number; endIndex: number; subLevel?: string };
  onNextStage?: () => void;
}

export default function MatchMasterGame({ vocabList, activeLang, onBack, timeLimitSeconds, stageInfo, onNextStage }: MatchMasterGameProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [isWin, setIsWin] = useState<boolean>(false);

  // Cards
  const [leftCards, setLeftCards] = useState<MatchCard[]>([]);
  const [rightCards, setRightCards] = useState<MatchCard[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<MatchCard | null>(null);
  const [selectedRight, setSelectedRight] = useState<MatchCard | null>(null);

  // Stats
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [totalTime, setTotalTime] = useState<number>(0);
  const [matchedCount, setMatchedCount] = useState<number>(0);
  const [wrongPairIds, setWrongPairIds] = useState<string[]>([]);

  // Auto start on stage load
  useEffect(() => {
    if (vocabList && vocabList.length > 0) {
      startGame();
    }
  }, [vocabList, timeLimitSeconds]);

  const speak = (text: string) => playTTS(text, activeLang);

  const startGame = () => {
    if (vocabList.length === 0) return;

    // Use all stage words directly
    const chosenWords = vocabList;

    const left: MatchCard[] = [];
    const right: MatchCard[] = [];

    chosenWords.forEach((wordObj) => {
      const translation = wordObj.translations[0] || wordObj.word;
      const swap = Math.random() < 0.5;

      const cardA: MatchCard = {
        id: `left_${wordObj.id}`,
        pairId: wordObj.id,
        text: swap ? translation : wordObj.word,
        subText: !swap && wordObj.pinyin ? wordObj.pinyin : (!swap && wordObj.phonetic ? wordObj.phonetic : undefined),
        side: 'left',
        type: swap ? 'translation' : 'word',
        isMatched: false,
      };

      const cardB: MatchCard = {
        id: `right_${wordObj.id}`,
        pairId: wordObj.id,
        text: swap ? wordObj.word : translation,
        subText: swap && wordObj.pinyin ? wordObj.pinyin : (swap && wordObj.phonetic ? wordObj.phonetic : undefined),
        side: 'right',
        type: swap ? 'word' : 'translation',
        isMatched: false,
      };

      left.push(cardA);
      right.push(cardB);
    });

    // Shuffle columns independently
    left.sort(() => Math.random() - 0.5);
    right.sort(() => Math.random() - 0.5);

    setLeftCards(left);
    setRightCards(right);
    setSelectedLeft(null);
    setSelectedRight(null);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setMatchedCount(0);
    setWrongPairIds([]);

    const timeAllocated = timeLimitSeconds || (chosenWords.length > 10 ? 80 : 60);
    setTimeLeft(timeAllocated);
    setTotalTime(timeAllocated);

    setIsGameOver(false);
    setIsWin(false);
    setIsPlaying(true);
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
          soundFx.playGameOver();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isPlaying, isGameOver, isWin]);

  // Match evaluation
  const handleSelectLeft = (card: MatchCard) => {
    if (card.isMatched) return;
    if (card.type === 'word') speak(card.text);
    setSelectedLeft(card);
    if (selectedRight) {
      checkMatch(card, selectedRight);
    }
  };

  const handleSelectRight = (card: MatchCard) => {
    if (card.isMatched) return;
    if (card.type === 'word') speak(card.text);
    setSelectedRight(card);
    if (selectedLeft) {
      checkMatch(selectedLeft, card);
    }
  };

  const checkMatch = (left: MatchCard, right: MatchCard) => {
    // Find the original words
    const leftWord = vocabList.find(w => w.id === left.pairId);
    const rightWord = vocabList.find(w => w.id === right.pairId);
    
    // They match if they have the same pairId, OR if their translations are identical, OR if their words are identical (homophones/synonyms fallback)
    const isSamePair = left.pairId === right.pairId;
    const isSameTranslation = leftWord && rightWord && leftWord.translations[0] === rightWord.translations[0];
    const isSameWordText = leftWord && rightWord && leftWord.word.toLowerCase() === rightWord.word.toLowerCase();
    
    if (isSamePair || isSameTranslation || isSameWordText) {
      // MATCH SUCCESS
      soundFx.playCorrect('MATCH');
      const newCombo = combo + 1;
      setCombo(newCombo);
      if (newCombo > maxCombo) setMaxCombo(newCombo);
      setScore((prev) => prev + 100 + newCombo * 20);

      // Mark matched
      setLeftCards((prev) => prev.map((c) => (c.id === left.id ? { ...c, isMatched: true } : c)));
      setRightCards((prev) => prev.map((c) => (c.id === right.id ? { ...c, isMatched: true } : c)));

      const nextMatched = matchedCount + 1;
      setMatchedCount(nextMatched);
      setSelectedLeft(null);
      setSelectedRight(null);

      // Win Check
      if (nextMatched >= leftCards.length) {
        const mistakes = wrongPairIds.length;
        saveGameStageStars('MATCH', stageInfo?.subLevel || activeLang, stageInfo?.stageNumber || 1, mistakes);
        setTimeout(() => {
          setIsWin(true);
          setIsPlaying(false);
          soundFx.playVictory();
        }, 500);
      }
    } else {
      // MATCH FAIL
      soundFx.playWrong('MATCH');
      setCombo(0);
      setWrongPairIds([left.id, right.id]);
      setTimeout(() => {
        setWrongPairIds([]);
        setSelectedLeft(null);
        setSelectedRight(null);
      }, 600);
    }
  };

  const timeProgressPercentage = totalTime > 0 ? (timeLeft / totalTime) * 100 : 0;

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 bg-slate-900 text-white rounded-3xl shadow-2xl relative overflow-hidden border border-slate-800">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-800">
        <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2">
          <ArrowLeft size={20} /> กลับ
        </button>
        <div className="flex items-center gap-4">
          <div className="bg-slate-800 px-4 py-1.5 rounded-full flex items-center gap-2 border border-slate-700">
            <Trophy size={16} className="text-amber-400" />
            <span className="font-mono font-bold text-amber-400">{score}</span>
          </div>
        </div>
      </div>

      {!isPlaying && !isGameOver && !isWin ? (
        /* SETUP / START SCREEN */
        <div className="py-12 px-4 flex flex-col items-center text-center max-w-lg mx-auto">
          <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/30 rounded-3xl flex items-center justify-center text-amber-400 mb-6 shadow-inner">
            <Zap size={40} />
          </div>
          <h3 className="text-2xl font-bold mb-2">เตรียมจับคู่คำศัพท์!</h3>
          <p className="text-sm text-slate-400 mb-8 leading-relaxed">
            เลือกคำศัพท์ฝั่งซ้ายและฝั่งขวาที่ตรงกัน โดยมีเวลาจำกัด! ยิ่งจับคู่ต่อเนื่องยิ่งได้คอมโบโบนัสสูง!
          </p>
          <button
            onClick={startGame}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black py-4 rounded-2xl shadow-xl shadow-amber-500/25 transition-all transform active:scale-95 text-lg flex items-center justify-center gap-2"
          >
            <Sparkles size={20} /> เริ่มเล่นเกม Match Master
          </button>
        </div>
      ) : (
        /* GAMEPLAY BOARD */
        <div className="py-6">
          {/* Progress / Status Bar */}
          <div className="flex items-center justify-between mb-4 bg-slate-800/60 border border-slate-800 p-3 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-lg">
                <Zap size={14} /> คอมโบ: x{combo}
              </div>
              <div className="text-xs text-slate-400 font-medium">
                จับคู่ <span className="text-white font-bold">{matchedCount}</span> / {leftCards.length}
              </div>
            </div>
            {/* Timer Bar */}
            <div className="flex flex-col items-end gap-1 w-1/3 max-w-[150px]">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                <Clock size={14} /> {timeLeft}s
              </div>
              <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${timeLeft <= 10 ? 'bg-rose-500' : 'bg-amber-400'}`}
                  style={{ width: `${timeProgressPercentage}%` }}
                />
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 md:gap-8 min-h-[400px]">
            {/* LEFT COLUMN */}
            <div className="flex flex-col gap-2.5">
              {leftCards.map((card) => {
                const isSelected = selectedLeft?.id === card.id;
                const isWrong = wrongPairIds.includes(card.id);
                const isMatched = card.isMatched;

                return (
                  <button
                    key={card.id}
                    disabled={isMatched}
                    onClick={() => handleSelectLeft(card)}
                    className={`relative w-full p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center min-h-[80px] shadow-sm ${
                      isMatched 
                        ? 'bg-slate-800/40 border-slate-700/50 opacity-50 scale-95 pointer-events-none'
                        : isWrong
                          ? 'bg-rose-950/80 border-rose-500 text-rose-300 animate-[shake_0.5s_ease-in-out]'
                          : isSelected
                            ? 'bg-amber-500/20 border-amber-400 text-amber-100 scale-[1.02] shadow-amber-500/20'
                            : 'bg-slate-800 border-slate-600 hover:border-amber-500/50 hover:bg-slate-700 text-white active:scale-95'
                    }`}
                  >
                    <span className="font-bold text-lg">{card.text}</span>
                    {card.subText && <span className="text-xs text-slate-400 mt-1">{card.subText}</span>}
                    {isMatched && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 rounded-xl backdrop-blur-[2px]">
                        <CheckCircle2 size={32} className="text-emerald-500 drop-shadow-md" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            
            {/* RIGHT COLUMN */}
            <div className="flex flex-col gap-2.5">
              {rightCards.map((card) => {
                const isSelected = selectedRight?.id === card.id;
                const isWrong = wrongPairIds.includes(card.id);
                const isMatched = card.isMatched;

                return (
                  <button
                    key={card.id}
                    disabled={isMatched}
                    onClick={() => handleSelectRight(card)}
                    className={`relative w-full p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center min-h-[80px] shadow-sm ${
                      isMatched 
                        ? 'bg-slate-800/40 border-slate-700/50 opacity-50 scale-95 pointer-events-none'
                        : isWrong
                          ? 'bg-rose-950/80 border-rose-500 text-rose-300 animate-[shake_0.5s_ease-in-out]'
                          : isSelected
                            ? 'bg-amber-500/20 border-amber-400 text-amber-100 scale-[1.02] shadow-amber-500/20'
                            : 'bg-slate-800 border-slate-600 hover:border-amber-500/50 hover:bg-slate-700 text-white active:scale-95'
                    }`}
                  >
                    <span className="font-bold text-lg">{card.text}</span>
                    {card.subText && <span className="text-xs text-slate-400 mt-1">{card.subText}</span>}
                    {isMatched && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 rounded-xl backdrop-blur-[2px]">
                        <CheckCircle2 size={32} className="text-emerald-500 drop-shadow-md" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER MODAL */}
      {isGameOver && (
        <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl"
          >
            <div className="w-20 h-20 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Clock size={40} className="text-rose-500" />
            </div>
            <h2 className="text-3xl font-black text-white mb-2">หมดเวลา!</h2>
            <p className="text-slate-400 mb-8">คุณจับคู่ได้ {matchedCount} คู่</p>
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

      {/* VICTORY MODAL */}
      {isWin && (
        <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl"
          >
            <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trophy size={40} className="text-amber-400" />
            </div>
            <h2 className="text-3xl font-black text-white mb-2">ยอดเยี่ยม!</h2>
            <p className="text-slate-400 mb-6">จับคู่ครบทุกคำศัพท์แล้ว</p>
            <div className="bg-slate-950 rounded-xl p-4 mb-8">
              <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">คะแนนรวม</div>
              <div className="text-4xl font-black text-amber-400">{score}</div>
              <div className="text-xs text-amber-500/70 mt-2">Max Combo: {maxCombo}</div>
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
