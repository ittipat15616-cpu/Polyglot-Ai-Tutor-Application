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
  Key,
  LogIn,
  Zap,
} from 'lucide-react';
import { auth } from '../../firebase';
import { openLoginModal } from '../../services/authHeaders';
import {
  consumeByokFreeQuota,
  getByokQuotaStatus,
  getStoredByokKey,
} from '../../services/byokService';
import {
  deductCredit,
  getTotalCredits,
  loadUserSubscription,
} from '../../services/subscriptionService';
import { translateBasic } from '../../services/translatorService';
import ByokQuotaFallbackModal, { QuotaFallbackReason } from '../ByokQuotaFallbackModal';
import {
  KaraokeLine,
  KaraokeSongData,
  LrcCandidate,
  WordExplainResult,
} from '../../types/karaoke';
import { allCNVocab, allENVocab } from '../../data/vocabData';
import SaveToWordbookButton from '../wordbook/SaveToWordbookButton';
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
  byokNotice?: string | null;
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
  byokNotice,
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
  const [showByokBanner, setShowByokBanner] = useState<boolean>(Boolean(byokNotice));

  // Tap-to-Explain Popover State
  const [wordTapMode, setWordTapMode] = useState<'free' | 'ai'>('free');
  const [selectedWord, setSelectedWord] = useState<{ word: string; lineText: string } | null>(null);
  const [wordExplain, setWordExplain] = useState<WordExplainResult | null>(null);
  const [isWordExplainAi, setIsWordExplainAi] = useState<boolean>(false);
  const [wordExplainNeedsLogin, setWordExplainNeedsLogin] = useState<boolean>(false);
  const [wordExplainNeedsByok, setWordExplainNeedsByok] = useState<boolean>(false);
  const [explainQuota, setExplainQuota] = useState(() => getByokQuotaStatus('karaoke_explain'));
  const wordExplainCacheRef = useRef<Map<string, WordExplainResult>>(new Map());
  const lastAiExplainAtRef = useRef<number>(0);
  const [isExplainingWord, setIsExplainingWord] = useState<boolean>(false);
  const [isSpeakingWord, setIsSpeakingWord] = useState<boolean>(false);
  const [creditFallbackModal, setCreditFallbackModal] = useState<{
    isOpen: boolean;
    reason: QuotaFallbackReason;
    word: string;
    lineText: string;
  } | null>(null);
  const [isCreditFallbackBusy, setIsCreditFallbackBusy] = useState<boolean>(false);

  // Alternative LRC Version Modal
  const [showLrcPicker, setShowLrcPicker] = useState<boolean>(false);
  const [lrcQuery, setLrcQuery] = useState<string>(`${song.title} ${song.artist}`);
  const [lrcCandidates, setLrcCandidates] = useState<LrcCandidate[]>([]);
  const [isLoadingLrc, setIsLoadingLrc] = useState<boolean>(false);
  const [isRetranslatingLrc, setIsRetranslatingLrc] = useState<boolean>(false);

  const isChinese = currentSong.language === 'zh';

  useEffect(() => {
    setShowByokBanner(Boolean(byokNotice));
  }, [byokNotice]);

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

  // Instant local/free lookup helper (0 credit, 0 BYOK quota)
  const fetchFreeWordLookup = async (cleanWord: string, lineText: string) => {
    setWordExplainNeedsLogin(false);
    setWordExplainNeedsByok(false);
    setIsWordExplainAi(false);

    // 1. Check pre-extracted Song Vocab Deck first (instant 0-cost)
    const deckHit = currentSong.vocabDeck?.find(
      (v) => v.word.toLowerCase() === cleanWord.toLowerCase() || v.word.includes(cleanWord)
    );
    if (deckHit) {
      setWordExplain({
        word: deckHit.word,
        reading: deckHit.reading,
        meaningTh: deckHit.meaningTh,
        contextExplanationTh: deckHit.noteTh || 'คำศัพท์เด่นที่พบบ่อยในเพลงนี้ (พจนานุกรมฟรี 0 เครดิต)',
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
        contextExplanationTh: `คำศัพท์ระดับ ${dictHit.level} จากคลังคำศัพท์ในระบบ (พจนานุกรมฟรี 0 เครดิต)`,
      });
      return;
    }

    // 3. Free basic translation lookup (0 Baht, 0 credit, works for any word)
    const freeCacheKey = `free::${currentSong.language}::${cleanWord.toLowerCase()}`;
    const freeCached = wordExplainCacheRef.current.get(freeCacheKey);
    if (freeCached) {
      setWordExplain(freeCached);
      return;
    }

    setIsExplainingWord(true);
    try {
      const detectedWordLang = /[\u4E00-\u9FFF]/.test(cleanWord)
        ? 'CN'
        : /[a-zA-Z]/.test(cleanWord)
        ? 'EN'
        : isChinese
        ? 'CN'
        : 'EN';
      const basicRes = await translateBasic({
        text: cleanWord,
        sourceLang: detectedWordLang,
        targetLang: 'TH',
      });
      const freeResult: WordExplainResult = {
        word: cleanWord,
        reading: basicRes.sourceReading || undefined,
        meaningTh: basicRes.translatedText || cleanWord,
        contextExplanationTh:
          'แปลคำศัพท์แบบพื้นฐานฟรี (0 เครดิต) — กดปุ่ม "ใช้ AI อธิบายลึก" หากต้องการดูคำอธิบายบริบทและสำนวนในท่อนนี้',
      };
      wordExplainCacheRef.current.set(freeCacheKey, freeResult);
      setWordExplain(freeResult);
    } catch {
      setWordExplain({
        word: cleanWord,
        meaningTh: 'ไม่สามารถแปลคำนี้ชั่วคราว',
        contextExplanationTh:
          'กรุณาลองแตะคำนี้อีกครั้ง หรือกด "ใช้ AI อธิบายลึก" เพื่อดูความหมายและบริบทในท่อนเพลงนี้ครับ',
      });
    } finally {
      setIsExplainingWord(false);
    }
  };

  // Handle lyric word tap respecting selected tap mode
  const handleWordTap = (rawWord: string, lineText: string) => {
    const cleanWord = rawWord.replace(/^['".,!?;:()]+|['".,!?;:()]+$/g, '').trim();
    if (!cleanWord) return;
    setSelectedWord({ word: cleanWord, lineText });
    setWordExplain(null);
    setWordExplainNeedsLogin(false);
    setWordExplainNeedsByok(false);
    setIsExplainingWord(false);

    if (wordTapMode === 'ai') {
      // Check cached AI result first; otherwise run AI explain directly
      const aiCacheKey = `ai::${currentSong.language}::${cleanWord.toLowerCase()}::${lineText.trim().slice(0, 60)}`;
      const aiCached = wordExplainCacheRef.current.get(aiCacheKey);
      if (aiCached) {
        setIsWordExplainAi(true);
        setWordExplain(aiCached);
        return;
      }
      void fetchAiWordExplanation(cleanWord, lineText, false);
      return;
    }

    // Free mode: instant dict / free translation (0 credit, 0 BYOK quota)
    void fetchFreeWordLookup(cleanWord, lineText);
  };

  const fetchAiWordExplanation = async (word: string, lineText: string, paidWithCredits = false) => {
    setWordExplainNeedsLogin(false);
    setWordExplainNeedsByok(false);

    if (!auth.currentUser) {
      setWordExplainNeedsLogin(true);
      setIsWordExplainAi(false);
      setWordExplain({
        word,
        meaningTh: 'ต้องเข้าสู่ระบบด้วย Google ก่อนใช้ AI อธิบายคำศัพท์',
        contextExplanationTh:
          'กรุณาเข้าสู่ระบบด้วยบัญชี Google เพื่อเปิดใช้งานผู้ช่วย AI อธิบายบริบทคำศัพท์ (แบบฟรี 0 เครดิตยังใช้งานได้ทันที)',
      });
      return;
    }

    // 1. Instant 0-cost session cache if user tapped the exact same word + line before
    const aiCacheKey = `ai::${currentSong.language}::${word.toLowerCase()}::${lineText.trim().slice(0, 60)}`;
    const cachedHit = wordExplainCacheRef.current.get(aiCacheKey);
    if (cachedHit) {
      setIsWordExplainAi(true);
      setWordExplain(cachedHit);
      setCreditFallbackModal(null);
      return;
    }

    const latestQuota = getByokQuotaStatus('karaoke_explain');
    setExplainQuota(latestQuota);

    if (!paidWithCredits) {
      // Check BYOK availability / daily quota — if missing or exhausted, offer 1-credit fallback modal
      if (!latestQuota.hasKey || !getStoredByokKey()) {
        setWordExplainNeedsByok(true);
        setCreditFallbackModal({
          isOpen: true,
          reason: 'no_byok_credit_confirm',
          word,
          lineText,
        });
        return;
      }

      if (!latestQuota.canUseFree) {
        setCreditFallbackModal({
          isOpen: true,
          reason: 'byok_daily_exhausted',
          word,
          lineText,
        });
        return;
      }

      // Short 2.5s cooldown to keep well below Google 15 RPM limit on free BYOK
      const elapsedMs = Date.now() - lastAiExplainAtRef.current;
      if (elapsedMs < 2500) {
        const waitSec = Math.ceil((2500 - elapsedMs) / 1000);
        setWordExplain({
          word,
          meaningTh: `กรุณารอสักครู่ (${waitSec} วินาที)`,
          contextExplanationTh: 'เว้นจังหวะสั้นๆ เพื่อป้องกันการชนลิมิตความเร็วต่อนาที (RPM) ของคีย์ฟรี Google AI Studio แล้วแตะอีกครั้งได้เลยครับ',
        });
        return;
      }
      lastAiExplainAtRef.current = Date.now();
    } else {
      const sub = await loadUserSubscription();
      if (getTotalCredits(sub) < 1) {
        setCreditFallbackModal({
          isOpen: true,
          reason: 'insufficient_credits',
          word,
          lineText,
        });
        return;
      }
      setIsCreditFallbackBusy(true);
    }

    setIsExplainingWord(true);
    try {
      const res = await explainKaraokeWord(word, lineText, currentSong.language, { paidWithCredits });
      wordExplainCacheRef.current.set(aiCacheKey, res);
      if (paidWithCredits) {
        await deductCredit(1);
      } else {
        await consumeByokFreeQuota('karaoke_explain');
        setExplainQuota(getByokQuotaStatus('karaoke_explain'));
      }
      setIsWordExplainAi(true);
      setWordExplain(res);
      setCreditFallbackModal(null);
    } catch (err: any) {
      if (err?.authRequired || err?.status === 401) {
        setWordExplainNeedsLogin(true);
        setWordExplain({
          word,
          meaningTh: 'ต้องเข้าสู่ระบบด้วย Google ก่อนใช้ AI อธิบายคำศัพท์',
          contextExplanationTh:
            err?.message || 'กรุณาเข้าสู่ระบบด้วยบัญชี Google เพื่อเปิดใช้งานผู้ช่วย AI อธิบายคำศัพท์ครับ',
        });
      } else if (!paidWithCredits && (err?.byokRequired || err?.byokInvalidKey)) {
        setWordExplainNeedsByok(true);
        setCreditFallbackModal({
          isOpen: true,
          reason: 'no_byok_credit_confirm',
          word,
          lineText,
        });
      } else if (!paidWithCredits && (err?.byokQuotaExhausted || err?.status === 429)) {
        setCreditFallbackModal({
          isOpen: true,
          reason: 'byok_google_429',
          word,
          lineText,
        });
      } else {
        setWordExplain({
          word,
          meaningTh: 'ไม่สามารถโหลดคำอธิบาย AI ได้ชั่วคราว',
          contextExplanationTh: err?.message || 'กรุณาลองใหม่อีกครั้ง หรือกดดูแบบพจนานุกรมฟรี (0 เครดิต)',
        });
      }
    } finally {
      setIsExplainingWord(false);
      setIsCreditFallbackBusy(false);
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

    // If many lines lack Thai translation (e.g., switched from a wrong LRC to the correct song), auto-retranslate cleanly (signed-in only)
    if (missingTranslationCount / updatedLines.length > 0.3 && auth.currentUser) {
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

      {/* Live BYOK Remaining Quota Banner after fresh translation */}
      {showByokBanner && byokNotice && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 sm:px-6 py-2 flex items-center justify-between gap-2 text-xs text-emerald-900 font-bold shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Key size={14} className="text-emerald-600 shrink-0" />
            <span className="truncate">{byokNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowByokBanner(false)}
            className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-100 shrink-0"
            aria-label="ปิดแถบแจ้งเตือน"
          >
            <X size={14} />
          </button>
        </div>
      )}

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
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    {wordExplainNeedsLogin ? (
                      <button
                        type="button"
                        onClick={() => openLoginModal()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                      >
                        <LogIn size={13} />
                        <span>เข้าสู่ระบบด้วย Google</span>
                      </button>
                    ) : (
                      <SaveToWordbookButton
                        word={selectedWord.word}
                        lang={isChinese ? 'CN' : 'EN'}
                        meaningTh={wordExplain.meaningTh}
                        reading={wordExplain.reading}
                        example={wordExplain.example || selectedWord.lineText}
                        source="karaoke"
                        sourceLabel={`เพลง ${currentSong.title}`}
                        size="xs"
                        compactLabel
                      />
                    )}

                    {/* Explicit 2-button choice: Free Dict vs AI Context (BYOK or 1 credit) */}
                    <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                      <button
                        type="button"
                        onClick={() => void fetchFreeWordLookup(selectedWord.word, selectedWord.lineText)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                          !isWordExplainAi && !wordExplainNeedsLogin
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                        }`}
                      >
                        <BookOpen size={12} />
                        <span>แบบฟรี (0 เครดิต)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void fetchAiWordExplanation(selectedWord.word, selectedWord.lineText, false)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                          isWordExplainAi
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                            : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                        }`}
                      >
                        <Sparkles size={12} />
                        <span>
                          {explainQuota.hasKey && explainQuota.canUseFree
                            ? `ใช้ AI อธิบายลึก (BYOK ${explainQuota.remaining}/${explainQuota.limit})`
                            : 'ใช้ AI อธิบายลึก (BYOK / 1 เครดิต)'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void fetchFreeWordLookup(selectedWord.word, selectedWord.lineText)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold"
                  >
                    <BookOpen size={12} />
                    <span>ดูแบบฟรี (0 เครดิต)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void fetchAiWordExplanation(selectedWord.word, selectedWord.lineText, false)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-600 text-white text-[11px] font-bold"
                  >
                    <Sparkles size={12} />
                    <span>ใช้ AI อธิบายลึก (BYOK / 1 เครดิต)</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT ZONE: Spacious Lyrics / Quiz / Vocab Studio Panel */}
        <div className="lg:col-span-7 flex-1 min-h-0 flex flex-col bg-white lg:rounded-3xl lg:border border-slate-200 lg:shadow-sm overflow-hidden">
          {/* Mode Switcher Tabs + Tap-to-Explain 2-Button Toggle */}
          <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 flex-1 sm:flex-none">
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

            {mode === 'sing' && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 px-1.5 hidden xl:inline">
                  เมื่อแตะคำ:
                </span>
                <button
                  type="button"
                  onClick={() => setWordTapMode('free')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    wordTapMode === 'free'
                      ? 'bg-white text-emerald-700 shadow-2xs border border-emerald-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BookOpen size={11} />
                  <span>แบบฟรี</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWordTapMode('ai')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    wordTapMode === 'ai'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-indigo-700'
                  }`}
                >
                  <Zap size={11} />
                  <span>ใช้ AI (BYOK / 1 เครดิต)</span>
                </button>
              </div>
            )}
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
                songTitle={currentSong.title}
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

      {/* 1-Credit / BYOK Quota Fallback Modal for Tap-to-Explain */}
      {creditFallbackModal && (
        <ByokQuotaFallbackModal
          isOpen={creditFallbackModal.isOpen}
          onClose={() => {
            if (!isCreditFallbackBusy) setCreditFallbackModal(null);
          }}
          feature="karaoke_explain"
          reason={creditFallbackModal.reason}
          creditCost={1}
          isBusy={isCreditFallbackBusy}
          onUseCredits={() => {
            if (creditFallbackModal) {
              void fetchAiWordExplanation(
                creditFallbackModal.word,
                creditFallbackModal.lineText,
                true
              );
            }
          }}
        />
      )}
    </div>
  );
};

export default KaraokeStudio;
