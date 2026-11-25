import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  CommunityKaraokeSong,
  KaraokeFavorite,
  KaraokeHistoryItem,
  KaraokeLanguage,
  KaraokeSongData,
  LrcCandidate,
  WordExplainResult,
  YouTubeSearchResult,
} from '../types/karaoke';
import { getStoredByokKey } from './byokService';
import { getFirebaseAuthHeaders } from './authHeaders';

const OFFSET_LOCAL_PREFIX = 'karaoke_sync_offset_v1_';
const CACHED_KEYS_LOCAL = 'karaoke_known_cached_keys_v2';

export function makeClientSongCacheKey(params: { curatedId?: string; videoId?: string }): string {
  if (params.curatedId && /^[a-zA-Z0-9_-]+$/.test(params.curatedId)) {
    return `curated_v2_${params.curatedId}`;
  }
  if (params.videoId && /^[a-zA-Z0-9_-]{6,20}$/.test(params.videoId)) {
    return `yt_${params.videoId}`;
  }
  return `yt_${Date.now()}`;
}

function rememberCachedKeyLocally(songKey: string) {
  try {
    const raw = localStorage.getItem(CACHED_KEYS_LOCAL);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    set.add(songKey);
    localStorage.setItem(CACHED_KEYS_LOCAL, JSON.stringify(Array.from(set).slice(-300)));
  } catch {}
}

export function getLocalKnownCachedKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(CACHED_KEYS_LOCAL);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set<string>();
  }
}

/**
 * Fetch cached song directly from Firestore Global Song Cache (/karaoke_songs/{songKey})
 */
export async function getGlobalCachedSong(songKey: string): Promise<KaraokeSongData | null> {
  if (!db || !songKey) return null;
  try {
    const snap = await getDoc(doc(db, 'karaoke_songs', songKey));
    if (snap.exists()) {
      const data = snap.data() as KaraokeSongData;
      if (data?.videoId && Array.isArray(data.lines) && data.lines.length > 0) {
        rememberCachedKeyLocally(songKey);
        return data;
      }
    }
  } catch (err) {
    console.warn('[Karaoke] Global cache read skipped:', err);
  }
  return null;
}

/**
 * Save translated song into Firestore Global Song Cache (/karaoke_songs/{songKey})
 * so every user gets instant 0-cost playback thereafter.
 */
export async function saveGlobalCachedSong(song: KaraokeSongData): Promise<void> {
  rememberCachedKeyLocally(song.songKey);
  if (!db || !auth.currentUser) return;
  try {
    const payload: Record<string, any> = {
      songKey: song.songKey,
      videoId: song.videoId,
      alternativeVideoIds: (song.alternativeVideoIds || []).slice(0, 5),
      title: song.title.slice(0, 200),
      artist: song.artist.slice(0, 200),
      language: song.language,
      thumbnailUrl: song.thumbnailUrl.slice(0, 400),
      durationSec: Number(song.durationSec) || 240,
      isSynced: Boolean(song.isSynced),
      lrcSource: song.lrcSource || 'lrclib',
      lines: song.lines.slice(0, 180),
      vocabDeck: (song.vocabDeck || []).slice(0, 12),
      cachedAt: song.cachedAt || Date.now(),
      updatedAt: Date.now(),
      createdByUid: auth.currentUser.uid,
    };
    if (song.curatedId) payload.curatedId = song.curatedId;
    if (song.difficulty) payload.difficulty = song.difficulty;

    await setDoc(doc(db, 'karaoke_songs', song.songKey), payload, { merge: true });

    // Auto-publish non-curated YouTube songs that pass quality checks (synced lyrics & >= 8 lines)
    // into the lightweight public Community Library index so everyone can discover & sing them for free!
    if (!song.curatedId && song.isSynced && Array.isArray(song.lines) && song.lines.length >= 8) {
      await publishToCommunityIndex(song);
    }
  } catch (err) {
    console.warn('[Karaoke] Global cache Firestore write skipped:', err);
  }
}

