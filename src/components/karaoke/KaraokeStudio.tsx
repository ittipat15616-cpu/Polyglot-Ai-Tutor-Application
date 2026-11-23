import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Heart,
  Mic,
  Puzzle,
  BookOpen,
  Repeat,
  RotateCcw,
  Volume2,
  X,
  Loader2,
  Sparkles,
  Search,
  SlidersHorizontal,
  Check,
} from 'lucide-react';
import {
  KaraokeLine,
  KaraokeSongData,
  LrcCandidate,
  WordExplainResult,
} from '../../types/karaoke';
import { allCNVocab, allENVocab } from '../../data/vocabData';
import {
  explainKaraokeWord,
  loadSongSyncOffset,
  recordKaraokeHistory,
  saveSongSyncOffset,
  searchAlternativeLrcVersions,
  translateKaraokeSong,
} from '../../services/karaokeService';
import YouTubeKaraokePlayer, { YouTubePlayerHandle } from './YouTubeKaraokePlayer';
import KaraokeLyricsView from './KaraokeLyricsView';
import KaraokeGapFillQuiz from './KaraokeGapFillQuiz';
import KaraokeVocabDeck from './KaraokeVocabDeck';

type StudioMode = 'sing' | 'quiz' | 'vocab';

interface KaraokeStudioProps {
  song: KaraokeSongData;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onBack: () => void;
  onSongUpdated?: (updatedSong: KaraokeSongData) => void;
}

function parseLrcLinesClient(lrcText: string, durationSec = 240): Array<{ timeSec: number; endSec: number; text: string }> {
  const entries: Array<{ timeSec: number; text: string }> = [];
  for (const row of (lrcText || '').split(/\r?\n/)) {
    const matches = [...row.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!matches.length) continue;
    const text = row.replace(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g, '').trim();
    if (!text) continue;
    for (const m of matches) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fracStr = m[3] || '0';
      const frac = fracStr.length === 3 ? parseInt(fracStr, 10) / 1000 : parseInt(fracStr.padEnd(2, '0'), 10) / 100;
      entries.push({ timeSec: Math.round((min * 60 + sec + frac) * 100) / 100, text });
    }
  }
  entries.sort((a, b) => a.timeSec - b.timeSec);
  return entries.map((e, idx) => {
    const next = idx < entries.length - 1 ? entries[idx + 1].timeSec : Math.max(e.timeSec + 4, durationSec);
    return {
      timeSec: e.timeSec,
      endSec: Math.round(Math.max(e.timeSec + 0.8, Math.min(next, e.timeSec + 12)) * 100) / 100,
      text: e.text,
    };
  });
}

