import React, { useEffect, useMemo, useState } from 'react';
import {
  Music,
  Search,
  Heart,
  History,
  Play,
  Sparkles,
  Key,
  CheckCircle2,
  Loader2,
  Youtube,
  X,
  SlidersHorizontal,
  Trophy,
  Users,
  Flame,
  Clock,
  Trash2,
  LogIn,
} from 'lucide-react';
import {
  CURATED_SONGS,
  KARAOKE_DIFFICULTY_LABELS,
  KARAOKE_MOOD_LABELS,
} from '../../data/karaoke/curatedSongs';
import {
  CommunityKaraokeSong,
  CuratedSong,
  KaraokeDifficulty,
  KaraokeFavorite,
  KaraokeHistoryItem,
  KaraokeLanguage,
  KaraokeMood,
  KaraokeSongData,
  YouTubeSearchResult,
} from '../../types/karaoke';
import {
  deleteCommunityKaraokeSong,
  loadCommunityKaraokeSongs,
  loadKaraokeFavorites,
  loadKaraokeHistory,
  loadKnownCachedSongKeys,
  makeClientSongCacheKey,
  ResolveKaraokeResult,
  resolveKaraokeSong,
  searchAlternativeLrcVersions,
  searchYouTubeSongs,
  toggleKaraokeFavorite,
  translateKaraokeSong,
} from '../../services/karaokeService';
import {
  consumeByokFreeQuota,
  getByokQuotaStatus,
  getResetTimeLabelThai,
  syncByokDailyUsageWithFirestore,
} from '../../services/byokService';
import { deductCredit } from '../../services/subscriptionService';
import { auth } from '../../firebase';
import { openLoginModal } from '../../services/authHeaders';
import ByokQuotaFallbackModal, { QuotaFallbackReason } from '../ByokQuotaFallbackModal';
import KaraokeStudio from './KaraokeStudio';

interface KaraokeAreaProps {
  activeLang: 'EN' | 'CN' | 'TH';
}

type LobbyTab = 'curated' | 'community' | 'youtube' | 'favorites' | 'history';

const ADMIN_EMAILS = new Set([
  'ittipat15616@gmail.com',
  'weeranan172550@gmail.com',
  'nongrily@gmail.com',
  'mimi.benyapa@gmail.com',
  'tpimlapat69@gmail.com',
]);

