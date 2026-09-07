import React, { useState, useMemo, useEffect } from 'react';
import { Gamepad2, Sparkles, Zap, ShieldAlert, CloudRain, KeyRound, Bomb, Trophy, Sliders, Play, Crosshair, ArrowLeft, Layers, Clock, ChevronRight } from 'lucide-react';
import { allCNVocab, allENVocab, VocabWord } from '../data/vocabData';
import { calculateGameStages, GameStage } from '../utils/stageUtils';
import MatchMasterGame from './games/MatchMasterGame';
import WallSmasherGame from './games/WallSmasherGame';
import WordRainGame from './games/WordRainGame';
import WordScrambleGame from './games/WordScrambleGame';
import AudioBombGame from './games/AudioBombGame';
import LaserCannonGame from './games/LaserCannonGame';
import { loadGameStageStars, saveGameStageStars, StageStarRecord } from '../services/userPersistence';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface VocabGamesAreaProps {
  activeLang: 'EN' | 'CN' | 'TH';
}

type GameId = 'NONE' | 'MATCH' | 'WALL' | 'RAIN' | 'SCRAMBLE' | 'BOMB' | 'CANNON';

export default function VocabGamesArea({ activeLang }: VocabGamesAreaProps) {
  const [activeGame, setActiveGame] = useState<GameId>('NONE');
  const [selectedSubLevel, setSelectedSubLevel] = useState<string>('A1');
  const [selectedStage, setSelectedStage] = useState<GameStage | null>(null);
  const [gameStars, setGameStars] = useState<Record<string, StageStarRecord>>({});

  useEffect(() => {
    let isMounted = true;
    async function fetchStars() {
      const map = await loadGameStageStars();
      if (isMounted) setGameStars(map);
    }
    
    // Fetch initially
    fetchStars();
    
    // Listen for auth state changes so if user logs in after mount, we refetch their stars
    const unsubscribe = onAuthStateChanged(auth, () => {
      if (isMounted) fetchStars();
    });
    
    return () => { 
      isMounted = false; 
      unsubscribe();
    };
  }, [activeGame, selectedSubLevel, selectedStage]);

  // Sync default sub-level tab when language changes
  React.useEffect(() => {
    setSelectedSubLevel(activeLang === 'CN' ? 'HSK1' : 'A1');
    setSelectedStage(null);
  }, [activeLang]);

  // Level options
  const subLevelOptions = activeLang === 'CN'
    ? ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'HSK7-9', 'ALL']
    : ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'ALL'];

  // Filter vocabulary by selected sub-level (A1, A2, etc. or ALL)
  const currentSubLevelVocab = useMemo(() => {
    const rawList = activeLang === 'CN' ? allCNVocab : allENVocab;
    if (selectedSubLevel === 'ALL') return rawList;
    return rawList.filter((w) => w.level.toUpperCase() === selectedSubLevel.toUpperCase());
  }, [activeLang, selectedSubLevel]);

  // Calculate stages according to game rules:
  // Match Master: 10 words per stage (final 5-15, >10 -> 80s timer)
  // Other Games: 20 words per stage (final 10-30)
  const isMatchMaster = activeGame === 'MATCH';
  const calculatedStages = useMemo(() => {
    return calculateGameStages(currentSubLevelVocab, isMatchMaster);
  }, [currentSubLevelVocab, isMatchMaster]);

  // Handle selecting a game from main menu
  const handleSelectGame = (gameId: GameId) => {
    setActiveGame(gameId);
    setSelectedStage(null);
  };

  // Handle next stage transition
  const handleNextStage = () => {
    if (!selectedStage) return;
    const nextIdx = calculatedStages.findIndex(s => s.stageNumber === selectedStage.stageNumber) + 1;
    if (nextIdx < calculatedStages.length) {
      setSelectedStage(calculatedStages[nextIdx]);
    } else {
      setSelectedStage(null);
    }
  };

  // RENDER GAME PLAYING MODE
  if (activeGame !== 'NONE' && selectedStage) {
    const stageInfo = {
      stageNumber: selectedStage.stageNumber,
      totalStages: calculatedStages.length,
      startIndex: selectedStage.startIndex,
      endIndex: selectedStage.endIndex,
      subLevel: selectedSubLevel,
    };

    const gameProps = {
      vocabList: selectedStage.words,
      activeLang,
      onBack: () => setSelectedStage(null),
      stageInfo,
      onNextStage: handleNextStage,
    };

    if (activeGame === 'MATCH') {
      return (
        <MatchMasterGame
          {...gameProps}
          timeLimitSeconds={selectedStage.timeLimitSeconds}
        />
      );
    }
    if (activeGame === 'WALL') return <WallSmasherGame {...gameProps} />;
    if (activeGame === 'RAIN') return <WordRainGame {...gameProps} />;
    if (activeGame === 'SCRAMBLE') return <WordScrambleGame {...gameProps} />;
    if (activeGame === 'BOMB') return <AudioBombGame {...gameProps} />;
    if (activeGame === 'CANNON') return <LaserCannonGame {...gameProps} />;
  }

  // RENDER STAGE MAP SELECTION SCREEN (FOR SELECTED GAME)
  if (activeGame !== 'NONE' && !selectedStage) {
    const gameTitles: Record<GameId, { name: string; desc: string; icon: React.ReactNode }> = {
      NONE: { name: '', desc: '', icon: null },
      MATCH: { name: 'Match Master', desc: 'เกมจับคู่คำศัพท์ (ด่านละ 10 คำ • เวลา 60 วินาที)', icon: <Zap className="text-amber-400" /> },
      WALL: { name: 'Wall Smasher', desc: 'เกมพูดออกเสียงทลายกำแพง (ด่านละ 20 คำ)', icon: <ShieldAlert className="text-orange-400" /> },
      RAIN: { name: 'Word Rain', desc: 'เกมฝนคำศัพท์ตกกระทบ (ด่านละ 20 คำ)', icon: <CloudRain className="text-blue-400" /> },
      SCRAMBLE: { name: 'Word Scramble', desc: 'เกมเรียงอักษรคำศัพท์ (ด่านละ 20 คำ)', icon: <KeyRound className="text-emerald-400" /> },
      BOMB: { name: 'Audio Bomb', desc: 'เกมฟังเสียงกู้ระเบิดเวลา (ด่านละ 20 คำ)', icon: <Bomb className="text-purple-400" /> },
      CANNON: { name: 'Laser Cannon Defend', desc: 'เกมพิมพ์คำตอบยิงป้อมเลเซอร์ (ด่านละ 20 คำ)', icon: <Crosshair className="text-cyan-400" /> },
    };

    const currentGameInfo = gameTitles[activeGame];

    return (
      <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 bg-slate-900 text-white rounded-3xl shadow-2xl border border-slate-800">
        {/* Stage Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveGame('NONE')}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl transition-colors border border-slate-700 flex items-center gap-2 text-sm font-medium"
            >
              <ArrowLeft size={18} /> เปลี่ยนเกม
            </button>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                {currentGameInfo.icon} {currentGameInfo.name} — เลือกด่าน
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{currentGameInfo.desc}</p>
            </div>
          </div>

          {/* Sub-Level Tab Filter */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 p-1.5 rounded-2xl border border-slate-700 overflow-x-auto custom-scrollbar">
            {subLevelOptions.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setSelectedSubLevel(lvl)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  selectedSubLevel === lvl
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 scale-105'
                    : 'text-slate-300 hover:bg-slate-700/60'
                }`}
              >
                {lvl === 'ALL' ? 'ทั้งหมด (ALL)' : lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Level Stats Summary Banner */}
        <div className="my-6 p-4 bg-slate-800/50 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Layers size={18} className="text-amber-400" />
            <span>
              ระดับ <strong className="text-amber-400">{selectedSubLevel}</strong> • คำศัพท์ในระดับนี้{' '}
              <strong className="text-white">{currentSubLevelVocab.length}</strong> คำ • ทั้งหมด{' '}
              <strong className="text-amber-400">{calculatedStages.length}</strong> ด่าน
            </span>
          </div>
          {isMatchMaster && (
            <div className="flex items-center gap-1.5 text-slate-400 bg-slate-900 px-3 py-1 rounded-xl border border-slate-700/60 font-mono">
              <Clock size={14} className="text-amber-400" />
              <span>ด่านละ 10 คำ (เวลา 60s / ด่านสุดท้ายที่มี &gt;10 คำ เวลา 80s)</span>
            </div>
          )}
        </div>

        {/* STAGE GRID MAP */}
        <div className="py-2">
          {calculatedStages.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              ไม่พบคำศัพท์ในระดับนี้ กรุณาเลือกระดับอื่น
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
              {calculatedStages.map((stage) => {
                const stageKey = `${activeGame}_${selectedSubLevel}_${stage.stageNumber}`;
                const starRec = gameStars[stageKey];
                const stars = starRec?.stars || 0;

                return (
                  <button
                    key={stage.stageNumber}
                    onClick={() => setSelectedStage(stage)}
                    className={`group bg-slate-800/80 hover:bg-gradient-to-b hover:from-amber-500/20 hover:to-orange-500/20 border transition-all p-4 rounded-2xl text-left flex flex-col justify-between shadow-md relative overflow-hidden active:scale-95 ${
                      stage.isFinalStage
                        ? 'border-amber-500/60 bg-amber-500/10'
                        : 'border-slate-700/80 hover:border-amber-400'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-black uppercase text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                          ด่านที่ {stage.stageNumber}
                        </span>
                        <div className="flex items-center gap-0.5 text-lg font-black">
                          <span className={stars >= 1 ? "text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.8)]" : "text-slate-800 drop-shadow-sm"}>★</span>
                          <span className={stars >= 2 ? "text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.8)]" : "text-slate-800 drop-shadow-sm"}>★</span>
                          <span className={stars >= 3 ? "text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.8)]" : "text-slate-800 drop-shadow-sm"}>★</span>
                        </div>
                      </div>

                      <div className="text-xs font-bold text-slate-200 mt-1">
                        คำที่ {stage.startIndex} - {stage.endIndex}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between pt-2 border-t border-slate-700/60 text-[11px] text-slate-400">
                      <span className="font-semibold">{stage.words.length} คำ</span>
                      {isMatchMaster && stage.timeLimitSeconds && (
                        <span className="text-amber-400 font-mono font-bold">
                          ⏱️ {stage.timeLimitSeconds}s
                        </span>
                      )}
                      <ChevronRight size={14} className="text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // RENDER MAIN GAMES SELECTION MENU
  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 bg-slate-900 text-white rounded-3xl shadow-2xl border border-slate-800">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30">
              <Gamepad2 size={28} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 bg-clip-text text-transparent">
                เกมคำศัพท์ (Vocab Games)
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                ศูนย์รวมมินิเกมฝึกความจำศัพท์สำหรับ {activeLang === 'CN' ? 'ภาษาจีน (HSK)' : 'ภาษาอังกฤษ (IELTS/CEFR)'}
              </p>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-400 bg-slate-800/80 px-4 py-2 rounded-2xl border border-slate-700 flex items-center gap-2">
          <Sparkles size={16} className="text-amber-400" />
          <span>เลือกระดับและเข้าสู่ด่านในเกมที่ต้องการได้เลย!</span>
        </div>
      </div>

      {/* 6 MINI-GAMES GRID */}
      <div className="py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Sparkles size={18} className="text-amber-400" /> เลือกมินิเกมเพื่อเริ่มเลือกด่าน (6 แบบ)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* GAME 1: MATCH MASTER */}
          <div className="group bg-gradient-to-b from-slate-800/90 to-slate-900 border border-slate-700/80 hover:border-amber-500/80 p-6 rounded-3xl transition-all shadow-lg hover:shadow-amber-500/10 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-bl-full pointer-events-none" />
            <div>
              <div className="w-14 h-14 bg-amber-500/20 border border-amber-500/40 rounded-2xl flex items-center justify-center text-amber-400 mb-4 group-hover:scale-110 transition-transform">
                <Zap size={28} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                เกมที่ 1 (จับคู่ • ด่านละ 10 คำ)
              </span>
              <h3 className="text-xl font-black text-white mt-2 mb-1">Match Master</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                จับคู่คำศัพท์และคำแปล 2 ฝั่งให้ตรงกัน แข่งกับเวลามีจำกัดด่านละ 60 วินาที (ด่านละ 10 คำ)
              </p>
            </div>
            <button
              onClick={() => handleSelectGame('MATCH')}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm shadow-md"
            >
              <Play size={16} fill="currentColor" /> เลือกด่าน Match Master
            </button>
          </div>

          {/* GAME 2: WALL SMASHER */}
          <div className="group bg-gradient-to-b from-slate-800/90 to-slate-900 border border-slate-700/80 hover:border-orange-500/80 p-6 rounded-3xl transition-all shadow-lg hover:shadow-orange-500/10 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/10 rounded-bl-full pointer-events-none" />
            <div>
              <div className="w-14 h-14 bg-orange-500/20 border border-orange-500/40 rounded-2xl flex items-center justify-center text-orange-400 mb-4 group-hover:scale-110 transition-transform">
                <ShieldAlert size={28} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded-full border border-orange-500/20">
                เกมที่ 2 (ทลายกำแพง • ด่านละ 20 คำ)
              </span>
              <h3 className="text-xl font-black text-white mt-2 mb-1">Wall Smasher</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                กำแพงขึ้นทีละด่าน พูดออกเสียงตามป้ายคำแนะนำด้านขวาบนเพื่อพังกำแพงลงมา!
              </p>
            </div>
            <button
              onClick={() => handleSelectGame('WALL')}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm shadow-md"
            >
              <Play size={16} fill="currentColor" /> เลือกด่าน Wall Smasher
            </button>
          </div>

          {/* GAME 3: WORD RAIN */}
          <div className="group bg-gradient-to-b from-slate-800/90 to-slate-900 border border-slate-700/80 hover:border-blue-500/80 p-6 rounded-3xl transition-all shadow-lg hover:shadow-blue-500/10 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-bl-full pointer-events-none" />
            <div>
              <div className="w-14 h-14 bg-blue-500/20 border border-blue-500/40 rounded-2xl flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                <CloudRain size={28} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
                เกมที่ 3 (ฝนตกกระทบ • ด่านละ 20 คำ)
              </span>
              <h3 className="text-xl font-black text-white mt-2 mb-1">Word Rain</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                คำศัพท์ลอยร่วงลงมาจากฟ้า เลือกคำแปลที่ถูกต้องให้ทันก่อนร่วงตกพื้น!
              </p>
            </div>
            <button
              onClick={() => handleSelectGame('RAIN')}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm shadow-md"
            >
              <Play size={16} fill="currentColor" /> เลือกด่าน Word Rain
            </button>
          </div>

          {/* GAME 4: WORD SCRAMBLE */}
          <div className="group bg-gradient-to-b from-slate-800/90 to-slate-900 border border-slate-700/80 hover:border-emerald-500/80 p-6 rounded-3xl transition-all shadow-lg hover:shadow-emerald-500/10 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-bl-full pointer-events-none" />
            <div>
              <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
                <KeyRound size={28} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                เกมที่ 4 (เรียงอักษร • ด่านละ 20 คำ)
              </span>
              <h3 className="text-xl font-black text-white mt-2 mb-1">Word Scramble</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                เรียงตัวอักษรที่สลับตำแหน่งให้กลับมาเป็นคำศัพท์ที่ถูกต้อง
              </p>
            </div>
            <button
              onClick={() => handleSelectGame('SCRAMBLE')}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm shadow-md"
            >
              <Play size={16} fill="currentColor" /> เลือกด่าน Word Scramble
            </button>
          </div>

          {/* GAME 5: AUDIO BOMB */}
          <div className="group bg-gradient-to-b from-slate-800/90 to-slate-900 border border-slate-700/80 hover:border-purple-500/80 p-6 rounded-3xl transition-all shadow-lg hover:shadow-purple-500/10 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-bl-full pointer-events-none" />
            <div>
              <div className="w-14 h-14 bg-purple-500/20 border border-purple-500/40 rounded-2xl flex items-center justify-center text-purple-400 mb-4 group-hover:scale-110 transition-transform">
                <Bomb size={28} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-full border border-purple-500/20">
                เกมที่ 5 (กู้ระเบิดเสียง • ด่านละ 20 คำ)
              </span>
              <h3 className="text-xl font-black text-white mt-2 mb-1">Audio Bomb</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                ฟังเสียงอ่านคำศัพท์แล้วกดเลือกสายไฟสีที่ถูกต้องเพื่อกู้ระเบิดก่อนเวลาหมด!
              </p>
            </div>
            <button
              onClick={() => handleSelectGame('BOMB')}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm shadow-md"
            >
              <Play size={16} fill="currentColor" /> เลือกด่าน Audio Bomb
            </button>
          </div>

          {/* GAME 6: LASER CANNON DEFEND */}
          <div className="group bg-gradient-to-b from-slate-800/90 to-slate-900 border border-slate-700/80 hover:border-cyan-500/80 p-6 rounded-3xl transition-all shadow-lg hover:shadow-cyan-500/10 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-bl-full pointer-events-none" />
            <div>
              <div className="w-14 h-14 bg-cyan-500/20 border border-cyan-500/40 rounded-2xl flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-110 transition-transform">
                <Crosshair size={28} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20">
                เกมที่ 6 (พิมพ์ยิงเลเซอร์ • ด่านละ 20 คำ)
              </span>
              <h3 className="text-xl font-black text-white mt-2 mb-1">Laser Cannon Defend</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                ดูคำแปลบนอุกกาบาต พิมพ์คำตอบแล้วยิงเลเซอร์ทำลายเป้าหมายภายใน 15 วินาที!
              </p>
            </div>
            <button
              onClick={() => handleSelectGame('CANNON')}
              className="w-full bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm shadow-md"
            >
              <Play size={16} fill="currentColor" /> เลือกด่าน Laser Cannon
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