export const KaraokeStudio: React.FC<KaraokeStudioProps> = ({
  song,
  isFavorite,
  onToggleFavorite,
  onBack,
  onSongUpdated,
}) => {
  const playerRef = useRef<YouTubePlayerHandle | null>(null);
  const [currentSong, setCurrentSong] = useState<KaraokeSongData>(song);
  const [mode, setMode] = useState<StudioMode>('sing');
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [syncOffsetSec, setSyncOffsetSec] = useState<number>(0);
  const [showThai, setShowThai] = useState<boolean>(true);
  const [showPinyin, setShowPinyin] = useState<boolean>(true);
  const [loopLineIndex, setLoopLineIndex] = useState<number | null>(null);

  // Tap-to-Explain Popover State
  const [selectedWord, setSelectedWord] = useState<{ word: string; lineText: string } | null>(null);
  const [wordExplain, setWordExplain] = useState<WordExplainResult | null>(null);
  const [isExplainingWord, setIsExplainingWord] = useState<boolean>(false);
  const [isSpeakingWord, setIsSpeakingWord] = useState<boolean>(false);

  // Alternative LRC Version Modal
  const [showLrcPicker, setShowLrcPicker] = useState<boolean>(false);
  const [lrcQuery, setLrcQuery] = useState<string>(`${song.title} ${song.artist}`);
  const [lrcCandidates, setLrcCandidates] = useState<LrcCandidate[]>([]);
  const [isLoadingLrc, setIsLoadingLrc] = useState<boolean>(false);
  const [isRetranslatingLrc, setIsRetranslatingLrc] = useState<boolean>(false);

  const isChinese = currentSong.language === 'zh';

  // Load saved per-song sync offset + record history on mount
  useEffect(() => {
    setCurrentSong(song);
    setLoopLineIndex(null);
    setCurrentTimeSec(0);
    setLrcQuery(`${song.title.replace(/\([^)]*\)/g, '').trim()} ${song.artist.replace(/\([^)]*\)/g, '').trim()}`.trim());
    loadSongSyncOffset(song.videoId).then((saved) => setSyncOffsetSec(saved));
    recordKaraokeHistory(song).catch(() => {});
  }, [song.songKey]);

  const effectiveTimeSec = currentTimeSec + syncOffsetSec;

  // Compute active synced lyric line index
  const activeLineIndex = useMemo(() => {
    if (!currentSong.isSynced || currentSong.lines.length === 0) return -1;
    let active = -1;
    for (let i = 0; i < currentSong.lines.length; i++) {
      const t = currentSong.lines[i].timeSec;
      if (t >= 0 && effectiveTimeSec >= t - 0.15) {
        active = i;
      } else if (t > effectiveTimeSec) {
        break;
      }
    }
    return active;
  }, [currentSong.lines, currentSong.isSynced, effectiveTimeSec]);

  // Handle time updates & single-line loop bounce
  const loopLineRef = useRef<number | null>(null);
  loopLineRef.current = loopLineIndex;
  const linesRef = useRef<KaraokeLine[]>(currentSong.lines);
  linesRef.current = currentSong.lines;
  const offsetRef = useRef<number>(syncOffsetSec);
  offsetRef.current = syncOffsetSec;

  const handleTimeUpdate = useCallback((timeSec: number, playing: boolean) => {
    setCurrentTimeSec(timeSec);
    const loopIdx = loopLineRef.current;
    if (playing && loopIdx !== null) {
      const targetLine = linesRef.current[loopIdx];
      if (targetLine && targetLine.timeSec >= 0) {
        const eff = timeSec + offsetRef.current;
        if (eff >= targetLine.endSec - 0.08) {
          const seekTarget = Math.max(0, targetLine.timeSec - offsetRef.current);
          playerRef.current?.seekTo(seekTarget, true);
        }
      }
    }
  }, []);

  const adjustOffset = (delta: number) => {
    setSyncOffsetSec((prev) => {
      const next = Math.round((prev + delta) * 10) / 10;
      saveSongSyncOffset(currentSong.videoId, next);
      return next;
    });
  };

  const resetOffset = () => {
    setSyncOffsetSec(0);
    saveSongSyncOffset(currentSong.videoId, 0);
  };

  const handleLineClick = (line: KaraokeLine) => {
    if (!currentSong.isSynced || line.timeSec < 0) return;
    const seekSec = Math.max(0, line.timeSec - syncOffsetSec);
    playerRef.current?.seekTo(seekSec, true);
  };

  const handleToggleLoopLine = (idx: number) => {
    setLoopLineIndex((prev) => {
      if (prev === idx) return null;
      const line = currentSong.lines[idx];
      if (line && line.timeSec >= 0) {
        playerRef.current?.seekTo(Math.max(0, line.timeSec - syncOffsetSec), true);
      }
      return idx;
    });
  };

  // Instant local lookup before AI Tap-to-Explain
  const handleWordTap = (rawWord: string, lineText: string) => {
    const cleanWord = rawWord.replace(/^['".,!?;:()]+|['".,!?;:()]+$/g, '').trim();
    if (!cleanWord) return;
    setSelectedWord({ word: cleanWord, lineText });
    setWordExplain(null);
    setIsExplainingWord(false);

    // 1. Check pre-extracted Song Vocab Deck first (instant 0-cost)
    const deckHit = currentSong.vocabDeck?.find(
      (v) => v.word.toLowerCase() === cleanWord.toLowerCase() || v.word.includes(cleanWord)
    );
    if (deckHit) {
      setWordExplain({
        word: deckHit.word,
        reading: deckHit.reading,
        meaningTh: deckHit.meaningTh,
        contextExplanationTh: deckHit.noteTh || 'คำศัพท์เด่นที่พบบ่อยในเพลงนี้',
        example: deckHit.exampleLine,
      });
      return;
    }

    // 2. Check app's built-in local dictionary (allCNVocab / allENVocab) — instant 0-cost
    const dict = isChinese ? allCNVocab : allENVocab;
    const dictHit = dict.find((item) => item.word.toLowerCase() === cleanWord.toLowerCase());
    if (dictHit) {
      setWordExplain({
        word: dictHit.word,
        reading: isChinese ? dictHit.pinyin : dictHit.phonetic,
        meaningTh: dictHit.translations.join(', '),
        contextExplanationTh: `คำศัพท์ระดับ ${dictHit.level} จากคลังคำศัพท์ในระบบ`,
      });
      return;
    }

    // 3. Otherwise trigger lightweight AI explanation automatically
    fetchAiWordExplanation(cleanWord, lineText);
  };

  const fetchAiWordExplanation = async (word: string, lineText: string) => {
    setIsExplainingWord(true);
    try {
      const res = await explainKaraokeWord(word, lineText, currentSong.language);
      setWordExplain(res);
    } catch {
      setWordExplain({
        word,
        meaningTh: 'ไม่สามารถโหลดคำอธิบายได้ชั่วคราว',
        contextExplanationTh: 'กรุณาลองแตะอีกครั้งในภายหลังครับ',
      });
    } finally {
      setIsExplainingWord(false);
    }
  };

  const speakTappedWord = async (text: string) => {
    setIsSpeakingWord(true);
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
          const audio = new Audio(`data:audio/mpeg;base64,${data.audio}`);
          audio.onended = () => setIsSpeakingWord(false);
          audio.onerror = () => setIsSpeakingWord(false);
          await audio.play();
          return;
        }
      }
    } catch {}
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = isChinese ? 'zh-CN' : 'en-US';
      u.onend = () => setIsSpeakingWord(false);
      u.onerror = () => setIsSpeakingWord(false);
      window.speechSynthesis.speak(u);
    } catch {
      setIsSpeakingWord(false);
    }
  };

  const handleOpenLrcPicker = async () => {
    setShowLrcPicker(true);
    if (lrcCandidates.length === 0) {
      await handleSearchLrc();
    }
  };

  const handleSearchLrc = async () => {
    if (!lrcQuery.trim()) return;
    setIsLoadingLrc(true);
    try {
      const list = await searchAlternativeLrcVersions(lrcQuery.trim(), '', {
        language: currentSong.language,
        durationSec: currentSong.durationSec,
      });
      setLrcCandidates(list);
    } finally {
      setIsLoadingLrc(false);
    }
  };

  const applyAlternativeLrcTiming = async (cand: LrcCandidate) => {
    if (!cand.syncedLyrics) return;
    const parsed = parseLrcLinesClient(cand.syncedLyrics, cand.duration || currentSong.durationSec);
    if (parsed.length === 0) return;

    // Remap existing Thai translations & Pinyin by matching normalized text first (0 AI cost when lyrics match)
    const existingMap = new Map<string, KaraokeLine>();
    for (const oldLine of currentSong.lines) {
      existingMap.set(oldLine.text.toLowerCase().replace(/\s+/g, ''), oldLine);
    }

    let missingTranslationCount = 0;
    const updatedLines: KaraokeLine[] = parsed.map((p, idx) => {
      const norm = p.text.toLowerCase().replace(/\s+/g, '');
      const matched = existingMap.get(norm);
      const thai = matched?.thaiTranslation || '';
      if (!thai) missingTranslationCount++;
      return {
        index: idx,
        timeSec: p.timeSec,
        endSec: p.endSec,
        text: p.text,
        pinyin: matched?.pinyin,
        thaiTranslation: thai,
      };
    });

    const nextSong: KaraokeSongData = {
      ...currentSong,
      durationSec: cand.duration || currentSong.durationSec,
      isSynced: true,
      lrcSource: 'lrclib',
      lines: updatedLines,
      updatedAt: Date.now(),
    };
    setSyncOffsetSec(0);
    saveSongSyncOffset(currentSong.videoId, 0);
    setCurrentSong(nextSong);
    onSongUpdated?.(nextSong);
    setShowLrcPicker(false);

    // If many lines lack Thai translation (e.g., switched from a wrong LRC to the correct song), auto-retranslate cleanly!
    if (missingTranslationCount / updatedLines.length > 0.3) {
      setIsRetranslatingLrc(true);
      try {
        const result = await translateKaraokeSong({
          resolved: {
            songKey: currentSong.songKey,
            curatedId: currentSong.curatedId,
            videoId: currentSong.videoId,
            alternativeVideoIds: currentSong.alternativeVideoIds || [],
            title: currentSong.title,
            artist: currentSong.artist,
            language: currentSong.language,
            thumbnailUrl: currentSong.thumbnailUrl,
            durationSec: cand.duration || currentSong.durationSec,
            isSynced: true,
            lrcSource: 'lrclib',
            rawLines: parsed.map((p, idx) => ({
              index: idx,
              timeSec: p.timeSec,
              endSec: p.endSec,
              text: p.text,
            })),
            lrcCandidates: [],
          },
          difficulty: currentSong.difficulty,
          useByokQuota: false,
          forceRetranslate: true,
        });
        if (result?.song) {
          setCurrentSong(result.song);
          onSongUpdated?.(result.song);
        }
      } catch (err) {
        console.warn('[Karaoke] Auto-retranslate after LRC switch skipped:', err);
      } finally {
        setIsRetranslatingLrc(false);
      }
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {isRetranslatingLrc && (
        <div className="bg-indigo-600 text-white text-xs font-bold px-4 py-2 flex items-center justify-center gap-2 shrink-0">
          <Loader2 size={14} className="animate-spin" />
          <span>กำลังแปลคำแปลไทย{isChinese ? 'และพินอิน' : ''}สำหรับเวอร์ชันเนื้อเพลงใหม่...</span>
        </div>
      )}
      {/* Top Studio Bar */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors shrink-0"
          >
            <ArrowLeft size={15} />
            <span className="hidden sm:inline">คลังเพลง</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                {currentSong.title}
              </h2>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border shrink-0 ${
                  isChinese
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                }`}
              >
                {isChinese ? 'จีน' : 'อังกฤษ'}
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">{currentSong.artist}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleFavorite}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
              isFavorite
                ? 'bg-rose-50 border-rose-200 text-rose-600'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
            <span className="hidden sm:inline">{isFavorite ? 'เพลงโปรดแล้ว' : 'บันทึกโปรด'}</span>
          </button>
        </div>
      </div>

      {/* Main Two-Zone Studio Workspace */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-5 lg:p-5 overflow-hidden">
        {/* LEFT ZONE: YouTube Video + Sync & Learning Controls */}
        <div className="lg:col-span-5 flex flex-col gap-3 p-3 sm:p-4 lg:p-0 bg-white lg:bg-transparent border-b lg:border-b-0 border-slate-200 shrink-0 lg:overflow-y-auto">
          <YouTubeKaraokePlayer
            ref={playerRef}
            videoId={currentSong.videoId}
            alternativeVideoIds={currentSong.alternativeVideoIds}
            playbackRate={playbackRate}
            onTimeUpdate={handleTimeUpdate}
          />

          {/* Compact Controls Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-3 shadow-2xs">
            {/* Speed + Display Toggles Row */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 mr-1">ความเร็ว:</span>
                {[0.75, 0.85, 1].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setPlaybackRate(rate)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                      playbackRate === rate
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowThai((v) => !v)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                    showThai
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}
                >
                  {showThai ? '✓ แปลไทย' : 'ซ่อนแปลไทย'}
                </button>
                {isChinese && (
                  <button
                    type="button"
                    onClick={() => setShowPinyin((v) => !v)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                      showPinyin
                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    {showPinyin ? '✓ พินอิน' : 'ซ่อนพินอิน'}
                  </button>
                )}
              </div>
            </div>

            {/* Sync Offset Fine-Tuner */}
            {currentSong.isSynced && (
              <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <SlidersHorizontal size={13} className="text-slate-400" />
                  <span className="font-bold text-slate-600">ปรับจังหวะเนื้อเพลง:</span>
                  <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                    {syncOffsetSec > 0 ? `+${syncOffsetSec.toFixed(1)}s` : `${syncOffsetSec.toFixed(1)}s`}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => adjustOffset(-0.5)}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700"
                    title="เนื้อเพลงช้าลง 0.5 วินาที"
                  >
                    -0.5s
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustOffset(-0.1)}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700"
                  >
                    -0.1s
                  </button>
                  {syncOffsetSec !== 0 && (
                    <button
                      type="button"
                      onClick={resetOffset}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500"
                      title="รีเซ็ตจังหวะเป็น 0.0s"
                    >
                      <RotateCcw size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => adjustOffset(0.1)}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700"
                  >
                    +0.1s
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustOffset(0.5)}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700"
                    title="เนื้อเพลงเร็วขึ้น 0.5 วินาที"
                  >
                    +0.5s
                  </button>
                </div>
              </div>
            )}

            {/* Loop Status & Alternative LRC Version Button */}
            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
              {loopLineIndex !== null ? (
                <button
                  type="button"
                  onClick={() => setLoopLineIndex(null)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-bold"
                >
                  <Repeat size={13} />
                  <span>กำลังวนซ้ำบรรทัดที่ {loopLineIndex + 1} (แตะเพื่อปิด)</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={activeLineIndex < 0}
                  onClick={() => activeLineIndex >= 0 && handleToggleLoopLine(activeLineIndex)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-amber-50 border border-slate-200 text-slate-600 hover:text-amber-800 font-semibold disabled:opacity-40 transition-colors"
                >
                  <Repeat size={13} />
                  <span>วนซ้ำท่อนปัจจุบัน</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleOpenLrcPicker}
                className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline"
              >
                เปลี่ยนเวอร์ชันเนื้อเพลง
              </button>
            </div>
          </div>

          {/* Tap-to-Explain Word Card (shown inline on desktop below controls when a word is tapped) */}
          {selectedWord && (
            <div className="bg-white rounded-2xl border-2 border-indigo-200 p-4 shadow-sm space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-extrabold text-slate-900">{selectedWord.word}</span>
                  {wordExplain?.reading && (
                    <span className={`text-xs font-bold ${isChinese ? 'text-rose-600' : 'text-indigo-600'}`}>
                      {wordExplain.reading}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => speakTappedWord(selectedWord.word)}
                    disabled={isSpeakingWord}
                    className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700"
                    title="ฟังเสียงอ่าน"
                  >
                    {isSpeakingWord ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedWord(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {isExplainingWord ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                  <Loader2 size={14} className="animate-spin text-indigo-600" />
                  <span>กำลังอธิบายความหมายในบริบทของเพลง...</span>
                </div>
              ) : wordExplain ? (
                <div className="space-y-1.5 text-xs">
                  <div className="text-sm font-bold text-indigo-900">{wordExplain.meaningTh}</div>
                  <p className="text-slate-600 leading-relaxed">{wordExplain.contextExplanationTh}</p>
                  {wordExplain.example && (
                    <p className="text-slate-500 italic pt-1 border-t border-slate-100">
                      ตัวอย่าง: {wordExplain.example}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => fetchAiWordExplanation(selectedWord.word, selectedWord.lineText)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 pt-1"
                  >
                    <Sparkles size={12} />
                    <span>ให้ AI อธิบายเชิงลึกในท่อนนี้</span>
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* RIGHT ZONE: Spacious Lyrics / Quiz / Vocab Studio Panel */}
        <div className="lg:col-span-7 flex-1 min-h-0 flex flex-col bg-white lg:rounded-3xl lg:border border-slate-200 lg:shadow-sm overflow-hidden">
          {/* Mode Switcher Tabs */}
          <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMode('sing')}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                mode === 'sing'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Mic size={14} />
              <span>ร้องเพลง</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('quiz')}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                mode === 'quiz'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Puzzle size={14} />
              <span>เติมคำ Quiz</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('vocab')}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                mode === 'vocab'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <BookOpen size={14} />
              <span>ศัพท์เด่น ({currentSong.vocabDeck?.length || 0})</span>
            </button>
          </div>

          {/* Active Mode Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {mode === 'sing' && (
              <KaraokeLyricsView
                lines={currentSong.lines}
                language={currentSong.language}
                isSynced={currentSong.isSynced}
                effectiveTimeSec={effectiveTimeSec}
                activeLineIndex={activeLineIndex}
                loopLineIndex={loopLineIndex}
                showThai={showThai}
                showPinyin={showPinyin}
                onLineClick={handleLineClick}
                onToggleLoopLine={handleToggleLoopLine}
                onWordTap={handleWordTap}
              />
            )}

            {mode === 'quiz' && (
              <KaraokeGapFillQuiz
                lines={currentSong.lines}
                language={currentSong.language}
                onSeekToLine={(t) => playerRef.current?.seekTo(Math.max(0, t - syncOffsetSec), true)}
                onQuizComplete={(score, total) => {
                  recordKaraokeHistory(currentSong, { score, total }).catch(() => {});
                }}
              />
            )}

            {mode === 'vocab' && (
              <KaraokeVocabDeck
                vocabDeck={currentSong.vocabDeck || []}
                lines={currentSong.lines}
                language={currentSong.language}
                onSeekToTime={(t) => {
                  setMode('sing');
                  playerRef.current?.seekTo(Math.max(0, t - syncOffsetSec), true);
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Alternative LRC Version Picker Modal */}
      {showLrcPicker && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[82vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">เปลี่ยนเวอร์ชันจังหวะเนื้อเพลง (LRC)</h3>
                <p className="text-xs text-slate-500">เลือกเวอร์ชันที่ความยาวใกล้เคียงกับวิดีโอ YouTube ที่สุด (ฟรี 0 เครดิต)</p>
              </div>
              <button
                type="button"
                onClick={() => setShowLrcPicker(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 flex gap-2">
              <input
                type="text"
                value={lrcQuery}
                onChange={(e) => setLrcQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchLrc()}
                placeholder="พิมพ์ชื่อเพลง + ชื่อนักร้อง..."
                className="flex-1 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={handleSearchLrc}
                disabled={isLoadingLrc}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs inline-flex items-center gap-1.5"
              >
                {isLoadingLrc ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                <span>ค้นหา</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {lrcCandidates.length === 0 && !isLoadingLrc && (
                <p className="text-center text-xs text-slate-400 py-8">ไม่พบเวอร์ชันเนื้อเพลง ลองพิมพ์เฉพาะชื่อเพลงสั้นๆ ครับ</p>
              )}
              {lrcCandidates.map((cand) => (
                <button
                  key={cand.id}
                  type="button"
                  disabled={!cand.hasSynced}
                  onClick={() => applyAlternativeLrcTiming(cand)}
                  className="w-full text-left p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all flex items-center justify-between gap-3 disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">{cand.trackName}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {cand.artistName} {cand.duration ? `• ${Math.floor(cand.duration / 60)}:${String(cand.duration % 60).padStart(2, '0')}` : ''}
                    </div>
                  </div>
                  {cand.hasSynced ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold shrink-0">
                      <Check size={12} /> Synced
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 shrink-0">ไม่ระบุเวลา</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KaraokeStudio;