/**
 * Publish or refresh a quality-checked YouTube song in /karaoke_community_index/{songKey}
 */
export async function publishToCommunityIndex(song: KaraokeSongData): Promise<void> {
  if (!db || !auth.currentUser) return;
  if (song.curatedId || !song.isSynced || !Array.isArray(song.lines) || song.lines.length < 8) return;

  try {
    const ref = doc(db, 'karaoke_community_index', song.songKey);
    const existingSnap = await getDoc(ref);
    const now = Date.now();
    const safeDuration = Math.min(1800, Math.max(0, Number(song.durationSec) || 240));
    const safeLineCount = Math.min(200, song.lines.length);
    const safeVocabCount = Math.min(20, (song.vocabDeck || []).length);

    if (existingSnap.exists()) {
      const prev = existingSnap.data() as CommunityKaraokeSong;
      await setDoc(
        ref,
        {
          songKey: prev.songKey,
          videoId: prev.videoId,
          title: song.title.slice(0, 200),
          artist: song.artist.slice(0, 200),
          language: prev.language,
          thumbnailUrl: (song.thumbnailUrl || prev.thumbnailUrl || '').slice(0, 400),
          durationSec: prev.durationSec ?? safeDuration,
          lineCount: safeLineCount,
          vocabCount: safeVocabCount,
          isSynced: true,
          isPublic: prev.isPublic,
          playCount: prev.playCount || 1,
          addedAt: prev.addedAt || now,
          updatedAt: now,
          createdByUid: prev.createdByUid || auth.currentUser.uid,
        },
        { merge: true }
      );
    } else {
      const indexPayload: CommunityKaraokeSong = {
        songKey: song.songKey,
        videoId: song.videoId,
        title: song.title.slice(0, 200),
        artist: song.artist.slice(0, 200),
        language: song.language,
        thumbnailUrl: (song.thumbnailUrl || `https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg`).slice(0, 400),
        durationSec: safeDuration,
        lineCount: safeLineCount,
        vocabCount: safeVocabCount,
        isSynced: true,
        isPublic: true,
        playCount: 1,
        addedAt: now,
        updatedAt: now,
        createdByUid: auth.currentUser.uid,
      };
      await setDoc(ref, indexPayload);
    }
  } catch (err) {
    console.warn('[Karaoke] Community index publish skipped:', err);
  }
}

/**
 * Load lightweight public Community Karaoke songs (explicit isPublic == true query matching security rules)
 */
export async function loadCommunityKaraokeSongs(): Promise<CommunityKaraokeSong[]> {
  if (!db) return [];
  try {
    const q = query(
      collection(db, 'karaoke_community_index'),
      where('isPublic', '==', true),
      limit(80)
    );
    const snap = await getDocs(q);
    const items = snap.docs
      .map((d) => d.data() as CommunityKaraokeSong)
      .filter((item) => item && item.songKey && item.videoId && item.isSynced && item.lineCount >= 8);
    items.forEach((item) => rememberCachedKeyLocally(item.songKey));
    return items.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  } catch (err) {
    console.warn('[Karaoke] Load community songs failed:', err);
    return [];
  }
}

/**
 * Gently increment playCount (+1) on a community song when sung
 */
export async function incrementCommunityPlayCount(songKey: string): Promise<void> {
  if (!db || !auth.currentUser || !songKey || songKey.startsWith('curated_')) return;
  try {
    const ref = doc(db, 'karaoke_community_index', songKey);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const prev = snap.data() as CommunityKaraokeSong;
    await setDoc(
      ref,
      {
        ...prev,
        playCount: (Number(prev.playCount) || 1) + 1,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch {
    // Non-critical analytics update
  }
}

/**
 * Admin moderation: remove a song from the public Community Library listing
 */
export async function deleteCommunityKaraokeSong(songKey: string): Promise<boolean> {
  if (!db || !auth.currentUser || !songKey) return false;
  try {
    await deleteDoc(doc(db, 'karaoke_community_index', songKey));
    return true;
  } catch (err) {
    console.warn('[Karaoke] Delete community song failed:', err);
    return false;
  }
}

/**
 * Load known cached song keys from server memory + local storage + Firestore
 */
export async function loadKnownCachedSongKeys(): Promise<Set<string>> {
  const keys = getLocalKnownCachedKeys();
  try {
    const res = await fetch('/api/karaoke/cached-keys');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.keys)) {
        data.keys.forEach((k: string) => keys.add(k));
      }
    }
  } catch {}
  return keys;
}

