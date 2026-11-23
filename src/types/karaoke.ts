export type KaraokeLanguage = 'en' | 'zh';

export type KaraokeDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type KaraokeMood = 'pop-easy' | 'classic-love' | 'modern-hits' | 'ost-ballad';

export interface CuratedSong {
  id: string;
  title: string;
  artist: string;
  language: KaraokeLanguage;
  difficulty: KaraokeDifficulty;
  levelBadge: string; // e.g. 'A1-A2' or 'HSK 1-2'
  mood: KaraokeMood;
  searchQuery: string;
  lrcTitle: string;
  lrcArtist: string;
  learningTipTh: string;
  verifiedVideoId?: string;
  backupVideoIds?: string[];
  verifiedLrcId?: number;
  fallbackVideoId?: string;
}

export interface KaraokeLine {
  index: number;
  timeSec: number; // Start time in seconds (-1 if unsynced/plain)
  endSec: number;  // End time in seconds
  text: string;    // Original lyric line (EN or ZH)
  pinyin?: string; // Tone-marked Pinyin for Chinese songs
  thaiTranslation: string; // Natural Thai translation
}

export interface KaraokeVocabItem {
  word: string;
  reading?: string; // Pinyin or pronunciation hint
  meaningTh: string;
  partOfSpeech?: string;
  exampleLine: string;
  noteTh?: string;
}

export interface KaraokeSongData {
  songKey: string;
  curatedId?: string;
  videoId: string;
  alternativeVideoIds?: string[];
  title: string;
  artist: string;
  language: KaraokeLanguage;
  difficulty?: KaraokeDifficulty;
  thumbnailUrl: string;
  durationSec: number;
  isSynced: boolean;
  lrcSource: 'lrclib' | 'manual' | 'plain';
  lines: KaraokeLine[];
  vocabDeck: KaraokeVocabItem[];
  playCount?: number;
  cachedAt: number;
  updatedAt: number;
}

export interface CommunityKaraokeSong {
  songKey: string;
  videoId: string;
  title: string;
  artist: string;
  language: KaraokeLanguage;
  thumbnailUrl: string;
  durationSec: number;
  lineCount: number;
  vocabCount: number;
  isSynced: boolean;
  isPublic: boolean;
  playCount: number;
  addedAt: number;
  updatedAt: number;
  createdByUid?: string;
}

export interface LrcCandidate {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration: number;
  hasSynced: boolean;
  syncedLyrics?: string;
  plainLyrics?: string;
}

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  durationSec: number;
  durationLabel: string;
  views?: number;
  isCached?: boolean;
  cachedSongKey?: string;
}

export interface KaraokeFavorite {
  songKey: string;
  curatedId?: string;
  videoId?: string;
  title: string;
  artist: string;
  language: KaraokeLanguage;
  thumbnailUrl?: string;
  addedAt: number;
}

export interface KaraokeHistoryItem {
  songKey: string;
  curatedId?: string;
  videoId: string;
  title: string;
  artist: string;
  language: KaraokeLanguage;
  thumbnailUrl: string;
  lastPlayedAt: number;
  playCount: number;
  bestQuizScore?: number;
  bestQuizTotal?: number;
}

export interface WordExplainResult {
  word: string;
  reading?: string;
  meaningTh: string;
  contextExplanationTh: string;
  example?: string;
}
