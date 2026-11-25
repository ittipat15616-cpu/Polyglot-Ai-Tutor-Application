import express from "express";
import ytSearch from "yt-search";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import {
  ByokInvalidKeyError,
  ByokQuotaExhaustedError,
  generateContentWithByokFallback,
  isQuotaOrRateLimitError,
  safeParseGeminiJson,
} from "./byokGeminiHelper";
import {
  extractBearerToken,
  requireFirebaseAuth,
  verifyFirebaseIdToken,
} from "./authMiddleware";

export interface RawLyricLine {
  index: number;
  timeSec: number;
  endSec: number;
  text: string;
}

export interface KaraokeSongRecord {
  songKey: string;
  curatedId?: string;
  videoId: string;
  alternativeVideoIds?: string[];
  title: string;
  artist: string;
  language: "en" | "zh";
  difficulty?: "beginner" | "intermediate" | "advanced";
  thumbnailUrl: string;
  durationSec: number;
  isSynced: boolean;
  lrcSource: "lrclib" | "manual" | "plain";
  lines: Array<{
    index: number;
    timeSec: number;
    endSec: number;
    text: string;
    pinyin?: string;
    thaiTranslation: string;
  }>;
  vocabDeck: Array<{
    word: string;
    reading?: string;
    meaningTh: string;
    partOfSpeech?: string;
    exampleLine: string;
    noteTh?: string;
  }>;
  playCount?: number;
  cachedAt: number;
  updatedAt: number;
}

// Fast in-memory server cache (shared across all users until restart; Firestore holds permanent cache)
const karaokeMemoryCache = new Map<string, KaraokeSongRecord>();
const ytResolveCache = new Map<string, { videos: any[]; ts: number }>();

const YT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function makeSongCacheKey(params: { curatedId?: string; videoId?: string }): string {
  if (params.curatedId && /^[a-zA-Z0-9_-]+$/.test(params.curatedId)) {
    return `curated_v2_${params.curatedId}`;
  }
  if (params.videoId && /^[a-zA-Z0-9_-]{6,20}$/.test(params.videoId)) {
    return `yt_${params.videoId}`;
  }
  return `yt_${Date.now()}`;
}

export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = (input || "").trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const match = trimmed.match(re);
    if (match?.[1]) return match[1];
  }
  return null;
}