// =========================================================================
// User Favorites / History / Sync Offsets (under /users/{uid}/...)
// =========================================================================

export async function loadKaraokeFavorites(): Promise<KaraokeFavorite[]> {
  const uid = auth.currentUser?.uid;
  if (!uid || !db) {
    try {
      const raw = localStorage.getItem('karaoke_favorites_guest');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  try {
    const q = query(
      collection(db, 'users', uid, 'karaoke_favorites'),
      orderBy('addedAt', 'desc'),
      limit(100)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as KaraokeFavorite);
  } catch (err) {
    console.warn('[Karaoke] Load favorites failed:', err);
    return [];
  }
}

export async function toggleKaraokeFavorite(fav: KaraokeFavorite, currentlyFav: boolean): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid || !db) {
    try {
      const raw = localStorage.getItem('karaoke_favorites_guest');
      const list: KaraokeFavorite[] = raw ? JSON.parse(raw) : [];
      const next = currentlyFav
        ? list.filter((x) => x.songKey !== fav.songKey)
        : [fav, ...list.filter((x) => x.songKey !== fav.songKey)];
      localStorage.setItem('karaoke_favorites_guest', JSON.stringify(next));
    } catch {}
    return !currentlyFav;
  }
  try {
    const ref = doc(db, 'users', uid, 'karaoke_favorites', fav.songKey);
    if (currentlyFav) {
      await deleteDoc(ref);
      return false;
    } else {
      await setDoc(ref, { ...fav, addedAt: Date.now() }, { merge: true });
      return true;
    }
  } catch (err) {
    console.warn('[Karaoke] Toggle favorite failed:', err);
    return currentlyFav;
  }
}

