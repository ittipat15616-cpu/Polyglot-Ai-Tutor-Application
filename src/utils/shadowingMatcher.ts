export type ShadowingLang = 'EN' | 'CN';

export interface ShadowingTokenResult {
  display: string;
  normalized: string;
  matched: boolean;
}

export interface ShadowingDiffResult {
  tokens: ShadowingTokenResult[];
  matchedCount: number;
  totalCount: number;
  accuracyPct: number;
  grade: 'excellent' | 'good' | 'keep_trying';
  missedTokens: string[];
}

const EN_CONTRACTIONS: Record<string, string[]> = {
  "i'm": ['i', 'am'],
  "you're": ['you', 'are'],
  "he's": ['he', 'is'],
  "she's": ['she', 'is'],
  "it's": ['it', 'is'],
  "we're": ['we', 'are'],
  "they're": ['they', 'are'],
  "i've": ['i', 'have'],
  "you've": ['you', 'have'],
  "we've": ['we', 'have'],
  "they've": ['they', 'have'],
  "i'll": ['i', 'will'],
  "you'll": ['you', 'will'],
  "he'll": ['he', 'will'],
  "she'll": ['she', 'will'],
  "we'll": ['we', 'will'],
  "they'll": ['they', 'will'],
  "isn't": ['is', 'not'],
  "aren't": ['are', 'not'],
  "wasn't": ['was', 'not'],
  "weren't": ['were', 'not'],
  "don't": ['do', 'not'],
  "doesn't": ['does', 'not'],
  "didn't": ['did', 'not'],
  "can't": ['cannot'],
  "cannot": ['can', 'not'],
  "won't": ['will', 'not'],
  "wouldn't": ['would', 'not'],
  "shouldn't": ['should', 'not'],
  "couldn't": ['could', 'not'],
  "haven't": ['have', 'not'],
  "hasn't": ['has', 'not'],
  "hadn't": ['had', 'not'],
  "there's": ['there', 'is'],
  "that's": ['that', 'is'],
  "what's": ['what', 'is'],
  "let's": ['let', 'us'],
};

const EN_NUMBER_WORDS: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
  '10': 'ten',
  '11': 'eleven',
  '12': 'twelve',
  '13': 'thirteen',
  '14': 'fourteen',
  '15': 'fifteen',
  '16': 'sixteen',
  '17': 'seventeen',
  '18': 'eighteen',
  '19': 'nineteen',
  '20': 'twenty',
  '30': 'thirty',
  '40': 'forty',
  '50': 'fifty',
  '100': 'hundred',
};

const CN_DIGIT_TO_HANZI: Record<string, string> = {
  '0': '零',
  '1': '一',
  '2': '二',
  '3': '三',
  '4': '四',
  '5': '五',
  '6': '六',
  '7': '七',
  '8': '八',
  '9': '九',
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[b.length];
}

function normalizeEnWord(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
  if (!cleaned) return '';
  if (EN_NUMBER_WORDS[cleaned]) return EN_NUMBER_WORDS[cleaned];
  return cleaned;
}