function formatDurationBadge(sec?: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  if (!s) return '';
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

interface PendingTranslationJob {
  resolved: NonNullable<ResolveKaraokeResult['resolved']>;
  isCurated: boolean;
  difficulty?: KaraokeDifficulty;
}

export const KaraokeArea: React.FC<KaraokeAreaProps> = ({ activeLang }) => {
  const currentLang: KaraokeLanguage = activeLang === 'CN' ? 'zh' : 'en';
  const isChineseMode = currentLang === 'zh';

  const [lobbyTab, setLobbyTab] = useState<LobbyTab>('curated');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | KaraokeDifficulty>('all');
  const [moodFilter, setMoodFilter] = useState<'all' | KaraokeMood>('all');
  const [communitySort, setCommunitySort] = useState<'newest' | 'popular'>('newest');
  const [searchInput, setSearchInput] = useState('');

  // YouTube search state
  const [ytResults, setYtResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearchingYt, setIsSearchingYt] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);

  // User data & global cache / community library
  const [cachedKeys, setCachedKeys] = useState<Set<string>>(new Set());
  const [communitySongs, setCommunitySongs] = useState<CommunityKaraokeSong[]>([]);
  const [isLoadingCommunity, setIsLoadingCommunity] = useState<boolean>(true);
  const [favorites, setFavorites] = useState<KaraokeFavorite[]>([]);
  const [history, setHistory] = useState<KaraokeHistoryItem[]>([]);

  // Active Studio Song
  const [activeSong, setActiveSong] = useState<KaraokeSongData | null>(null);

  // Loading & Translation Pipeline State
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState<boolean>(false);
  const [studioByokNotice, setStudioByokNotice] = useState<string | null>(null);

  // Manual LRC Retry Modal (if a random YouTube clip had no exact LRCLIB match)
  const [missingLrcJob, setMissingLrcJob] = useState<PendingTranslationJob | null>(null);
  const [manualLrcQuery, setManualLrcQuery] = useState('');
  const [manualLrcBusy, setManualLrcBusy] = useState(false);

  // BYOK Quota & Credit Fallback Modal
  const [byokQuota, setByokQuota] = useState(() => getByokQuotaStatus('karaoke_translate'));
  const [pendingCreditJob, setPendingCreditJob] = useState<PendingTranslationJob | null>(null);
  const [fallbackModal, setFallbackModal] = useState<{ open: boolean; reason: QuotaFallbackReason }>({
    open: false,
    reason: 'no_byok_credit_confirm',
  });

  // Strictly reset workspace when user switches top-bar language (EN <-> CN), matching Lessons/Vocab/MockTests
  useEffect(() => {
    setActiveSong(null);
    setSearchInput('');
    setYtResults([]);
    setYtError(null);
    setLoadError(null);
    setNeedsLogin(false);
    setStudioByokNotice(null);
    setMissingLrcJob(null);
    setDifficultyFilter('all');
    setMoodFilter('all');
    if (lobbyTab === 'youtube') {
      setLobbyTab('curated');
    }
  }, [currentLang]);

  const refreshCommunitySongs = async () => {
    setIsLoadingCommunity(true);
    try {
      const items = await loadCommunityKaraokeSongs();
      setCommunitySongs(items);
      if (items.length > 0) {
        setCachedKeys((prev) => {
          const next = new Set(prev);
          items.forEach((s) => next.add(s.songKey));
          return next;
        });
      }
    } finally {
      setIsLoadingCommunity(false);
    }
  };

  useEffect(() => {
    const refreshQuota = () => setByokQuota(getByokQuotaStatus('karaoke_translate'));
    syncByokDailyUsageWithFirestore().then(refreshQuota);
    loadKnownCachedSongKeys().then(setCachedKeys);
    refreshCommunitySongs();
    loadKaraokeFavorites().then(setFavorites);
    loadKaraokeHistory().then(setHistory);

    window.addEventListener('byok_key_updated', refreshQuota);
    window.addEventListener('byok_quota_updated', refreshQuota);
    return () => {
      window.removeEventListener('byok_key_updated', refreshQuota);
      window.removeEventListener('byok_quota_updated', refreshQuota);
    };
  }, []);

  const isAdminUser = Boolean(auth.currentUser?.email && ADMIN_EMAILS.has(auth.currentUser.email));
  const favoriteKeySet = useMemo(() => new Set(favorites.map((f) => f.songKey)), [favorites]);

  const totalCuratedForLang = useMemo(
    () => CURATED_SONGS.filter((s) => s.language === currentLang).length,
    [currentLang]
  );

  const filteredCuratedSongs = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    return CURATED_SONGS.filter((song) => {
      if (song.language !== currentLang) return false;
      if (difficultyFilter !== 'all' && song.difficulty !== difficultyFilter) return false;
      if (moodFilter !== 'all' && song.mood !== moodFilter) return false;
      if (q) {
        const hay = `${song.title} ${song.artist} ${song.lrcTitle} ${song.lrcArtist} ${song.learningTipTh}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [currentLang, difficultyFilter, moodFilter, searchInput]);

  const langCommunitySongs = useMemo(
    () => communitySongs.filter((song) => song.language === currentLang),
    [communitySongs, currentLang]
  );

  const filteredCommunitySongs = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    const filtered = langCommunitySongs.filter((song) => {
      if (q) {
        const hay = `${song.title} ${song.artist}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) =>
      communitySort === 'popular'
        ? (b.playCount || 0) - (a.playCount || 0) || (b.addedAt || 0) - (a.addedAt || 0)
        : (b.addedAt || 0) - (a.addedAt || 0)
    );
  }, [langCommunitySongs, searchInput, communitySort]);

  const filteredFavorites = useMemo(
    () => favorites.filter((f) => f.language === currentLang),
    [favorites, currentLang]
  );

  const filteredHistory = useMemo(
    () => history.filter((h) => h.language === currentLang),
    [history, currentLang]
  );

  const handleRemoveCommunitySong = async (songKey: string) => {
    const ok = await deleteCommunityKaraokeSong(songKey);
    if (ok) {
      setCommunitySongs((prev) => prev.filter((s) => s.songKey !== songKey));
    }
  };

  const handleToggleFav = async (fav: KaraokeFavorite) => {
    const currentlyFav = favoriteKeySet.has(fav.songKey);
    const nextState = await toggleKaraokeFavorite(fav, currentlyFav);
    setFavorites((prev) =>
      nextState ? [fav, ...prev.filter((x) => x.songKey !== fav.songKey)] : prev.filter((x) => x.songKey !== fav.songKey)
    );
  };

  // Search YouTube directly or resolve pasted YouTube URL
  const handleYouTubeSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = searchInput.trim();
    if (!q) return;

    setLobbyTab('youtube');
    setIsSearchingYt(true);
    setYtError(null);
    try {
      const data = await searchYouTubeSongs(q);
      setYtResults(data.results);
      if (data.isDirectUrl && data.results.length === 1) {
        // User pasted a direct YouTube link -> open it immediately!
        const item = data.results[0];
        openYouTubeSong(item);
      }
    } catch (err: any) {
      setYtError(err?.message || 'ค้นหาเพลงจาก YouTube ไม่สำเร็จ');
    } finally {
      setIsSearchingYt(false);
    }
  };

  // Execute the actual Gemini translation step (either via BYOK free quota, curated free server, or 2 credits)
  const runTranslationJob = async (
    job: PendingTranslationJob,
    mode: 'curated_free' | 'byok_free' | 'paid_credits'
  ) => {
    setLoadError(null);
    setNeedsLogin(false);

    if (!auth.currentUser) {
      setLoadingStage(null);
      setNeedsLogin(true);
      setLoadError('กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้ AI แปลเพลงใหม่หรือใช้สิทธิ์ BYOK ครับ');
      return;
    }

    if (mode === 'paid_credits') {
      const { success } = await deductCredit('karaoke_translate');
      if (!success) {
        setPendingCreditJob(job);
        setFallbackModal({ open: true, reason: 'insufficient_credits' });
        return;
      }
    }

    setLoadingStage('กำลังให้ AI แปลภาษาไทย พินอิน และสกัดคำศัพท์เด่นจากเพลงนี้...');
    try {
      const result = await translateKaraokeSong({
        resolved: job.resolved,
        difficulty: job.difficulty,
        useByokQuota: mode === 'byok_free',
      });

      if (mode === 'byok_free' && !result.cached) {
        await consumeByokFreeQuota('karaoke_translate');
        const nextQuota = getByokQuotaStatus('karaoke_translate');
        setByokQuota(nextQuota);
        setStudioByokNotice(
          `ใช้สิทธิ์ฟรี BYOK แปลเพลงใหม่สำเร็จ (0 เครดิต) • สิทธิ์แปลเพลงใหม่วันนี้เหลือ ${nextQuota.remaining}/${nextQuota.limit} เพลง`
        );
      } else {
        setStudioByokNotice(null);
      }

      setCachedKeys((prev) => {
        const next = new Set(prev);
        next.add(result.song.songKey);
        return next;
      });
      setActiveSong(result.song);
      loadKaraokeHistory().then(setHistory);
      if (!job.isCurated) {
        // Refresh community library in background so newly added synced songs appear right away
        setTimeout(() => {
          refreshCommunitySongs().catch(() => {});
        }, 600);
      }
    } catch (err: any) {
      if (err?.authRequired || (err?.status === 401 && !err?.byokInvalidKey)) {
        setNeedsLogin(true);
        setLoadError(err?.message || 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้ AI แปลเพลงใหม่ครับ');
        return;
      }
      if (mode === 'byok_free' && (err?.byokQuotaExhausted || err?.byokInvalidKey || err?.status === 429)) {
        setPendingCreditJob(job);
        setFallbackModal({ open: true, reason: 'byok_google_429' });
        return;
      }
      setLoadError(err?.message || 'ไม่สามารถแปลเพลงนี้ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoadingStage(null);
    }
  };

  // Decide quota/credit path once song metadata + LRC lines are resolved
  const proceedAfterResolve = async (job: PendingTranslationJob) => {
    // If LRCLIB couldn't find lyrics automatically, invite user to enter a cleaner title/artist
    if (!job.resolved.rawLines || job.resolved.rawLines.length === 0) {
      setLoadingStage(null);
      setMissingLrcJob(job);
      setManualLrcQuery(
        job.resolved.title
          .replace(/\([^)]*\)/g, '')
          .replace(/\[[^\]]*\]/g, '')
          .replace(/official|music video|lyric video|mv|hd|4k/gi, '')
          .trim()
      );
      return;
    }

    // Any uncached song requires AI translation -> require Google Sign-In first
    if (!auth.currentUser) {
      setLoadingStage(null);
      setNeedsLogin(true);
      setLoadError('เพลงนี้ยังไม่เคยแปลในระบบ กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนให้ AI แปลเพลงใหม่หรือใช้สิทธิ์ BYOK ครับ');
      return;
    }

    // Curated 100 songs: ALWAYS FREE for signed-in users (as promised: "คลังเพลงในระบบฟรีทุกคน")
    if (job.isCurated) {
      await runTranslationJob(job, 'curated_free');
      return;
    }

    // Brand-new uncached YouTube song:
    const quota = getByokQuotaStatus('karaoke_translate');
    if (quota.hasKey && quota.canUseFree) {
      await runTranslationJob(job, 'byok_free');
      return;
    }

    setLoadingStage(null);
    setPendingCreditJob(job);
    if (quota.hasKey && !quota.canUseFree) {
      setFallbackModal({ open: true, reason: 'byok_daily_exhausted' });
    } else {
      setFallbackModal({ open: true, reason: 'no_byok_credit_confirm' });
    }
  };

  const openCuratedSong = async (song: CuratedSong) => {
    setLoadError(null);
    setNeedsLogin(false);
    setStudioByokNotice(null);
    setLoadingStage(`กำลังเปิดเพลง "${song.title}"...`);
    try {
      const res = await resolveKaraokeSong({
        curatedId: song.id,
        verifiedVideoId: song.verifiedVideoId,
        backupVideoIds: song.backupVideoIds,
        verifiedLrcId: song.verifiedLrcId,
        title: song.title,
        artist: song.artist,
        searchQuery: song.searchQuery,
        lrcTitle: song.lrcTitle,
        lrcArtist: song.lrcArtist,
        language: song.language,
      });

      if (res.cached && res.song) {
        setCachedKeys((prev) => new Set(prev).add(res.song!.songKey));
        setActiveSong(res.song);
        setLoadingStage(null);
        return;
      }

      if (res.resolved) {
        await proceedAfterResolve({
          resolved: res.resolved,
          isCurated: true,
          difficulty: song.difficulty,
        });
      }
    } catch (err: any) {
      setLoadingStage(null);
      setLoadError(err?.message || 'ไม่สามารถโหลดเพลงนี้ได้ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const openYouTubeSong = async (item: YouTubeSearchResult) => {
    setLoadError(null);
    setNeedsLogin(false);
    setStudioByokNotice(null);
    setLoadingStage(`กำลังค้นหาเนื้อเพลง Synced LRC สำหรับ "${item.title}"...`);
    try {
      const res = await resolveKaraokeSong({
        videoId: item.videoId,
        title: item.title,
        artist: item.artist,
        language: currentLang,
      });

      if (res.cached && res.song) {
        setCachedKeys((prev) => new Set(prev).add(res.song!.songKey));
        setActiveSong(res.song);
        setLoadingStage(null);
        return;
      }

      if (res.resolved) {
        await proceedAfterResolve({
          resolved: res.resolved,
          isCurated: false,
        });
      }
    } catch (err: any) {
      setLoadingStage(null);
      setLoadError(err?.message || 'ไม่สามารถโหลดเพลงนี้ได้ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const openSavedRecord = async (rec: {
    songKey: string;
    curatedId?: string;
    videoId?: string;
    title: string;
    artist: string;
    language: KaraokeLanguage;
  }) => {
    if (rec.curatedId) {
      const found = CURATED_SONGS.find((s) => s.id === rec.curatedId);
      if (found) {
        await openCuratedSong(found);
        return;
      }
    }
    if (rec.videoId) {
      await openYouTubeSong({
        videoId: rec.videoId,
        title: rec.title,
        artist: rec.artist,
        thumbnailUrl: `https://i.ytimg.com/vi/${rec.videoId}/hqdefault.jpg`,
        durationSec: 240,
        durationLabel: '',
      });
    }
  };

  const handleManualLrcSearch = async () => {
    if (!missingLrcJob || !manualLrcQuery.trim()) return;
    setManualLrcBusy(true);
    try {
      const cands = await searchAlternativeLrcVersions(manualLrcQuery.trim(), '', {
        language: missingLrcJob.resolved.language || currentLang,
        durationSec: missingLrcJob.resolved.durationSec,
      });
      const best = cands[0];
      if (!best) {
        setLoadError('ยังไม่พบเนื้อเพลงในฐานข้อมูล LRCLIB ลองพิมพ์เฉพาะชื่อเพลงต้นฉบับภาษาอังกฤษ/จีนครับ');
        return;
      }

      const rawText = best.syncedLyrics || best.plainLyrics || '';
      const isSynced = Boolean(best.syncedLyrics);
      const rawLines = isSynced
        ? rawText
            .split(/\r?\n/)
            .flatMap((row) => {
              const ms = [...row.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
              const text = row.replace(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g, '').trim();
              if (!text || !ms.length) return [];
              return ms.map((m) => {
                const fracStr = m[3] || '0';
                const frac = fracStr.length === 3 ? parseInt(fracStr, 10) / 1000 : parseInt(fracStr.padEnd(2, '0'), 10) / 100;
                return {
                  timeSec: Math.round((parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + frac) * 100) / 100,
                  text,
                };
              });
            })
            .sort((a, b) => a.timeSec - b.timeSec)
            .map((e, idx, arr) => ({
              index: idx,
              timeSec: e.timeSec,
              endSec: idx < arr.length - 1 ? Math.max(e.timeSec + 0.8, Math.min(arr[idx + 1].timeSec, e.timeSec + 12)) : e.timeSec + 5,
              text: e.text,
            }))
        : rawText
            .split(/\r?\n/)
            .map((t) => t.trim())
            .filter(Boolean)
            .map((text, idx) => ({ index: idx, timeSec: -1, endSec: -1, text }));

      const updatedJob: PendingTranslationJob = {
        ...missingLrcJob,
        resolved: {
          ...missingLrcJob.resolved,
          isSynced,
          lrcSource: isSynced ? 'lrclib' : 'plain',
          rawLines,
        },
      };
      setMissingLrcJob(null);
      await proceedAfterResolve(updatedJob);
    } finally {
      setManualLrcBusy(false);
    }
  };

  // Render Studio when a song is open
  if (activeSong) {
    return (
      <KaraokeStudio
        song={activeSong}
        isFavorite={favoriteKeySet.has(activeSong.songKey)}
        byokNotice={studioByokNotice}
        onToggleFavorite={() =>
          handleToggleFav({
            songKey: activeSong.songKey,
            curatedId: activeSong.curatedId,
            videoId: activeSong.videoId,
            title: activeSong.title,
            artist: activeSong.artist,
            language: activeSong.language,
            thumbnailUrl: activeSong.thumbnailUrl,
            addedAt: Date.now(),
          })
        }
        onBack={() => {
          setActiveSong(null);
          setStudioByokNotice(null);
          setByokQuota(getByokQuotaStatus('karaoke_translate'));
          loadKaraokeHistory().then(setHistory);
          refreshCommunitySongs().catch(() => {});
        }}
        onSongUpdated={(updated) => setActiveSong(updated)}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-20">
        {/* Clean Light Hero Header */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 shadow-2xs space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-12 h-12 rounded-2xl text-white flex items-center justify-center shadow-sm shrink-0 ${
                  isChineseMode ? 'bg-rose-600' : 'bg-indigo-600'
                }`}
              >
                <Music size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                    {isChineseMode ? 'คาราโอเกะฝึกภาษาจีน' : 'คาราโอเกะฝึกภาษาอังกฤษ'}
                  </h1>
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold border ${
                      isChineseMode
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    }`}
                  >
                    {isChineseMode ? '🇨🇳 จีน (CN)' : '🇬🇧 อังกฤษ (EN)'}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  {isChineseMode
                    ? 'ร้องตามเพลงจีนจาก YouTube พร้อมเนื้อร้องซิงก์เวลา พินอิน คำแปลไทย เกมเติมคำ และคลังศัพท์เด่นประจำเพลง'
                    : 'ร้องตามเพลงอังกฤษจาก YouTube พร้อมเนื้อร้องซิงก์เวลา คำแปลไทย เกมเติมคำ และคลังศัพท์เด่นประจำเพลง'}
                </p>
              </div>
            </div>

            {/* BYOK / Credit Policy Status Strip */}
            <div
              className={`rounded-2xl border px-4 py-3 flex items-center gap-3 shrink-0 ${
                byokQuota.hasKey
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  byokQuota.hasKey ? 'bg-emerald-600 text-white' : 'bg-indigo-100 text-indigo-600'
                }`}
              >
                {byokQuota.hasKey ? <Key size={18} /> : <Sparkles size={18} />}
              </div>
              <div className="text-xs leading-snug">
                <div className="font-bold">
                  คลัง {totalCuratedForLang} เพลง{isChineseMode ? 'จีน' : 'อังกฤษ'} & เพลงจากชุมชน:{' '}
                  <span className="text-emerald-700">ฟรีทุกคน 100%</span>
                </div>
                {byokQuota.hasKey ? (
                  <div className="text-[11px] text-emerald-800 mt-0.5">
                    BYOK แปลเพลงใหม่วันนี้: <strong>เหลือ {byokQuota.remaining}/{byokQuota.limit} เพลง</strong> (ครบสิทธิ์ใช้ 2 เครดิต/เพลง · รีเซ็ต {getResetTimeLabelThai()})
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>เพิ่มเพลงใหม่จาก YouTube ใช้ 2 เครดิต/เพลง</span>
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent('open-byok-modal'))}
                      className="text-indigo-600 font-bold hover:underline"
                    >
                      หรือเชื่อม BYOK ฟรี {byokQuota.limit} เพลง/วัน
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Search Curated OR Any YouTube Song / URL */}
          <form onSubmit={handleYouTubeSearch} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={
                  isChineseMode
                    ? 'ค้นหาชื่อเพลงจีน / นักร้อง หรือวางลิงก์ YouTube (เช่น 月亮代表我的心, 周杰伦, https://youtu.be/...)'
                    : 'ค้นหาชื่อเพลงอังกฤษ / นักร้อง หรือวางลิงก์ YouTube (เช่น Perfect, Ed Sheeran, https://youtu.be/...)'
                }
                className="w-full pl-10 pr-10 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!searchInput.trim() || isSearchingYt}
              className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm shadow-xs transition-all inline-flex items-center justify-center gap-2 shrink-0"
            >
              {isSearchingYt ? <Loader2 size={17} className="animate-spin" /> : <Youtube size={17} />}
              <span>ค้นหาบน YouTube</span>
            </button>
          </form>

          {loadError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex flex-wrap items-center justify-between gap-2">
              <span className="flex-1 min-w-0">{loadError}</span>
              <div className="flex items-center gap-2 shrink-0">
                {needsLogin && (
                  <button
                    type="button"
                    onClick={() => openLoginModal()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                  >
                    <LogIn size={13} />
                    <span>เข้าสู่ระบบด้วย Google</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setLoadError(null);
                    setNeedsLogin(false);
                  }}
                  className="text-rose-500 hover:text-rose-800"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Tabs (Strictly scoped to top-bar activeLang: EN or CN) */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex bg-white p-1 rounded-2xl border border-slate-200 shadow-2xs overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setLobbyTab('curated')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                lobbyTab === 'curated'
                  ? isChineseMode
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Music size={14} />
              <span>
                {isChineseMode
                  ? `คลังเพลงฮิตจีน (${totalCuratedForLang})`
                  : `คลังเพลงฮิตอังกฤษ (${totalCuratedForLang})`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setLobbyTab('community')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                lobbyTab === 'community' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users size={14} />
              <span>
                เพลงจากชุมชน (ฟรี{langCommunitySongs.length > 0 ? ` · ${langCommunitySongs.length}` : ''})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setLobbyTab('youtube')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                lobbyTab === 'youtube' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Youtube size={14} />
              <span>ค้นหา YouTube {ytResults.length > 0 ? `(${ytResults.length})` : ''}</span>
            </button>
            <button
              type="button"
              onClick={() => setLobbyTab('favorites')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                lobbyTab === 'favorites'
                  ? isChineseMode
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Heart size={14} />
              <span>เพลงโปรด ({filteredFavorites.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setLobbyTab('history')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                lobbyTab === 'history'
                  ? isChineseMode
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History size={14} />
              <span>ประวัติ ({filteredHistory.length})</span>
            </button>
          </div>
        </div>

        {/* CURATED 50-SONG LIBRARY TAB (EN or CN based on top-bar language) */}
        {lobbyTab === 'curated' && (
          <div className="space-y-4">
            {/* Compact Difficulty & Mood Filter Row */}
            <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 text-slate-500 font-bold">
                <SlidersHorizontal size={14} />
                <span>ตัวกรอง:</span>
              </div>

              <select
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">ทุกระดับความยาก</option>
                <option value="beginner">
                  {isChineseMode ? 'ระดับเริ่มต้น (HSK 1–2)' : 'ระดับเริ่มต้น (A1–A2)'}
                </option>
                <option value="intermediate">
                  {isChineseMode ? 'ระดับปานกลาง (HSK 3–4)' : 'ระดับปานกลาง (B1–B2)'}
                </option>
                <option value="advanced">
                  {isChineseMode ? 'ระดับท้าทาย (HSK 5–6)' : 'ระดับท้าทาย (C1)'}
                </option>
              </select>

              <select
                value={moodFilter}
                onChange={(e) => setMoodFilter(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">ทุกแนวเพลง</option>
                {(Object.keys(KARAOKE_MOOD_LABELS) as KaraokeMood[]).map((m) => (
                  <option key={m} value={m}>
                    {KARAOKE_MOOD_LABELS[m].labelTh}
                  </option>
                ))}
              </select>

              <span className="ml-auto text-slate-400 font-medium">
                แสดง {filteredCuratedSongs.length} เพลง
              </span>
            </div>

            {/* Song Grid */}
            {filteredCuratedSongs.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-3">
                <p className="text-sm font-bold text-slate-700">ไม่พบเพลงในคลังแนะนำที่ตรงกับคำค้นหา "{searchInput}"</p>
                <button
                  type="button"
                  onClick={() => handleYouTubeSearch()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                >
                  <Youtube size={15} />
                  <span>ค้นหา "{searchInput}" บน YouTube แทน</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCuratedSongs.map((song) => {
                  const songKey = makeClientSongCacheKey({ curatedId: song.id });
                  const isCached = cachedKeys.has(songKey);
                  const isFav = favoriteKeySet.has(songKey);
                  const diffMeta = KARAOKE_DIFFICULTY_LABELS[song.difficulty];
                  const isZh = song.language === 'zh';

                  return (
                    <div
                      key={song.id}
                      onClick={() => openCuratedSong(song)}
                      className="group bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md p-4 transition-all cursor-pointer flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-extrabold text-xs border ${
                                isZh
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              }`}
                            >
                              {isZh ? 'CN' : 'EN'}
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-indigo-700 transition-colors truncate">
                                {song.title}
                              </h3>
                              <p className="text-xs text-slate-500 truncate">{song.artist}</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFav({
                                songKey,
                                curatedId: song.id,
                                title: song.title,
                                artist: song.artist,
                                language: song.language,
                                addedAt: Date.now(),
                              });
                            }}
                            className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                              isFav
                                ? 'text-rose-500 bg-rose-50'
                                : 'text-slate-300 hover:text-rose-500 hover:bg-slate-50'
                            }`}
                            title={isFav ? 'นำออกจากเพลงโปรด' : 'เพิ่มเป็นเพลงโปรด'}
                          >
                            <Heart size={16} fill={isFav ? 'currentColor' : 'none'} />
                          </button>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                          {song.learningTipTh}
                        </p>
                      </div>

                      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${diffMeta.colorClass}`}>
                            {song.levelBadge}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600">
                            {KARAOKE_MOOD_LABELS[song.mood].labelTh}
                          </span>
                          {isCached && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700">
                              <CheckCircle2 size={11} /> โหลดไว
                            </span>
                          )}
                        </div>

                        <span className="inline-flex items-center gap-1 text-xs font-extrabold text-indigo-600 group-hover:translate-x-0.5 transition-transform shrink-0">
                          <Play size={12} fill="currentColor" />
                          <span>ร้องเลย</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* COMMUNITY LIBRARY TAB (Auto-populated from synced YouTube songs added by users — FREE for everyone) */}
        {lobbyTab === 'community' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <Users size={15} className="text-emerald-600 shrink-0" />
                <span>
                  รวมเพลงจาก YouTube ที่สมาชิกเคยแปลไว้แล้ว (ผ่านเกณฑ์ซิงก์เนื้อร้องครบ) — <strong className="text-emerald-700">เปิดร้องฟรี 100% ทุกคน</strong>
                </span>
              </div>

              <div className="inline-flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setCommunitySort('newest')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 transition-all ${
                    communitySort === 'newest' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Clock size={12} />
                  <span>มาใหม่ล่าสุด</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCommunitySort('popular')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 transition-all ${
                    communitySort === 'popular' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Flame size={12} className="text-amber-500" />
                  <span>ยอดนิยม</span>
                </button>
              </div>
            </div>

            {isLoadingCommunity ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 flex flex-col items-center justify-center text-center gap-3">
                <Loader2 size={26} className="animate-spin text-emerald-600" />
                <p className="text-sm font-bold text-slate-700">กำลังโหลดคลังเพลงจากชุมชน...</p>
              </div>
            ) : filteredCommunitySongs.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
                <Users size={36} className="mx-auto text-slate-300" />
                <p className="text-sm font-bold text-slate-700">
                  {langCommunitySongs.length === 0
                    ? `ยังไม่มีเพลง${isChineseMode ? 'จีน' : 'อังกฤษ'}จากชุมชนในขณะนี้ — มาเป็นคนแรกที่เพิ่มเพลงโปรดจาก YouTube ได้เลย!`
                    : 'ไม่พบเพลงจากชุมชนที่ตรงกับคำค้นหา'}
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  ทุกเพลงจาก YouTube ที่มีเนื้อร้องซิงก์เวลาครบ เมื่อแปลเสร็จระบบจะนำมาเก็บไว้ในคลังชุมชนเพื่อให้ทุกคนเปิดร้องฟรีตลอดไปครับ
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (searchInput.trim()) {
                      handleYouTubeSearch();
                    } else {
                      setLobbyTab('youtube');
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
                >
                  <Youtube size={15} />
                  <span>{searchInput.trim() ? `ค้นหา "${searchInput}" บน YouTube` : 'ไปค้นหาเพลงจาก YouTube'}</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCommunitySongs.map((item) => {
                  const isFav = favoriteKeySet.has(item.songKey);
                  const isZh = item.language === 'zh';
                  const durLabel = formatDurationBadge(item.durationSec);

                  return (
                    <div
                      key={item.songKey}
                      onClick={() =>
                        openYouTubeSong({
                          videoId: item.videoId,
                          title: item.title,
                          artist: item.artist,
                          thumbnailUrl: item.thumbnailUrl,
                          durationSec: item.durationSec,
                          durationLabel: durLabel,
                          isCached: true,
                          cachedSongKey: item.songKey,
                        })
                      }
                      className="group bg-white rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-md overflow-hidden transition-all cursor-pointer flex flex-col"
                    >
                      <div className="relative aspect-video bg-slate-100 overflow-hidden">
                        <img
                          src={item.thumbnailUrl || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                          loading="lazy"
                        />
                        <div className="absolute top-2 left-2 flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold inline-flex items-center gap-1 shadow-2xs">
                            <CheckCircle2 size={11} /> ร้องฟรี
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold shadow-2xs ${
                              isZh ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'
                            }`}
                          >
                            {isZh ? 'CN' : 'EN'}
                          </span>
                        </div>
                        {durLabel && (
                          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-slate-900/80 text-white text-[11px] font-mono font-bold">
                            {durLabel}
                          </span>
                        )}
                      </div>

                      <div className="p-3.5 flex-1 flex flex-col justify-between gap-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-emerald-700 transition-colors line-clamp-1">
                              {item.title}
                            </h3>
                            <p className="text-xs text-slate-500 truncate mt-0.5">{item.artist || 'YouTube'}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleFav({
                                  songKey: item.songKey,
                                  videoId: item.videoId,
                                  title: item.title,
                                  artist: item.artist,
                                  language: item.language,
                                  thumbnailUrl: item.thumbnailUrl,
                                  addedAt: Date.now(),
                                });
                              }}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isFav
                                  ? 'text-rose-500 bg-rose-50'
                                  : 'text-slate-300 hover:text-rose-500 hover:bg-slate-50'
                              }`}
                              title={isFav ? 'นำออกจากเพลงโปรด' : 'เพิ่มเป็นเพลงโปรด'}
                            >
                              <Heart size={15} fill={isFav ? 'currentColor' : 'none'} />
                            </button>
                            {isAdminUser && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveCommunitySong(item.songKey);
                                }}
                                className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="ลบออกจากคลังชุมชน (Admin)"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <div className="flex items-center gap-2">
                            <span>ร้องแล้ว {item.playCount || 1} ครั้ง</span>
                            <span>·</span>
                            <span>{item.lineCount} ท่อน</span>
                          </div>
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700 group-hover:translate-x-0.5 transition-transform shrink-0">
                            <Play size={12} fill="currentColor" />
                            <span>ร้องเลย</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* YOUTUBE SEARCH TAB */}
        {lobbyTab === 'youtube' && (
          <div className="space-y-4">
            {ytError && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {ytError}
              </div>
            )}

            {isSearchingYt ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 flex flex-col items-center justify-center text-center gap-3">
                <Loader2 size={28} className="animate-spin text-indigo-600" />
                <p className="text-sm font-bold text-slate-700">กำลังค้นหาเพลงบน YouTube...</p>
              </div>
            ) : ytResults.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-2">
                <Youtube size={36} className="mx-auto text-slate-300" />
                <p className="text-sm font-bold text-slate-700">พิมพ์ชื่อเพลงหรือวางลิงก์ YouTube ด้านบนแล้วกด "ค้นหาบน YouTube"</p>
                <p className="text-xs text-slate-500">
                  รองรับเพลงอังกฤษและเพลงจีนทุกเพลงบน YouTube พร้อมดึงเนื้อเพลง Synced Lyrics และแปลไทยให้อัตโนมัติ
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ytResults.map((item) => {
                  const songKey = makeClientSongCacheKey({ videoId: item.videoId });
                  const isCached = item.isCached || cachedKeys.has(songKey);
                  return (
                    <div
                      key={item.videoId}
                      onClick={() => openYouTubeSong(item)}
                      className="group bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md overflow-hidden transition-all cursor-pointer flex flex-col"
                    >
                      <div className="relative aspect-video bg-slate-100 overflow-hidden">
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                          loading="lazy"
                        />
                        {item.durationLabel && (
                          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-slate-900/80 text-white text-[11px] font-mono font-bold">
                            {item.durationLabel}
                          </span>
                        )}
                        {isCached && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold inline-flex items-center gap-1">
                            <CheckCircle2 size={11} /> พร้อมร้องฟรี
                          </span>
                        )}
                      </div>
                      <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 line-clamp-2 group-hover:text-indigo-700">
                            {item.title}
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{item.artist}</p>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                          <span className="text-[11px] text-slate-500">
                            {isCached
                              ? 'มีคำแปลในระบบแล้ว (ฟรี)'
                              : byokQuota.canUseFree
                              ? `ฟรีด้วย BYOK (เหลือ ${byokQuota.remaining}/${byokQuota.limit})`
                              : 'แปลเพลงใหม่ 2 เครดิต'}
                          </span>
                          <span className="font-extrabold text-indigo-600 inline-flex items-center gap-1">
                            <Play size={12} fill="currentColor" /> เปิดเลย
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* FAVORITES TAB */}
        {lobbyTab === 'favorites' && (
          <div>
            {filteredFavorites.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-2">
                <Heart size={36} className="mx-auto text-slate-300" />
                <p className="text-sm font-bold text-slate-700">
                  ยังไม่มีเพลงโปรด{isChineseMode ? 'ภาษาจีน' : 'ภาษาอังกฤษ'}
                </p>
                <p className="text-xs text-slate-500">กดรูปหัวใจบนการ์ดเพลงหรือในห้องร้องเพลงเพื่อเก็บไว้ฝึกซ้ำได้ง่ายๆ</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredFavorites.map((fav) => (
                  <div
                    key={fav.songKey}
                    onClick={() => openSavedRecord(fav)}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 p-4 cursor-pointer transition-all flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-slate-900 truncate">{fav.title}</div>
                      <div className="text-xs text-slate-500 truncate">{fav.artist}</div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFav(fav);
                      }}
                      className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 shrink-0"
                    >
                      <Heart size={15} fill="currentColor" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {lobbyTab === 'history' && (
          <div>
            {filteredHistory.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-2">
                <History size={36} className="mx-auto text-slate-300" />
                <p className="text-sm font-bold text-slate-700">
                  ยังไม่มีประวัติการร้องเพลง{isChineseMode ? 'ภาษาจีน' : 'ภาษาอังกฤษ'}
                </p>
                <p className="text-xs text-slate-500">
                  เลือกเพลงจากคลัง {totalCuratedForLang} เพลงฮิต{isChineseMode ? 'จีน' : 'อังกฤษ'}แล้วลองร้องดูได้เลยครับ
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredHistory.map((item) => (
                  <div
                    key={item.songKey}
                    onClick={() => openSavedRecord(item)}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 p-4 cursor-pointer transition-all space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-slate-900 truncate">{item.title}</div>
                        <div className="text-xs text-slate-500 truncate">{item.artist}</div>
                      </div>
                      <span className="text-[11px] font-bold text-indigo-600 shrink-0">ร้อง {item.playCount} ครั้ง</span>
                    </div>
                    {item.bestQuizScore !== undefined && item.bestQuizTotal && (
                      <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                        <Trophy size={11} />
                        <span>Quiz สูงสุด: {item.bestQuizScore}/{item.bestQuizTotal}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading Progress Overlay */}
      {loadingStage && (
        <div className="fixed inset-0 z-[75] bg-white/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-7 max-w-sm w-full space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Loader2 size={28} className="animate-spin" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-900">กำลังเตรียมห้องคาราโอเกะ</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{loadingStage}</p>
            </div>
            <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
              ระบบจะบันทึกคำแปลลงคลังชุมชนอัตโนมัติ เพื่อให้ทุกคนเปิดร้องซ้ำได้ทันทีฟรีตลอดไป!
            </p>
          </div>
        </div>
      )}

      {/* Missing LRC Helper Modal */}
      {missingLrcJob && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">ไม่พบเนื้อเพลงอัตโนมัติจากชื่อคลิป YouTube</h3>
                <p className="text-xs text-slate-500 mt-1">
                  คลิปนี้มีชื่อยาวหรือมีคำเสริม ลองพิมพ์เฉพาะชื่อเพลงและศิลปินสั้นๆ เพื่อให้ระบบดึง Synced Lyrics ได้แม่นยำขึ้นครับ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMissingLrcJob(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              value={manualLrcQuery}
              onChange={(e) => setManualLrcQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualLrcSearch()}
              placeholder="เช่น Perfect Ed Sheeran หรือ 告白气球 周杰伦"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMissingLrcJob(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={manualLrcBusy || !manualLrcQuery.trim()}
                onClick={handleManualLrcSearch}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5"
              >
                {manualLrcBusy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                <span>ค้นหาเนื้อเพลง</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BYOK Exhausted / 429 / Credit Confirmation Modal */}
      <ByokQuotaFallbackModal
        isOpen={fallbackModal.open}
        onClose={() => {
          setFallbackModal((prev) => ({ ...prev, open: false }));
          setPendingCreditJob(null);
        }}
        feature="karaoke_translate"
        reason={fallbackModal.reason}
        creditCost={2}
        isBusy={Boolean(loadingStage)}
        onUseCredits={() => {
          const job = pendingCreditJob;
          setFallbackModal((prev) => ({ ...prev, open: false }));
          setPendingCreditJob(null);
          if (job) {
            runTranslationJob(job, 'paid_credits');
          }
        }}
      />
    </div>
  );
};

export default KaraokeArea;