function stripParentheticalThai(str: string): string {
  return (str || "")
    .replace(/\([^)]*[\u0E00-\u0E7F][^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLanguageFromText(text: string): "en" | "zh" {
  const hanMatches = (text || "").match(/[\u4E00-\u9FFF]/g);
  return hanMatches && hanMatches.length >= 2 ? "zh" : "en";
}

export function parseSyncedLrc(lrcText: string, fallbackDuration = 240): RawLyricLine[] {
  const rawEntries: Array<{ timeSec: number; text: string }> = [];
  const rows = (lrcText || "").split(/\r?\n/);

  for (const row of rows) {
    const timeMatches = [...row.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (timeMatches.length === 0) continue;

    const lyricText = row
      .replace(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g, "")
      .trim();

    if (!lyricText) continue;
    // Skip common LRC metadata headers like "作词 : ..." or "作曲 : ..." only if very early (<2s)
    const isMetaCredit = /^(作词|作曲|编曲|制作人|演唱|词|曲|混音|母带|Lyricist|Composer|Arranger)\s*[:：]/i.test(
      lyricText
    );

    for (const m of timeMatches) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fracStr = m[3] || "0";
      const frac = fracStr.length === 3 ? parseInt(fracStr, 10) / 1000 : parseInt(fracStr.padEnd(2, "0"), 10) / 100;
      const timeSec = Math.round((min * 60 + sec + frac) * 100) / 100;
      if (isMetaCredit && timeSec < 12) continue;
      rawEntries.push({ timeSec, text: lyricText });
    }
  }

  rawEntries.sort((a, b) => a.timeSec - b.timeSec);

  return rawEntries.map((entry, idx) => {
    const nextTime =
      idx < rawEntries.length - 1
        ? rawEntries[idx + 1].timeSec
        : Math.max(entry.timeSec + 4, fallbackDuration);
    const endSec = Math.max(entry.timeSec + 0.8, Math.min(nextTime, entry.timeSec + 12));
    return {
      index: idx,
      timeSec: entry.timeSec,
      endSec: Math.round(endSec * 100) / 100,
      text: entry.text,
    };
  });
}

export function parsePlainLyrics(plainText: string): RawLyricLine[] {
  const rows = (plainText || "")
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  return rows.map((text, idx) => ({
    index: idx,
    timeSec: -1,
    endSec: -1,
    text,
  }));
}

// Traditional -> Simplified Chinese normalization map for accurate cross-script matching
const TRAD_TO_SIMP: Record<string, string> = {
  "倫":"伦","傑":"杰","麗":"丽","華":"华","鄧":"邓","陳":"陈","劉":"刘","張":"张","學":"学",
  "楊":"杨","緯":"纬","謙":"谦","許":"许","蘇":"苏","瀧":"泷","羅":"罗","靜":"静","買":"买",
  "寧":"宁","兒":"儿","婭":"娅","維":"维","榮":"荣","陸":"陆","愛":"爱","賢":"贤","齊":"齐",
  "樹":"树","慶":"庆","話":"话","貓":"猫","後":"后","來":"来","蘋":"苹","對":"对","過":"过",
  "點":"点","氣":"气","運":"运","員":"员","體":"体","風":"风","說":"说","煉":"炼","為":"为",
  "誰":"谁","沒":"没","錯":"错","時":"时","陽":"阳","熱":"热","魚":"鱼","涼":"凉","紅":"红",
  "聲":"声","樂":"乐","夢":"梦","聽":"听","見":"见","兩":"两","個":"个","這":"这","邊":"边",
  "裡":"里","問":"问","動":"动","歡":"欢","給":"给","總":"总","會":"会","讓":"让","從":"从",
  "無":"无","開":"开","關":"关","門":"门","長":"长","頭":"头","髮":"发","電":"电","車":"车",
  "飛":"飞","機":"机","國":"国","書":"书","畫":"画","東":"东","賣":"卖","錢":"钱","詞":"词",
  "憶":"忆","傷":"伤","離":"离","別":"别","淚":"泪","獨":"独","歲":"岁","舊":"旧","戀":"恋",
  "願":"愿","終":"终","遠":"远","還":"还","難":"难","緣":"缘",
};

function toSimplifiedZh(str: string): string {
  return (str || "").split("").map((ch) => TRAD_TO_SIMP[ch] || ch).join("");
}

function normalizeMatchText(str: string): string {
  return toSimplifiedZh(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

const BAD_LRC_VERSION_RE =
  /(\b(remix|live|acoustic|piano|instrumental|karaoke|cover|dj|sped|slowed|nightcore|2\.0|kala|demo|unplugged|concert|mashup|medley|lullaby|music box|8d|ringtone|tv size|short ver)\b|伴奏|翻唱|串烧|纯音乐|钢琴|吉他|现场|remix版|dj版|kala版|合唱版)/i;

const BAD_YT_VIDEO_RE =
  /(\b(slowed|reverb|sped up|nightcore|1 hour|10 hours|piano|instrumental|karaoke|cover|reaction|tutorial|guitar|violin|flute|remix|dj|8d|mashup|medley|live|concert|mtv|unplugged|karaoke version|sing along|no vocals|backing track|shorts|tiktok|lullaby|music box|chipmunk)\b|伴奏|纯音乐|翻唱|钢琴|吉他|现场|演唱会|live版|卡拉ok|去人声|教学|教程|一小时|循环|dj版)/i;

function extractArtistTokens(artist?: string): string[] {
  const tokens = new Set<string>();
  const cleaned = (artist || "")
    .replace(/[()（）]/g, " | ")
    .replace(/\b(ft\.?|feat\.?|official|vevo|topic|channel|music)\b/gi, "|");
  for (const part of cleaned.split(/[|&,/]/)) {
    const t = normalizeMatchText(part);
    if (t.length >= 2) tokens.add(t);
  }
  return Array.from(tokens);
}

function mapLrclibItem(item: any) {
  return {
    id: Number(item.id),
    trackName: item.trackName || "",
    artistName: item.artistName || "",
    albumName: item.albumName || "",
    duration: Math.round(Number(item.duration) || 0),
    hasSynced: Boolean(item.syncedLyrics && item.syncedLyrics.trim().length > 20),
    syncedLyrics: item.syncedLyrics || "",
    plainLyrics: item.plainLyrics || "",
  };
}

async function fetchLrclibById(id: number) {
  if (!id || !Number.isFinite(id) || id <= 0) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(`https://lrclib.net/api/get/${id}`, {
        headers: {
          "User-Agent": "PolyglotAITutor-Karaoke/2.0 (https://aistudio.google.com)",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.status === 429 || resp.status >= 500) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      if (!resp.ok) return null;
      const item: any = await resp.json();
      if (item?.id && (item.syncedLyrics || item.plainLyrics)) {
        return mapLrclibItem(item);
      }
      return null;
    } catch (err) {
      console.warn("[LRCLIB] Direct ID fetch failed:", id, err);
    }
  }
  return null;
}

async function searchLrclibCandidates(
  title: string,
  artist?: string,
  options?: { expectedLanguage?: "en" | "zh"; targetDurationSec?: number }
) {
  const cleanTitle = stripParentheticalThai(title)
    .replace(
      /\b(official|music video|lyric video|lyrics|mv|hd|4k|audio|remastered|ft\.?|feat\.?|taylor'?s version|from the vault|official audio|official video)\b/gi,
      ""
    )
    .replace(/[|•\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleanArtist = stripParentheticalThai(artist || "")
    .replace(/\b(official|vevo|topic|channel|music)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const queriesToTry: string[] = [];
  if (cleanTitle && cleanArtist) {
    queriesToTry.push(`${cleanTitle} ${cleanArtist}`);
  }
  if (cleanTitle) {
    queriesToTry.push(cleanTitle);
  }
  // If title has "Artist - Song", try splitting both ways
  if (title.includes(" - ")) {
    const parts = title.split(" - ").map((s) => stripParentheticalThai(s).trim());
    if (parts[1] && parts[0]) {
      queriesToTry.push(`${parts[1]} ${parts[0]}`);
      queriesToTry.push(parts[1]);
    }
  }

  const seenIds = new Set<number>();
  const allCandidates: any[] = [];

  // 1. Try exact track_name + artist_name lookup first when both are available
  if (cleanTitle && cleanArtist) {
    try {
      const getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(
        cleanTitle
      )}&artist_name=${encodeURIComponent(cleanArtist)}`;
      const resp = await fetch(getUrl, {
        headers: {
          "User-Agent": "PolyglotAITutor-Karaoke/2.0 (https://aistudio.google.com)",
        },
        signal: AbortSignal.timeout(7000),
      });
      if (resp.ok) {
        const item: any = await resp.json();
        if (item?.id && (item.syncedLyrics || item.plainLyrics)) {
          seenIds.add(Number(item.id));
          allCandidates.push(mapLrclibItem(item));
        }
      }
    } catch {}
  }

  // 2. Search across up to 2 distinct queries to gather full studio candidates
  const uniqueQueries = Array.from(new Set(queriesToTry.filter(Boolean))).slice(0, 2);
  for (const q of uniqueQueries) {
    try {
      const url = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "PolyglotAITutor-Karaoke/2.0 (https://aistudio.google.com)",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) continue;
      const list = (await resp.json()) as any[];
      if (!Array.isArray(list)) continue;

      for (const item of list) {
        if (!item?.id || seenIds.has(Number(item.id))) continue;
        if (!item.syncedLyrics && !item.plainLyrics) continue;
        seenIds.add(Number(item.id));
        allCandidates.push(mapLrclibItem(item));
      }
    } catch (err) {
      console.warn("[LRCLIB] Search failed for query:", q, err);
    }
  }

  // 3. Multi-factor scoring: title similarity + artist alias (Simp/Trad/EN) + language + duration + version cleanliness
  const normExpectedTitle = normalizeMatchText(cleanTitle);
  const artistTokens = extractArtistTokens(artist);
  const expectedLang = options?.expectedLanguage;
  const targetDur = options?.targetDurationSec && options.targetDurationSec > 30 ? options.targetDurationSec : 0;

  const scored = allCandidates.map((c) => {
    const lyricText = c.syncedLyrics || c.plainLyrics || "";
    const lyricLines = lyricText
      .split(/\r?\n/)
      .filter((l: string) => l.replace(/\[[^\]]*\]/g, "").trim().length > 0).length;
    const hanCount = (lyricText.match(/[\u4E00-\u9FFF]/g) || []).length;

    let score = 0;
    if (c.hasSynced) score += 90;
    if (lyricLines < 8) score -= 200;
    else if (lyricLines >= 14 && lyricLines <= 150) score += 20;

    // Language guard
    if (expectedLang === "zh" && hanCount < 12) score -= 250;
    if (expectedLang === "en" && hanCount > 15) score -= 250;

    // Title relevance (critical: avoid completely unrelated songs!)
    const normTrack = normalizeMatchText(c.trackName);
    const normArtist = normalizeMatchText(c.artistName);
    if (normExpectedTitle.length >= 2) {
      if (normTrack === normExpectedTitle) {
        score += 130;
      } else if (normTrack.includes(normExpectedTitle) || normExpectedTitle.includes(normTrack)) {
        score += 75;
      } else {
        // Check significant word overlap for multi-word YouTube titles
        const words = cleanTitle
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length >= 3);
        const hits = words.filter((w) => normTrack.includes(normalizeMatchText(w))).length;
        if (words.length > 0 && hits >= Math.max(1, Math.ceil(words.length * 0.5))) {
          score += 45;
        } else {
          score -= 140;
        }
      }
    }

    // Artist relevance (supports Traditional/Simplified Chinese and English aliases)
    if (artistTokens.length > 0) {
      const matchedArtist = artistTokens.some(
        (tok) => normArtist.includes(tok) || (normArtist.length >= 2 && tok.includes(normArtist))
      );
      if (matchedArtist) score += 95;
      else if (artistTokens.some((tok) => normTrack.includes(tok))) score += 40;
      else score -= 40;
    }

    // Penalize Remix / Live / 2.0 / Kala / Cover / Slowed versions
    if (BAD_LRC_VERSION_RE.test(c.trackName) || BAD_LRC_VERSION_RE.test(c.artistName)) {
      score -= 130;
    }

    // Duration closeness to YouTube video
    if (targetDur > 0 && c.duration > 0) {
      const diff = Math.abs(c.duration - targetDur);
      if (diff <= 4) score += 130;
      else if (diff <= 8) score += 95;
      else if (diff <= 15) score += 50;
      else if (diff <= 25) score += 10;
      else score -= Math.min(180, diff * 2);
    } else if (c.duration > 0 && c.duration < 60) {
      score -= 150;
    }

    return { candidate: c, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Filter out clearly unrelated/garbage entries (negative scores) so we never attach a random wrong song!
  const viable = scored.filter((x) => x.score > 10).map((x) => x.candidate);
  return viable.slice(0, 10);
}

async function runSingleYtSearch(query: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r: any = await Promise.race([
        ytSearch(query),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 9000)),
      ]);
      const vids = Array.isArray(r?.videos) ? r.videos : [];
      if (vids.length > 0) return vids;
    } catch (err) {
      console.warn(`[yt-search] Attempt ${attempt + 1} failed for "${query}":`, err);
    }
    await new Promise((res) => setTimeout(res, 350));
  }
  return [];
}

async function searchYouTubeVideos(
  query: string,
  limit = 8,
  options?: { preferCleanStudio?: boolean }
) {
  const cacheKey = `${query.toLowerCase().trim()}__${limit}__${options?.preferCleanStudio ? "clean" : "raw"}`;
  const cached = ytResolveCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < YT_CACHE_TTL_MS) {
    return cached.videos;
  }

  // Build fallback queries in case specific query ("Official Lyric Video" / "歌词") returns empty
  const stripped = query
    .replace(/\b(official|lyric video|lyrics|music video|audio|remastered)\b/gi, "")
    .replace(/歌词版|歌词/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const queriesToTry = Array.from(new Set([query.trim(), stripped].filter(Boolean)));
  let rawVideos: any[] = [];
  for (const q of queriesToTry) {
    rawVideos = await runSingleYtSearch(q);
    if (rawVideos.length > 0) break;
  }

  // Prefer normal song lengths (45s..900s), fall back to any videoId if seconds missing
  let filtered = rawVideos.filter((v: any) => v?.videoId && v.seconds >= 45 && v.seconds <= 900);
  if (filtered.length === 0) {
    filtered = rawVideos.filter((v: any) => v?.videoId && (v.seconds === 0 || (v.seconds >= 20 && v.seconds <= 1200)));
  }

  let mapped = filtered.map((v: any) => ({
    videoId: v.videoId,
    title: v.title || "",
    artist: v.author?.name || "YouTube",
    thumbnailUrl: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
    durationSec: Number(v.seconds) || 0,
    durationLabel: v.timestamp || "",
    views: Number(v.views) || 0,
  }));

  if (options?.preferCleanStudio) {
    mapped = mapped
      .map((v, idx) => {
        let score = 50 - idx * 3;
        if (BAD_YT_VIDEO_RE.test(v.title) || BAD_YT_VIDEO_RE.test(v.artist)) score -= 180;
        if (/\b(official audio|lyric video|lyrics|audio)\b|歌词|動態歌詞|歌词版/i.test(v.title)) score += 35;
        if (/ - topic$/i.test(v.artist)) score += 30;
        return { v, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.v);
  }

  const videos = mapped.slice(0, limit);
  if (videos.length > 0) {
    ytResolveCache.set(cacheKey, { videos, ts: Date.now() });
  }
  return videos;
}

async function lookupYouTubeVideoById(videoId: string) {
  try {
    const info: any = await ytSearch({ videoId });
    if (info && info.videoId) {
      return {
        videoId: info.videoId,
        title: info.title || "YouTube Song",
        artist: info.author?.name || "YouTube",
        thumbnailUrl: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        durationSec: Number(info.seconds) || 240,
        durationLabel: info.timestamp || "",
        views: Number(info.views) || 0,
      };
    }
  } catch (err) {
    console.warn("[yt-search] videoId lookup failed, falling back to oEmbed:", err);
  }

  // Fallback to YouTube oEmbed API (free, official, zero key)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`;
    const resp = await fetch(oembedUrl);
    if (resp.ok) {
      const data: any = await resp.json();
      return {
        videoId,
        title: data.title || "YouTube Song",
        artist: data.author_name || "YouTube",
        thumbnailUrl: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        durationSec: 240,
        durationLabel: "",
        views: 0,
      };
    }
  } catch {}

  return {
    videoId,
    title: "YouTube Song",
    artist: "YouTube",
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSec: 240,
    durationLabel: "",
    views: 0,
  };
}

export function registerKaraokeRoutes(
  app: express.Express,
  deps: {
    getServerGeminiClient: () => GoogleGenAI;
    firestoreAdmin?: FirebaseFirestore.Firestore | null;
  }
) {
  const { getServerGeminiClient, firestoreAdmin } = deps;

  async function readServerCache(songKey: string): Promise<KaraokeSongRecord | null> {
    const mem = karaokeMemoryCache.get(songKey);
    if (mem) return mem;

    if (firestoreAdmin) {
      try {
        const snap = await firestoreAdmin.collection("karaoke_songs").doc(songKey).get();
        if (snap.exists) {
          const data = snap.data() as KaraokeSongRecord;
          if (data?.videoId && Array.isArray(data.lines) && data.lines.length > 0) {
            karaokeMemoryCache.set(songKey, data);
            return data;
          }
        }
      } catch (err) {
        console.warn("[Karaoke Cache] Firestore Admin read skipped:", err);
      }
    }
    return null;
  }

  async function writeServerCache(song: KaraokeSongRecord): Promise<void> {
    karaokeMemoryCache.set(song.songKey, song);
    if (firestoreAdmin) {
      try {
        await firestoreAdmin
          .collection("karaoke_songs")
          .doc(song.songKey)
          .set(song, { merge: true });
      } catch (err) {
        console.warn("[Karaoke Cache] Firestore Admin write skipped:", err);
      }
    }
  }

  // 1. Search YouTube by keyword OR direct YouTube URL
  app.get("/api/karaoke/search", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q) return res.json({ results: [] });

      const directId = extractYouTubeVideoId(q);
      if (directId) {
        const item = await lookupYouTubeVideoById(directId);
        const key = makeSongCacheKey({ videoId: item.videoId });
        const cached = await readServerCache(key);
        return res.json({
          isDirectUrl: true,
          results: [
            {
              ...item,
              isCached: Boolean(cached),
              cachedSongKey: cached ? key : undefined,
            },
          ],
        });
      }

      const videos = await searchYouTubeVideos(q, 10);
      const enriched = videos.map((v: any) => {
        const key = makeSongCacheKey({ videoId: v.videoId });
        const cached = karaokeMemoryCache.has(key);
        return {
          ...v,
          isCached: cached,
          cachedSongKey: cached ? key : undefined,
        };
      });

      res.json({ isDirectUrl: false, results: enriched });
    } catch (err: any) {
      console.error("[Karaoke Search] Error:", err);
      res.status(500).json({ error: "ไม่สามารถค้นหาเพลงจาก YouTube ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" });
    }
  });

  // 2. List currently server-cached song keys (fast badge lookup for 100-song lobby)
  app.get("/api/karaoke/cached-keys", (_req, res) => {
    res.json({ keys: Array.from(karaokeMemoryCache.keys()) });
  });

  // 3. Resolve YouTube video + LRCLIB synced lyrics + check cache BEFORE charging any quota/credits
  app.post("/api/karaoke/resolve", async (req, res) => {
    try {
      const {
        curatedId,
        videoId: inputVideoId,
        verifiedVideoId,
        backupVideoIds,
        verifiedLrcId,
        title: inputTitle,
        artist: inputArtist,
        searchQuery,
        lrcTitle,
        lrcArtist,
        language: inputLanguage,
      } = req.body || {};

      // Check cache by curatedId or videoId immediately
      const candidateKey = makeSongCacheKey({ curatedId, videoId: inputVideoId });
      if (curatedId || inputVideoId) {
        const cached = await readServerCache(candidateKey);
        if (cached) {
          return res.json({ cached: true, song: cached });
        }
      }

      // Resolve YouTube video + backup embeddable video IDs
      let primaryVideo: any = null;
      let alternativeVideoIds: string[] = [];

      if (verifiedVideoId && typeof verifiedVideoId === "string" && /^[a-zA-Z0-9_-]{11}$/.test(verifiedVideoId)) {
        // Fast verified curated path: zero risk of flaky yt-search 404!
        primaryVideo = {
          videoId: verifiedVideoId,
          title: inputTitle || "Curated Song",
          artist: inputArtist || "",
          thumbnailUrl: `https://i.ytimg.com/vi/${verifiedVideoId}/hqdefault.jpg`,
          durationSec: 240,
          durationLabel: "",
          views: 0,
        };
        alternativeVideoIds = Array.isArray(backupVideoIds)
          ? backupVideoIds.filter((id: any) => typeof id === "string" && id !== verifiedVideoId).slice(0, 4)
          : [];
      } else if (inputVideoId) {
        primaryVideo = await lookupYouTubeVideoById(inputVideoId);
        // Also find 2-3 clean backup videos in case the primary video has embed disabled (error 101/150)
        try {
          const backups = await searchYouTubeVideos(
            `${stripParentheticalThai(inputTitle || primaryVideo.title)} lyric video`,
            5,
            { preferCleanStudio: true }
          );
          alternativeVideoIds = backups
            .map((v: any) => v.videoId)
            .filter((id: string) => id && id !== primaryVideo.videoId)
            .slice(0, 4);
        } catch {}
      } else {
        const q =
          searchQuery ||
          `${stripParentheticalThai(inputTitle || "")} ${stripParentheticalThai(inputArtist || "")} lyric video`;
        const candidates = await searchYouTubeVideos(q, 6, { preferCleanStudio: true });
        if (candidates.length === 0) {
          return res
            .status(404)
            .json({ error: "ไม่พบวิดีโอเพลงนี้บน YouTube กรุณาลองค้นหาด้วยชื่ออื่นหรือวางลิงก์โดยตรง" });
        }
        primaryVideo = candidates[0];
        alternativeVideoIds = candidates.slice(1, 5).map((v: any) => v.videoId);
      }

      const finalKey = makeSongCacheKey({ curatedId, videoId: primaryVideo.videoId });
      const secondCacheHit = await readServerCache(finalKey);
      if (secondCacheHit) {
        return res.json({ cached: true, song: secondCacheHit });
      }

      // Fetch synced lyrics from LRCLIB (exact verified ID first for curated songs!)
      const lyricTitle = lrcTitle || inputTitle || primaryVideo.title;
      const lyricArtist = lrcArtist || inputArtist || primaryVideo.artist;
      const expectedLangHint: "en" | "zh" | undefined =
        inputLanguage === "zh" || inputLanguage === "en" ? inputLanguage : undefined;

      let lrcCandidates: any[] = [];
      let bestCandidate: any = null;

      if (verifiedLrcId && Number(verifiedLrcId) > 0) {
        const exactLrc = await fetchLrclibById(Number(verifiedLrcId));
        if (exactLrc) {
          bestCandidate = exactLrc;
          if (exactLrc.duration > 30) {
            primaryVideo.durationSec = exactLrc.duration;
          }
          lrcCandidates = [exactLrc];
        }
      }

      if (!bestCandidate) {
        lrcCandidates = await searchLrclibCandidates(lyricTitle, lyricArtist, {
          expectedLanguage: expectedLangHint,
          targetDurationSec: primaryVideo.durationSec || 0,
        });
        bestCandidate = lrcCandidates[0] || null;
      }

      let rawLines: RawLyricLine[] = [];
      let isSynced = false;
      let lrcSource: "lrclib" | "plain" = "lrclib";

      if (bestCandidate?.hasSynced && bestCandidate.syncedLyrics) {
        rawLines = parseSyncedLrc(bestCandidate.syncedLyrics, bestCandidate.duration || primaryVideo.durationSec || 240);
        isSynced = rawLines.length > 0;
        lrcSource = "lrclib";
      } else if (bestCandidate?.plainLyrics) {
        rawLines = parsePlainLyrics(bestCandidate.plainLyrics);
        isSynced = false;
        lrcSource = "plain";
      }

      const sampleText = rawLines.slice(0, 8).map((l) => l.text).join(" ") || `${lyricTitle} ${lyricArtist}`;
      const detectedLang: "en" | "zh" =
        expectedLangHint || detectLanguageFromText(sampleText);

      res.json({
        cached: false,
        resolved: {
          songKey: finalKey,
          curatedId: curatedId || undefined,
          videoId: primaryVideo.videoId,
          alternativeVideoIds,
          title: inputTitle || primaryVideo.title,
          artist: inputArtist || primaryVideo.artist,
          language: detectedLang,
          thumbnailUrl: primaryVideo.thumbnailUrl,
          durationSec: primaryVideo.durationSec || bestCandidate?.duration || 240,
          isSynced,
          lrcSource,
          rawLines,
          lrcCandidates: lrcCandidates.map((c) => ({
            id: c.id,
            trackName: c.trackName,
            artistName: c.artistName,
            albumName: c.albumName,
            duration: c.duration,
            hasSynced: c.hasSynced,
            syncedLyrics: c.syncedLyrics,
            plainLyrics: c.plainLyrics,
          })),
        },
      });
    } catch (err: any) {
      console.error("[Karaoke Resolve] Error:", err);
      res.status(500).json({ error: err?.message || "ไม่สามารถโหลดข้อมูลเพลงได้" });
    }
  });

  // 4. Search alternative LRCLIB versions from inside Karaoke Studio
  app.post("/api/karaoke/lrc-search", async (req, res) => {
    try {
      const { title, artist, language, durationSec } = req.body || {};
      if (!title) return res.status(400).json({ error: "Missing title" });
      const candidates = await searchLrclibCandidates(String(title), String(artist || ""), {
        expectedLanguage: language === "zh" || language === "en" ? language : undefined,
        targetDurationSec: Number(durationSec) || 0,
      });
      res.json({ candidates });
    } catch (err: any) {
      res.status(500).json({ error: "ค้นหาเวอร์ชันเนื้อเพลงไม่สำเร็จ" });
    }
  });

  // 5. Translate lyrics into natural Thai + Pinyin (for ZH) + extract Song Vocab Deck in ONE Gemini call
  app.post("/api/karaoke/translate", async (req, res) => {
    try {
      const {
        songKey,
        curatedId,
        videoId,
        alternativeVideoIds,
        title,
        artist,
        language,
        difficulty,
        thumbnailUrl,
        durationSec,
        isSynced,
        lrcSource,
        rawLines,
        byokKey,
        useByokQuota,
        forceRetranslate,
      } = req.body || {};

      if (!videoId || !Array.isArray(rawLines) || rawLines.length === 0) {
        return res.status(400).json({ error: "ไม่พบเนื้อเพลงสำหรับแปล กรุณาลองค้นหาเวอร์ชันเนื้อเพลงอื่น" });
      }

      const finalKey = songKey || makeSongCacheKey({ curatedId, videoId });
      if (!forceRetranslate) {
        const cached = await readServerCache(finalKey);
        if (cached) {
          return res.json({ song: cached, cached: true, usedByok: false });
        }
      }

      // Any uncached translation invokes a Gemini API Key (BYOK or Server) -> strictly require Google Sign-In
      const verifiedUser = await verifyFirebaseIdToken(extractBearerToken(req));
      if (!verifiedUser) {
        return res.status(401).json({
          authRequired: true,
          error: "กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้ AI แปลเพลงใหม่หรือใช้งาน BYOK",
        });
      }

      const lang: "en" | "zh" = language === "zh" ? "zh" : "en";
      const cappedLines: RawLyricLine[] = rawLines.slice(0, 180);

      // Deduplicate identical lines to save ~45% tokens and keep free-tier responses fast & complete
      const uniqueTextMap = new Map<string, number>();
      const uniqueLines: Array<{ u: number; t: string }> = [];
      const lineToUniqueId: number[] = [];

      for (const line of cappedLines) {
        const norm = (line.text || "").trim();
        let uid = uniqueTextMap.get(norm);
        if (uid === undefined) {
          uid = uniqueLines.length;
          uniqueTextMap.set(norm, uid);
          uniqueLines.push({ u: uid, t: norm });
        }
        lineToUniqueId.push(uid);
      }

      const isChinese = lang === "zh";
      const prompt = `You are an expert ${isChinese ? "Mandarin Chinese" : "English"}-to-Thai song lyric translator and language teacher.
Song: "${title || ""}" by "${artist || ""}"

Task:
1. Translate EVERY item in "uniqueLines" into natural, poetic yet easy-to-understand Thai so Thai learners immediately grasp the real meaning.${
        isChinese
          ? '\n2. Provide accurate tone-marked Pinyin (e.g., "yuè liàng dài biǎo wǒ de xīn") for EVERY line in the "py" field.'
          : ""
      }
3. Extract 6 to 10 high-value, useful vocabulary words, idioms, or phrases from this song into "vocabDeck" for language study (with ${
        isChinese ? "tone-marked Pinyin" : "simple IPA/pronunciation hint"
      }, Thai meaning, part of speech, exact lyric quote, and a brief 1-sentence Thai usage tip).

Return STRICT JSON matching the schema. Every single "u" index from 0 to ${uniqueLines.length - 1} MUST appear in "translations".

uniqueLines:
${JSON.stringify(uniqueLines)}`;

      const translationItemProperties: Record<string, any> = {
        u: { type: Type.INTEGER },
        th: { type: Type.STRING },
      };
      const translationRequired = ["u", "th"];
      if (isChinese) {
        translationItemProperties.py = { type: Type.STRING };
        translationRequired.push("py");
      }

      const aiRes = await generateContentWithByokFallback({
        contents: prompt,
        useByokQuota: Boolean(useByokQuota),
        byokKey: byokKey || null,
        byokProfile: "flash38",
        serverDefaultModel: "gemini-4-hydrogen",
        serverThinkingLevel: ThinkingLevel.LOW,
        getServerClient: getServerGeminiClient,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: translationItemProperties,
                  required: translationRequired,
                },
              },
              vocabDeck: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    reading: { type: Type.STRING },
                    meaningTh: { type: Type.STRING },
                    partOfSpeech: { type: Type.STRING },
                    exampleLine: { type: Type.STRING },
                    noteTh: { type: Type.STRING },
                  },
                  required: ["word", "meaningTh", "exampleLine"],
                },
              },
            },
            required: ["translations", "vocabDeck"],
          },
        },
      });

      const parsed = safeParseGeminiJson(aiRes.text || "{}");

      const transByUnique = new Map<number, { th: string; py?: string }>();
      if (Array.isArray(parsed.translations)) {
        for (const item of parsed.translations) {
          if (typeof item?.u === "number") {
            transByUnique.set(item.u, {
              th: String(item.th || "").trim(),
              py: item.py ? String(item.py).trim() : undefined,
            });
          }
        }
      }

      const translatedLines = cappedLines.map((line, idx) => {
        const uid = lineToUniqueId[idx];
        const tr = transByUnique.get(uid);
        return {
          index: idx,
          timeSec: Number(line.timeSec),
          endSec: Number(line.endSec),
          text: line.text,
          pinyin: isChinese ? tr?.py || "" : undefined,
          thaiTranslation: tr?.th || "",
        };
      });

      const vocabDeck = Array.isArray(parsed.vocabDeck)
        ? parsed.vocabDeck.slice(0, 12).map((v: any) => ({
            word: String(v.word || "").trim(),
            reading: v.reading ? String(v.reading).trim() : "",
            meaningTh: String(v.meaningTh || "").trim(),
            partOfSpeech: v.partOfSpeech ? String(v.partOfSpeech).trim() : "",
            exampleLine: String(v.exampleLine || "").trim(),
            noteTh: v.noteTh ? String(v.noteTh).trim() : "",
          }))
        : [];

      const now = Date.now();
      const songRecord: KaraokeSongRecord = {
        songKey: finalKey,
        curatedId: curatedId || undefined,
        videoId,
        alternativeVideoIds: Array.isArray(alternativeVideoIds) ? alternativeVideoIds.slice(0, 5) : [],
        title: String(title || "Untitled Song"),
        artist: String(artist || "Unknown Artist"),
        language: lang,
        difficulty: difficulty || undefined,
        thumbnailUrl: thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        durationSec: Number(durationSec) || 240,
        isSynced: Boolean(isSynced),
        lrcSource: lrcSource || "lrclib",
        lines: translatedLines,
        vocabDeck,
        playCount: 1,
        cachedAt: now,
        updatedAt: now,
      };

      await writeServerCache(songRecord);

      res.json({
        song: songRecord,
        cached: false,
        usedByok: aiRes.usedByok,
        modelUsed: aiRes.modelUsed,
      });
    } catch (err: any) {
      if (err instanceof ByokInvalidKeyError) {
        return res.status(400).json({
          error: err.message,
          byokInvalidKey: true,
        });
      }
      if (err instanceof ByokQuotaExhaustedError) {
        return res.status(429).json({
          error: err.message,
          byokQuotaExhausted: true,
        });
      }
      if (isQuotaOrRateLimitError(err)) {
        return res.status(429).json({
          error: "โควตา AI เต็มชั่วคราว กรุณาลองใหม่หรือใช้เครดิตในแอป",
          byokQuotaExhausted: Boolean(req.body?.useByokQuota),
        });
      }
      console.error("[Karaoke Translate] Error:", err);
      res.status(500).json({ error: err?.message || "ไม่สามารถแปลเพลงได้ในขณะนี้" });
    }
  });

  // 6. Tap-to-Explain a word/phrase inside a lyric line
  // STRICTLY BYOK-ONLY (0 Baht owner server cost guaranteed — NEVER falls back to server key!)
  app.post("/api/karaoke/explain-word", requireFirebaseAuth, async (req, res) => {
    try {
      const { word, lineText, language, byokKey } = req.body || {};
      const cleanWord = String(word || "").trim().slice(0, 120);
      if (!cleanWord) return res.status(400).json({ error: "Missing word" });

      const cleanByok = typeof byokKey === "string" ? byokKey.trim() : "";
      if (cleanByok.length <= 15) {
        return res.status(403).json({
          byokRequired: true,
          error: "ต้องเชื่อมคีย์ฟรี BYOK ก่อนใช้ AI อธิบายคำนอกพจนานุกรม (คำในคลังศัพท์และพจนานุกรมในแอปยังดูได้ฟรีตลอด)",
        });
      }

      const isChinese = language === "zh";
      const safeLine = String(lineText || "").trim().slice(0, 300);
      const prompt = `Explain the ${isChinese ? "Mandarin Chinese" : "English"} word or phrase in Thai for a learner listening to a song.
Target word/phrase: ${JSON.stringify(cleanWord)}
Lyric line context: ${JSON.stringify(safeLine)}

Rules:
- Respond ONLY with valid JSON matching the schema.
- Keep explanations concise, natural Thai, friendly, and accurate to this lyric context.`;

      const explainSchema = {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          reading: {
            type: Type.STRING,
            description: isChinese ? "tone-marked Pinyin" : "simple pronunciation guide / IPA",
          },
          meaningTh: { type: Type.STRING, description: "concise Thai meaning" },
          contextExplanationTh: {
            type: Type.STRING,
            description: "1-2 short Thai sentences explaining nuance, slang, or grammar in this exact lyric",
          },
          example: {
            type: Type.STRING,
            description: "1 short natural example sentence with Thai translation",
          },
        },
        required: ["word", "reading", "meaningTh", "contextExplanationTh", "example"],
      };

      const aiRes = await generateContentWithByokFallback({
        contents: prompt,
        useByokQuota: true,
        strictByokOnly: true,
        byokKey: cleanByok,
        byokProfile: "flash_lite",
        config: {
          responseMimeType: "application/json",
          responseSchema: explainSchema,
        },
      });

      const parsed = safeParseGeminiJson(aiRes.text || "{}");
      return res.json({
        word: String(parsed?.word || cleanWord),
        reading: parsed?.reading ? String(parsed.reading) : "",
        meaningTh: String(parsed?.meaningTh || "ไม่พบคำแปล"),
        contextExplanationTh: String(parsed?.contextExplanationTh || ""),
        example: parsed?.example ? String(parsed.example) : "",
        modelUsed: aiRes.modelUsed,
      });
    } catch (err: any) {
      if (err instanceof ByokInvalidKeyError) {
        return res.status(400).json({
          byokInvalidKey: true,
          error: err.message,
        });
      }
      if (err instanceof ByokQuotaExhaustedError || isQuotaOrRateLimitError(err)) {
        return res.status(429).json({
          byokQuotaExhausted: true,
          error: "คีย์ฟรี BYOK ติดลิมิตชั่วคราว (429) กรุณารอสักครู่แล้วลองแตะใหม่อีกครั้ง",
        });
      }
      console.error("[Karaoke Explain-Word] Error:", err?.message || err);
      return res.status(500).json({
        error: err?.message || "ไม่สามารถอธิบายคำศัพท์นี้ได้ชั่วคราว กรุณาลองแตะใหม่อีกครั้ง",
      });
    }
  });
}