function expandEnSpokenTokens(spoken: string): string[] {
  const rawParts = spoken
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const out: string[] = [];
  for (const part of rawParts) {
    const norm = normalizeEnWord(part);
    if (!norm) continue;
    out.push(norm);
    const expanded = EN_CONTRACTIONS[norm];
    if (expanded) {
      out.push(...expanded);
    }
    if (norm.includes("'")) {
      out.push(norm.replace(/'/g, ''));
    }
  }
  return out;
}

function isEnWordMatch(targetNorm: string, spokenNorm: string): boolean {
  if (!targetNorm || !spokenNorm) return false;
  if (targetNorm === spokenNorm) return true;

  // Handle contraction equality (e.g. target "don't" vs spoken "dont" or "do")
  if (targetNorm.replace(/'/g, '') === spokenNorm.replace(/'/g, '')) return true;

  // Common British/American or plural minor tolerance for longer words
  if (targetNorm.length >= 5 && spokenNorm.length >= 5) {
    if (levenshtein(targetNorm, spokenNorm) <= 1) return true;
  }
  return false;
}

function normalizeCnChar(ch: string): string {
  if (CN_DIGIT_TO_HANZI[ch]) return CN_DIGIT_TO_HANZI[ch];
  if (ch === '两' || ch === '兩') return '二';
  return ch.toLowerCase();
}

function isCnMeaningfulChar(ch: string): boolean {
  return /[\u4e00-\u9fff0-9a-zA-Z]/.test(ch);
}

/**
 * Computes word-level (EN) or character-level (CN) alignment between a target example sentence
 * and the browser speech recognition transcript using Longest Common Subsequence (LCS).
 * 100% client-side, 0 Baht API cost.
 */
export function evaluateShadowing(
  targetSentence: string,
  spokenTranscript: string,
  lang: ShadowingLang
): ShadowingDiffResult {
  const cleanTarget = targetSentence.trim();
  const cleanSpoken = spokenTranscript.trim();

  if (lang === 'CN') {
    const targetChars: { display: string; normalized: string }[] = [];
    for (const ch of Array.from(cleanTarget)) {
      if (isCnMeaningfulChar(ch)) {
        targetChars.push({ display: ch, normalized: normalizeCnChar(ch) });
      }
    }

    const spokenChars: string[] = [];
    for (const ch of Array.from(cleanSpoken)) {
      if (isCnMeaningfulChar(ch)) {
        spokenChars.push(normalizeCnChar(ch));
      }
    }

    const n = targetChars.length;
    const m = spokenChars.length;

    if (n === 0) {
      return {
        tokens: [],
        matchedCount: 0,
        totalCount: 0,
        accuracyPct: 0,
        grade: 'keep_trying',
        missedTokens: [],
      };
    }

    // LCS DP table
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (targetChars[i - 1].normalized === spokenChars[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack matched indices
    const matchedIdx = new Set<number>();
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
      if (targetChars[i - 1].normalized === spokenChars[j - 1]) {
        matchedIdx.add(i - 1);
        i--;
        j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    const tokens: ShadowingTokenResult[] = targetChars.map((tc, idx) => ({
      display: tc.display,
      normalized: tc.normalized,
      matched: matchedIdx.has(idx),
    }));

    const matchedCount = matchedIdx.size;
    const accuracyPct = Math.round((matchedCount / n) * 100);
    const grade = accuracyPct >= 85 ? 'excellent' : accuracyPct >= 60 ? 'good' : 'keep_trying';
    const missedTokens = tokens.filter((t) => !t.matched).map((t) => t.display);

    return {
      tokens,
      matchedCount,
      totalCount: n,
      accuracyPct,
      grade,
      missedTokens,
    };
  }

  // English word-level alignment
  const rawTargetWords = cleanTarget.split(/\s+/).filter(Boolean);
  const targetTokens = rawTargetWords
    .map((raw) => ({
      display: raw,
      normalized: normalizeEnWord(raw),
    }))
    .filter((t) => t.normalized.length > 0);

  const spokenTokens = expandEnSpokenTokens(cleanSpoken);
  const n = targetTokens.length;
  const m = spokenTokens.length;

  if (n === 0) {
    return {
      tokens: [],
      matchedCount: 0,
      totalCount: 0,
      accuracyPct: 0,
      grade: 'keep_trying',
      missedTokens: [],
    };
  }

  // Build contraction-aware match helper: if target is "don't" and spoken has "do" + "not"
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    const tNorm = targetTokens[i - 1].normalized;
    const expanded = EN_CONTRACTIONS[tNorm];
    for (let j = 1; j <= m; j++) {
      const sNorm = spokenTokens[j - 1];
      const directMatch = isEnWordMatch(tNorm, sNorm);
      const contractionMatch = Boolean(expanded && expanded.includes(sNorm));
      if (directMatch || contractionMatch) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const matchedIdx = new Set<number>();
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const tNorm = targetTokens[i - 1].normalized;
    const expanded = EN_CONTRACTIONS[tNorm];
    const sNorm = spokenTokens[j - 1];
    if (isEnWordMatch(tNorm, sNorm) || Boolean(expanded && expanded.includes(sNorm))) {
      matchedIdx.add(i - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  const tokens: ShadowingTokenResult[] = targetTokens.map((t, idx) => ({
    display: t.display,
    normalized: t.normalized,
    matched: matchedIdx.has(idx),
  }));

  const matchedCount = matchedIdx.size;
  const accuracyPct = Math.round((matchedCount / n) * 100);
  const grade = accuracyPct >= 85 ? 'excellent' : accuracyPct >= 60 ? 'good' : 'keep_trying';
  const missedTokens = tokens
    .filter((t) => !t.matched)
    .map((t) => t.display.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9']+$/g, '') || t.display);

  return {
    tokens,
    matchedCount,
    totalCount: n,
    accuracyPct,
    grade,
    missedTokens,
  };
}

export function normalizeShadowingKey(lang: ShadowingLang, sentence: string): string {
  const clean = sentence
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  return `${lang}:${clean}`;
}