export async function loadKaraokeHistory(): Promise<KaraokeHistoryItem[]> {
  const uid = auth.currentUser?.uid;
  if (!uid || !db) {
    try {
      const raw = localStorage.getItem('karaoke_history_guest');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  try {
    const q = query(
      collection(db, 'users', uid, 'karaoke_history'),
      orderBy('lastPlayedAt', 'desc'),
      limit(40)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as KaraokeHistoryItem);
  } catch (err) {
    console.warn('[Karaoke] Load history failed:', err);
    return [];
  }
}

export async function recordKaraokeHistory(
  song: KaraokeSongData,
  quizResult?: { score: number; total: number }
): Promise<void> {
  const uid = auth.currentUser?.uid;
  const baseItem: KaraokeHistoryItem = {
    songKey: song.songKey,
    curatedId: song.curatedId,
    videoId: song.videoId,
    title: song.title,
    artist: song.artist,
    language: song.language,
    thumbnailUrl: song.thumbnailUrl,
    lastPlayedAt: Date.now(),
    playCount: 1,
    ...(quizResult ? { bestQuizScore: quizResult.score, bestQuizTotal: quizResult.total } : {}),
  };

  if (!uid || !db) {
    try {
      const raw = localStorage.getItem('karaoke_history_guest');
      const list: KaraokeHistoryItem[] = raw ? JSON.parse(raw) : [];
      const prev = list.find((x) => x.songKey === song.songKey);
      const merged: KaraokeHistoryItem = {
        ...baseItem,
        playCount: (prev?.playCount || 0) + (quizResult ? 0 : 1),
        bestQuizScore:
          quizResult
            ? Math.max(prev?.bestQuizScore || 0, quizResult.score)
            : prev?.bestQuizScore,
        bestQuizTotal: quizResult ? quizResult.total : prev?.bestQuizTotal,
      };
      const next = [merged, ...list.filter((x) => x.songKey !== song.songKey)].slice(0, 40);
      localStorage.setItem('karaoke_history_guest', JSON.stringify(next));
    } catch {}
    return;
  }

  try {
    const ref = doc(db, 'users', uid, 'karaoke_history', song.songKey);
    const snap = await getDoc(ref);
    const prev = snap.exists() ? (snap.data() as KaraokeHistoryItem) : null;
    const merged: Record<string, any> = {
      songKey: song.songKey,
      videoId: song.videoId,
      title: song.title,
      artist: song.artist,
      language: song.language,
      thumbnailUrl: song.thumbnailUrl,
      lastPlayedAt: Date.now(),
      playCount: (prev?.playCount || 0) + (quizResult ? 0 : 1),
    };
    if (song.curatedId) merged.curatedId = song.curatedId;
    if (quizResult) {
      merged.bestQuizScore = Math.max(prev?.bestQuizScore || 0, quizResult.score);
      merged.bestQuizTotal = quizResult.total;
    } else if (prev?.bestQuizScore !== undefined) {
      merged.bestQuizScore = prev.bestQuizScore;
      merged.bestQuizTotal = prev.bestQuizTotal;
    }
    await setDoc(ref, merged, { merge: true });
    if (!song.curatedId && !quizResult) {
      incrementCommunityPlayCount(song.songKey).catch(() => {});
    }
  } catch (err) {
    console.warn('[Karaoke] Record history failed:', err);
  }
}

export async function loadSongSyncOffset(videoId: string): Promise<number> {
  if (!videoId) return 0;
  let localVal = 0;
  try {
    const raw = localStorage.getItem(`${OFFSET_LOCAL_PREFIX}${videoId}`);
    if (raw !== null) localVal = Number(raw) || 0;
  } catch {}

  const uid = auth.currentUser?.uid;
  if (!uid || !db) return localVal;

  try {
    const snap = await getDoc(doc(db, 'users', uid, 'karaoke_offsets', videoId));
    if (snap.exists()) {
      const val = Number(snap.data()?.offsetSec) || 0;
      localStorage.setItem(`${OFFSET_LOCAL_PREFIX}${videoId}`, String(val));
      return val;
    }
  } catch {}
  return localVal;
}

export async function saveSongSyncOffset(videoId: string, offsetSec: number): Promise<void> {
  if (!videoId) return;
  const rounded = Math.round(offsetSec * 10) / 10;
  try {
    localStorage.setItem(`${OFFSET_LOCAL_PREFIX}${videoId}`, String(rounded));
  } catch {}

  const uid = auth.currentUser?.uid;
  if (!uid || !db) return;
  try {
    await setDoc(
      doc(db, 'users', uid, 'karaoke_offsets', videoId),
      { videoId, offsetSec: rounded, updatedAt: Date.now() },
      { merge: true }
    );
  } catch {}
}

// =========================================================================
// Backend API Calls
// =========================================================================

export async function searchYouTubeSongs(queryText: string): Promise<{
  isDirectUrl: boolean;
  results: YouTubeSearchResult[];
}> {
  const res = await fetch(`/api/karaoke/search?q=${encodeURIComponent(queryText.trim())}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'ค้นหาเพลงไม่สำเร็จ');
  return {
    isDirectUrl: Boolean(data.isDirectUrl),
    results: Array.isArray(data.results) ? data.results : [],
  };
}

export interface ResolveKaraokeResult {
  cached: boolean;
  song?: KaraokeSongData;
  resolved?: {
    songKey: string;
    curatedId?: string;
    videoId: string;
    alternativeVideoIds: string[];
    title: string;
    artist: string;
    language: KaraokeLanguage;
    thumbnailUrl: string;
    durationSec: number;
    isSynced: boolean;
    lrcSource: 'lrclib' | 'plain';
    rawLines: Array<{ index: number; timeSec: number; endSec: number; text: string }>;
    lrcCandidates: LrcCandidate[];
  };
}

export async function resolveKaraokeSong(params: {
  curatedId?: string;
  videoId?: string;
  verifiedVideoId?: string;
  backupVideoIds?: string[];
  verifiedLrcId?: number;
  title?: string;
  artist?: string;
  searchQuery?: string;
  lrcTitle?: string;
  lrcArtist?: string;
  language?: KaraokeLanguage;
}): Promise<ResolveKaraokeResult> {
  // 1. Check Firestore Global Song Cache FIRST (0 latency, 0 AI cost)
  const expectedKey = makeClientSongCacheKey({
    curatedId: params.curatedId,
    videoId: params.videoId,
  });
  if (params.curatedId || params.videoId) {
    const cloudCached = await getGlobalCachedSong(expectedKey);
    if (cloudCached) {
      return { cached: true, song: cloudCached };
    }
  }

  // 2. Call server to resolve YouTube + LRCLIB + check server cache
  const res = await fetch('/api/karaoke/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'ไม่สามารถโหลดข้อมูลเพลงได้');

  if (data.cached && data.song) {
    rememberCachedKeyLocally(data.song.songKey);
    return { cached: true, song: data.song };
  }

  // Also check Firestore using resolved videoId key
  if (data.resolved?.songKey && data.resolved.songKey !== expectedKey) {
    const cloudCached2 = await getGlobalCachedSong(data.resolved.songKey);
    if (cloudCached2) {
      return { cached: true, song: cloudCached2 };
    }
  }

  return data;
}

export async function translateKaraokeSong(params: {
  resolved: NonNullable<ResolveKaraokeResult['resolved']>;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  useByokQuota: boolean;
  forceRetranslate?: boolean;
}): Promise<{ song: KaraokeSongData; cached: boolean; usedByok: boolean }> {
  const byokKey = params.useByokQuota ? getStoredByokKey() : null;
  const res = await fetch('/api/karaoke/translate', {
    method: 'POST',
    headers: await getFirebaseAuthHeaders(),
    body: JSON.stringify({
      ...params.resolved,
      difficulty: params.difficulty,
      useByokQuota: params.useByokQuota,
      byokKey,
      forceRetranslate: Boolean(params.forceRetranslate),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data.error || 'ไม่สามารถแปลเนื้อเพลงได้');
    err.status = res.status;
    err.byokInvalidKey = Boolean(data.byokInvalidKey);
    err.authRequired = Boolean(data.authRequired || (res.status === 401 && !data.byokInvalidKey));
    err.byokQuotaExhausted = Boolean(data.byokQuotaExhausted || res.status === 429);
    throw err;
  }

  if (data.song) {
    // Persist globally to Firestore so ALL future users play this song for free!
    saveGlobalCachedSong(data.song).catch(() => {});
  }
  return data;
}

export async function searchAlternativeLrcVersions(
  title: string,
  artist: string,
  options?: { language?: KaraokeLanguage; durationSec?: number }
): Promise<LrcCandidate[]> {
  const res = await fetch('/api/karaoke/lrc-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      artist,
      language: options?.language,
      durationSec: options?.durationSec,
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.candidates) ? data.candidates : [];
}

export async function explainKaraokeWord(
  word: string,
  lineText: string,
  language: KaraokeLanguage
): Promise<WordExplainResult> {
  const byokKey = getStoredByokKey();
  const res = await fetch('/api/karaoke/explain-word', {
    method: 'POST',
    headers: await getFirebaseAuthHeaders(),
    body: JSON.stringify({ word, lineText, language, byokKey }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data.error || 'ไม่สามารถอธิบายคำศัพท์ได้');
    err.status = res.status;
    err.byokInvalidKey = Boolean(data.byokInvalidKey);
    err.authRequired = Boolean(data.authRequired || (res.status === 401 && !data.byokInvalidKey));
    err.byokRequired = Boolean(data.byokRequired || res.status === 403);
    err.byokQuotaExhausted = Boolean(data.byokQuotaExhausted || res.status === 429);
    throw err;
  }
  return data;
}
