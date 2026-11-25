import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Play,
  RotateCcw,
  Square,
  Volume2,
  X,
  XCircle,
} from 'lucide-react';
import {
  READING_CATEGORIES,
  ReadingKeyVocab,
  ReadingProgressEntry,
  ReadingStory,
} from '../../types/reading';
import { allCNVocab, allENVocab } from '../../data/vocabData';
import SaveToWordbookButton from '../wordbook/SaveToWordbookButton';
import { recordReadingCompletion } from '../../services/readingService';
import { logMistakesBatch } from '../../services/mistakeService';

interface ReadingReaderViewProps {
  story: ReadingStory;
  progress?: ReadingProgressEntry;
  hasNextStory?: boolean;
  onBack: () => void;
  onNextStory?: () => void;
  onAskAI?: (prompt: string) => void;
}

interface LookupWordInfo {
  word: string;
  reading?: string;
  pos?: string;
  meaningTh: string;
  example?: string;
  exampleTh?: string;
  isFromStoryVocab?: boolean;
}

// Memory cache for synthesized sentence/word audio so replay at different speeds is instant
const ttsCache = new Map<string, string>();

// Build lazy-cached fast lookup dictionaries from built-in app vocab (0 Baht!)
let enDictCache: Map<string, { word: string; reading?: string; meaningTh: string }> | null = null;
let cnDictCache: Map<string, { word: string; reading?: string; meaningTh: string }> | null = null;

function getEnDict() {
  if (enDictCache) return enDictCache;
  const map = new Map<string, { word: string; reading?: string; meaningTh: string }>();
  for (const v of allENVocab) {
    const key = v.word.toLowerCase().trim();
    if (!map.has(key)) {
      map.set(key, {
        word: v.word,
        reading: v.phonetic,
        meaningTh: v.translations.slice(0, 3).join(', '),
      });
    }
  }
  enDictCache = map;
  return map;
}

function getCnDict() {
  if (cnDictCache) return cnDictCache;
  const map = new Map<string, { word: string; reading?: string; meaningTh: string }>();
  for (const v of allCNVocab) {
    const key = v.word.trim();
    if (!map.has(key)) {
      map.set(key, {
        word: v.word,
        reading: v.pinyin,
        meaningTh: v.translations.slice(0, 3).join(', '),
      });
    }
  }
  cnDictCache = map;
  return map;
}

function lookupEnglishWord(
  rawToken: string,
  storyVocab: ReadingKeyVocab[]
): LookupWordInfo {
  const cleaned = rawToken.replace(/^[^a-zA-Z'-]+|[^a-zA-Z'-]+$/g, '');
  const lower = cleaned.toLowerCase();

  // 1. Check story's curated vocab first (exact or stem)
  for (const v of storyVocab) {
    const vl = v.word.toLowerCase();
    if (
      vl === lower ||
      vl.split(/\s+/).includes(lower) ||
      (lower.length > 3 && (lower.startsWith(vl) || vl.startsWith(lower)))
    ) {
      return {
        word: v.word,
        reading: v.reading,
        pos: v.pos,
        meaningTh: v.meaningTh,
        isFromStoryVocab: true,
      };
    }
  }

  // 2. Check built-in app dictionary with light English inflection stripping
  const dict = getEnDict();
  const candidates = [lower];
  if (lower.endsWith('ies') && lower.length > 4) candidates.push(lower.slice(0, -3) + 'y');
  if (lower.endsWith('es') && lower.length > 3) candidates.push(lower.slice(0, -2));
  if (lower.endsWith('s') && lower.length > 3) candidates.push(lower.slice(0, -1));
  if (lower.endsWith('ing') && lower.length > 5) {
    candidates.push(lower.slice(0, -3));
    candidates.push(lower.slice(0, -3) + 'e');
  }
  if (lower.endsWith('ed') && lower.length > 4) {
    candidates.push(lower.slice(0, -2));
    candidates.push(lower.slice(0, -1));
  }
  if (lower.endsWith('ly') && lower.length > 4) candidates.push(lower.slice(0, -2));

  for (const c of candidates) {
    const hit = dict.get(c);
    if (hit) {
      return {
        word: hit.word,
        reading: hit.reading,
        meaningTh: hit.meaningTh,
      };
    }
  }

  return {
    word: cleaned || rawToken,
    meaningTh: 'ยังไม่พบในพจนานุกรมย่อ — กด "ถาม AI อธิบาย" เพื่อดูความหมายและบริบทในประโยคนี้ได้ทันที',
  };
}

function segmentChineseSentence(
  text: string,
  storyVocab: ReadingKeyVocab[]
): Array<{ text: string; isWord: boolean; isKeyVocab: boolean }> {
  const storySet = new Set(storyVocab.map((v) => v.word));
  const dict = getCnDict();
  const chars = Array.from(text);
  const result: Array<{ text: string; isWord: boolean; isKeyVocab: boolean }> = [];

  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (!/[\u4e00-\u9fff]/.test(ch)) {
      result.push({ text: ch, isWord: false, isKeyVocab: false });
      i++;
      continue;
    }

    // Greedy longest match (up to 4 chars) prioritizing storyVocab then built-in HSK dict
    let matchedLen = 1;
    let isKey = false;
    for (let len = Math.min(4, chars.length - i); len >= 1; len--) {
      const sub = chars.slice(i, i + len).join('');
      if (storySet.has(sub)) {
        matchedLen = len;
        isKey = true;
        break;
      }
      if (len >= 2 && dict.has(sub)) {
        matchedLen = len;
        break;
      }
    }

    const token = chars.slice(i, i + matchedLen).join('');
    result.push({ text: token, isWord: true, isKeyVocab: isKey });
    i += matchedLen;
  }

  return result;
}

export default function ReadingReaderView({
  story,
  progress,
  hasNextStory,
  onBack,
  onNextStory,
  onAskAI,
}: ReadingReaderViewProps) {
  const isCn = story.lang === 'CN';
  const [speed, setSpeed] = useState<0.75 | 1.0 | 1.25>(1.0);
  const [showThai, setShowThai] = useState(true);
  const [showPinyin, setShowPinyin] = useState(true);

  const [playingSentenceIdx, setPlayingSentenceIdx] = useState<number | null>(null);
  const [isAutoPlayingAll, setIsAutoPlayingAll] = useState(false);

  const [selectedWord, setSelectedWord] = useState<LookupWordInfo | null>(null);

  // Quiz state
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [isMarkedRead, setIsMarkedRead] = useState(Boolean(progress?.completed));

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayRef = useRef(false);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const storyVocabMap = useMemo(() => {
    const m = new Map<string, ReadingKeyVocab>();
    for (const v of story.vocab) m.set(v.word.toLowerCase(), v);
    return m;
  }, [story.vocab]);

  const stopAudio = () => {
    autoPlayRef.current = false;
    setIsAutoPlayingAll(false);
    setPlayingSentenceIdx(null);
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {
        // ignore
      }
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    stopAudio();
    setSelectedWord(null);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(0);
    setIsMarkedRead(Boolean(progress?.completed));
    return () => stopAudio();
  }, [story.id]);

  const speakText = async (
    text: string,
    onDone?: () => void
  ): Promise<void> => {
    if (!text.trim()) {
      onDone?.();
      return;
    }

    // Cancel prior audio without resetting autoPlayRef
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        // ignore
      }
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }

    const cacheKey = `${story.lang}:${text}`;
    let base64 = ttsCache.get(cacheKey);

    if (!base64) {
      try {
        const reqBody: Record<string, string> = {
          text,
          lang: isCn ? 'CN' : 'EN',
        };
        if (!isCn) reqBody.voice = 'en-US-ChristopherNeural';
        const res = await fetch('/api/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.audio) {
            base64 = data.audio as string;
            ttsCache.set(cacheKey, base64);
          }
        }
      } catch {
        // fallback below
      }
    }

    if (base64) {
      const audio = new Audio(`data:audio/mp3;base64,${base64}`);
      audio.playbackRate = speedRef.current;
      audioRef.current = audio;
      audio.onended = () => {
        audioRef.current = null;
        onDone?.();
      };
      audio.onerror = () => {
        audioRef.current = null;
        onDone?.();
      };
      audio.play().catch(() => onDone?.());
      return;
    }

    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = isCn ? 'zh-CN' : 'en-US';
      utter.rate = speedRef.current;
      utter.onend = () => onDone?.();
      utter.onerror = () => onDone?.();
      window.speechSynthesis.speak(utter);
    } else {
      onDone?.();
    }
  };

  const playSingleSentence = (idx: number) => {
    if (playingSentenceIdx === idx && !isAutoPlayingAll) {
      stopAudio();
      return;
    }
    stopAudio();
    setPlayingSentenceIdx(idx);
    speakText(story.sentences[idx].text, () => {
      setPlayingSentenceIdx((cur) => (cur === idx ? null : cur));
    });
  };

  const playFromSentence = (startIdx: number) => {
    if (startIdx >= story.sentences.length) {
      stopAudio();
      return;
    }
    setPlayingSentenceIdx(startIdx);
    const el = document.getElementById(`reading-sent-${startIdx}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    speakText(story.sentences[startIdx].text, () => {
      if (autoPlayRef.current) {
        playFromSentence(startIdx + 1);
      } else {
        setPlayingSentenceIdx(null);
      }
    });
  };

  const togglePlayAll = () => {
    if (isAutoPlayingAll) {
      stopAudio();
      return;
    }
    stopAudio();
    autoPlayRef.current = true;
    setIsAutoPlayingAll(true);
    playFromSentence(0);
  };

  const handleWordClick = (
    rawWord: string,
    sentenceText: string,
    sentenceTh: string
  ) => {
    if (isCn) {
      const storyHit = storyVocabMap.get(rawWord.toLowerCase());
      if (storyHit) {
        setSelectedWord({
          word: storyHit.word,
          reading: storyHit.reading,
          pos: storyHit.pos,
          meaningTh: storyHit.meaningTh,
          example: sentenceText,
          exampleTh: sentenceTh,
          isFromStoryVocab: true,
        });
        return;
      }
      const dictHit = getCnDict().get(rawWord);
      if (dictHit) {
        setSelectedWord({
          word: dictHit.word,
          reading: dictHit.reading,
          meaningTh: dictHit.meaningTh,
          example: sentenceText,
          exampleTh: sentenceTh,
        });
        return;
      }
      setSelectedWord({
        word: rawWord,
        meaningTh: 'ยังไม่พบในพจนานุกรมย่อ — กด "ถาม AI อธิบาย" เพื่อดูความหมายและวิธีใช้ในประโยคนี้',
        example: sentenceText,
        exampleTh: sentenceTh,
      });
      return;
    }

    const info = lookupEnglishWord(rawWord, story.vocab);
    setSelectedWord({
      ...info,
      example: sentenceText,
      exampleTh: sentenceTh,
    });
  };

  const handleSubmitQuiz = async () => {
    if (quizSubmitted) return;
    let correct = 0;
    const wrongItems: Array<{
      lang: 'EN' | 'CN';
      source: 'reading';
      sourceLabel: string;
      prompt: string;
      options: string[];
      correctOptionIndex: number;
      userWrongAnswer: string;
      correctAnswer: string;
      explanationTh: string;
    }> = [];

    story.quiz.forEach((q, idx) => {
      const picked = quizAnswers[idx];
      if (picked === q.correctIndex) {
        correct += 1;
      } else {
        wrongItems.push({
          lang: story.lang,
          source: 'reading',
          sourceLabel: `อ่านเรื่องสั้น (${story.level}) · ${story.titleTh}`,
          prompt: `${q.questionTh} (จากเรื่อง "${story.title}")`,
          options: [...q.options],
          correctOptionIndex: q.correctIndex,
          userWrongAnswer: typeof picked === 'number' ? q.options[picked] || '' : '(ไม่ได้ตอบ)',
          correctAnswer: q.options[q.correctIndex] || '',
          explanationTh: q.explanationTh,
        });
      }
    });

    setQuizScore(correct);
    setQuizSubmitted(true);
    setIsMarkedRead(true);

    await recordReadingCompletion({
      story,
      completed: true,
      quizScore: correct,
      quizTotal: story.quiz.length,
    });

    if (wrongItems.length > 0) {
      logMistakesBatch(wrongItems).catch(() => {});
    }
  };

  const handleManualMarkComplete = async () => {
    setIsMarkedRead(true);
    await recordReadingCompletion({
      story,
      completed: true,
    });
  };

  const categoryLabel =
    READING_CATEGORIES.find((c) => c.id === story.category)?.labelTh || story.category;
  const allQuizAnswered =
    story.quiz.length > 0 && story.quiz.every((_, idx) => typeof quizAnswers[idx] === 'number');

  return (
    <div className="max-w-4xl mx-auto pb-12 animate-in fade-in duration-200">
      {/* Top Navigation Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <button
          type="button"
          onClick={() => {
            stopAudio();
            onBack();
          }}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-indigo-700 transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>กลับไปคลังเรื่องสั้น</span>
        </button>

        <div className="flex items-center gap-2">
          {isMarkedRead && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
              <CheckCircle2 size={14} />
              <span>อ่านจบแล้ว</span>
            </span>
          )}
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-extrabold border ${
              isCn
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
            }`}
          >
            {story.level}
          </span>
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600">
            {categoryLabel}
          </span>
        </div>
      </div>

      {/* Article Header Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 sm:p-8 mb-5">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-2">
          <Clock size={14} />
          <span>ใช้เวลาอ่านประมาณ {story.estimatedMinutes} นาที</span>
          <span>·</span>
          <span>{story.sentences.length} ประโยค</span>
          {story.isCustom && (
            <>
              <span>·</span>
              <span className="text-indigo-600 font-bold">บทความส่วนตัว</span>
            </>
          )}
        </div>
        <h1
          className={`text-2xl sm:text-3xl font-black text-slate-900 leading-tight ${
            isCn ? 'font-serif' : ''
          }`}
        >
          {story.title}
        </h1>
        {isCn && story.titlePinyin && showPinyin && (
          <p className="text-sm text-rose-600/90 font-mono mt-1.5">{story.titlePinyin}</p>
        )}
        <p className="text-base font-bold text-slate-600 mt-2">{story.titleTh}</p>
        <p className="text-sm text-slate-500 mt-1">{story.summaryTh}</p>

        {/* Sticky-friendly Audio & Display Control Bar */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={togglePlayAll}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-xs transition-all cursor-pointer ${
                isAutoPlayingAll
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : isCn
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isAutoPlayingAll ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
              <span>{isAutoPlayingAll ? 'หยุดฟังทั้งเรื่อง' : 'ฟังทั้งเรื่องทีละประโยค'}</span>
            </button>

            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200">
              {([0.75, 1.0, 1.25] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setSpeed(r);
                    if (audioRef.current) audioRef.current.playbackRate = r;
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold tabular-nums transition-all cursor-pointer ${
                    speed === r
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {r}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isCn && (
              <button
                type="button"
                onClick={() => setShowPinyin((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  showPinyin
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {showPinyin ? <Eye size={14} /> : <EyeOff size={14} />}
                <span>พินอิน</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowThai((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                showThai
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {showThai ? <Eye size={14} /> : <EyeOff size={14} />}
              <span>คำแปลไทย</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tap-to-Explain Word Popover Banner (sticky when a word is tapped) */}
      {selectedWord && (
        <div className="sticky top-2 z-20 mb-5 rounded-2xl bg-white border-2 border-indigo-300 shadow-lg p-4 animate-in fade-in duration-150">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span
                  className={`text-xl font-black text-slate-900 ${isCn ? 'font-serif' : ''}`}
                >
                  {selectedWord.word}
                </span>
                <button
                  type="button"
                  onClick={() => speakText(selectedWord.word)}
                  className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="ฟังเสียงคำนี้"
                >
                  <Volume2 size={14} />
                </button>
                {selectedWord.pos && (
                  <span className="text-xs font-bold text-indigo-600">{selectedWord.pos}</span>
                )}
                {selectedWord.reading && (
                  <span className="text-xs font-mono text-slate-500">{selectedWord.reading}</span>
                )}
              </div>
              <p className="text-sm text-slate-700 font-medium mt-1.5 leading-relaxed">
                {selectedWord.meaningTh}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <SaveToWordbookButton
                word={selectedWord.word}
                lang={story.lang}
                meaningTh={selectedWord.meaningTh}
                reading={selectedWord.reading}
                partOfSpeech={selectedWord.pos}
                example={selectedWord.example}
                exampleTh={selectedWord.exampleTh}
                source="reading"
                sourceLabel={`${story.level} · ${story.titleTh}`}
                size="sm"
                compactLabel
              />
              {onAskAI && (
                <button
                  type="button"
                  onClick={() =>
                    onAskAI(
                      `ช่วยอธิบายคำว่า "${selectedWord.word}" ในประโยค "${selectedWord.example || ''}" พร้อมตัวอย่างการใช้เพิ่มเติมหน่อยครับ`
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 text-xs font-bold cursor-pointer"
                >
                  <Bot size={13} />
                  <span>ถาม AI</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedWord(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                title="ปิดคำอธิบาย"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Story Body */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-7 mb-6">
        <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <BookOpen size={14} className="text-indigo-500" />
            <span>แตะที่คำศัพท์ใดก็ได้ในเนื้อเรื่องเพื่อดูความหมายและบันทึกเข้าสมุดศัพท์ SRS</span>
          </div>
        </div>

        <div className="space-y-4">
          {story.sentences.map((sent, idx) => {
            const isActive = playingSentenceIdx === idx;
            return (
              <div
                id={`reading-sent-${idx}`}
                key={idx}
                className={`p-4 rounded-2xl border transition-all ${
                  isActive
                    ? isCn
                      ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-100'
                      : 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-100'
                    : 'bg-slate-50/40 border-slate-100 hover:border-slate-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => playSingleSentence(idx)}
                    className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      isActive
                        ? isCn
                          ? 'bg-rose-600 text-white'
                          : 'bg-indigo-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                    title="ฟังประโยคนี้"
                  >
                    {isActive ? <Square size={12} fill="currentColor" /> : <Volume2 size={15} />}
                  </button>

                  <div className="flex-1 min-w-0">
                    {/* Interactive clickable text */}
                    <p
                      className={`text-lg sm:text-xl leading-relaxed text-slate-900 ${
                        isCn ? 'font-serif tracking-wide' : 'font-medium'
                      }`}
                    >
                      {isCn
                        ? segmentChineseSentence(sent.text, story.vocab).map((seg, sIdx) =>
                            seg.isWord ? (
                              <button
                                key={sIdx}
                                type="button"
                                onClick={() => handleWordClick(seg.text, sent.text, sent.th)}
                                className={`inline rounded px-0.5 transition-colors cursor-pointer ${
                                  seg.isKeyVocab
                                    ? 'underline decoration-rose-300 decoration-dotted underline-offset-4 hover:bg-rose-100 text-slate-900'
                                    : 'hover:bg-amber-100/80 text-slate-900'
                                }`}
                              >
                                {seg.text}
                              </button>
                            ) : (
                              <span key={sIdx}>{seg.text}</span>
                            )
                          )
                        : sent.text.split(/(\s+)/).map((part, pIdx) => {
                            if (/^\s+$/.test(part)) return <span key={pIdx}>{part}</span>;
                            const cleanLower = part
                              .replace(/^[^a-zA-Z'-]+|[^a-zA-Z'-]+$/g, '')
                              .toLowerCase();
                            const isKey = story.vocab.some(
                              (v) =>
                                v.word.toLowerCase() === cleanLower ||
                                v.word.toLowerCase().split(/\s+/).includes(cleanLower)
                            );
                            return (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => handleWordClick(part, sent.text, sent.th)}
                                className={`inline rounded px-0.5 transition-colors cursor-pointer ${
                                  isKey
                                    ? 'underline decoration-indigo-300 decoration-dotted underline-offset-4 hover:bg-indigo-100 font-semibold text-slate-900'
                                    : 'hover:bg-amber-100/80 text-slate-900'
                                }`}
                              >
                                {part}
                              </button>
                            );
                          })}
                    </p>

                    {isCn && showPinyin && sent.pinyin && (
                      <p className="text-xs sm:text-sm font-mono text-rose-600/85 mt-1.5 leading-relaxed">
                        {sent.pinyin}
                      </p>
                    )}

                    {showThai && sent.th && (
                      <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{sent.th}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Key Vocabulary Deck */}
      {story.vocab.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6 mb-6">
          <h2 className="text-lg font-extrabold text-slate-900 mb-1">
            คำศัพท์สำคัญจากเรื่อง ({story.vocab.length} คำ)
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            กดฟังเสียงหรือกด "+ สมุดศัพท์" เพื่อส่งเข้าตารางทบทวนอัจฉริยะ (SRS) ได้ทันที
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {story.vocab.map((v, i) => (
              <div
                key={`${v.word}-${i}`}
                className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/60 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-base font-extrabold text-slate-900 ${
                        isCn ? 'font-serif' : ''
                      }`}
                    >
                      {v.word}
                    </span>
                    <button
                      type="button"
                      onClick={() => speakText(v.word)}
                      className="w-6 h-6 rounded-full bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-600 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Volume2 size={12} />
                    </button>
                    {v.pos && <span className="text-xs font-semibold text-indigo-600">{v.pos}</span>}
                  </div>
                  {v.reading && (
                    <div className="text-xs font-mono text-slate-500 mt-0.5">{v.reading}</div>
                  )}
                  <div className="text-sm text-slate-700 font-medium mt-1">{v.meaningTh}</div>
                </div>

                <div className="shrink-0">
                  <SaveToWordbookButton
                    word={v.word}
                    lang={story.lang}
                    meaningTh={v.meaningTh}
                    reading={v.reading}
                    partOfSpeech={v.pos}
                    source="reading"
                    sourceLabel={`${story.level} · ${story.titleTh}`}
                    size="sm"
                    compactLabel
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3-Question Comprehension Quiz */}
      {story.quiz.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-7 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                ควิซวัดความเข้าใจท้ายเรื่อง ({story.quiz.length} ข้อ)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                ข้อที่ตอบผิดจะถูกส่งเข้า "สมุดซ่อมจุดอ่อน" อัตโนมัติเพื่อให้กลับมาติวซ้ำได้
              </p>
            </div>
            {quizSubmitted && (
              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm font-black tabular-nums">
                <Award size={16} />
                <span>
                  ได้คะแนน {quizScore} / {story.quiz.length}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-5">
            {story.quiz.map((q, qIdx) => {
              const picked = quizAnswers[qIdx];
              const isCorrect = quizSubmitted && picked === q.correctIndex;
              return (
                <div
                  key={qIdx}
                  className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50"
                >
                  <p className="text-sm sm:text-base font-bold text-slate-900 mb-3">
                    {qIdx + 1}. {q.questionTh}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {q.options.map((opt, oIdx) => {
                      const isSelected = picked === oIdx;
                      const isRightOpt = oIdx === q.correctIndex;
                      let cls =
                        'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40';
                      if (quizSubmitted) {
                        if (isRightOpt) {
                          cls = 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold';
                        } else if (isSelected && !isRightOpt) {
                          cls = 'bg-rose-50 border-rose-400 text-rose-900 font-bold';
                        } else {
                          cls = 'bg-white border-slate-200 text-slate-400 opacity-75';
                        }
                      } else if (isSelected) {
                        cls = 'bg-indigo-600 border-indigo-600 text-white font-bold shadow-xs';
                      }

                      return (
                        <button
                          key={oIdx}
                          type="button"
                          disabled={quizSubmitted}
                          onClick={() =>
                            setQuizAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))
                          }
                          className={`text-left px-3.5 py-2.5 rounded-xl border text-sm transition-all flex items-center justify-between gap-2 cursor-pointer disabled:cursor-default ${cls}`}
                        >
                          <span>{opt}</span>
                          {quizSubmitted && isRightOpt && (
                            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                          )}
                          {quizSubmitted && isSelected && !isRightOpt && (
                            <XCircle size={16} className="text-rose-600 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {quizSubmitted && q.explanationTh && (
                    <div
                      className={`mt-3 px-3.5 py-2.5 rounded-xl text-xs leading-relaxed ${
                        isCorrect
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-50 text-amber-900 border border-amber-200'
                      }`}
                    >
                      <b>เฉลย:</b> {q.explanationTh}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            {!quizSubmitted ? (
              <button
                type="button"
                disabled={!allQuizAnswered}
                onClick={handleSubmitQuiz}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-xs transition-all disabled:opacity-45 cursor-pointer ${
                  isCn ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                ส่งคำตอบและตรวจผล
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setQuizAnswers({});
                  setQuizSubmitted(false);
                  setQuizScore(0);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold cursor-pointer"
              >
                <RotateCcw size={14} />
                <span>ทำควิซอีกครั้ง</span>
              </button>
            )}

            <div className="flex items-center gap-2.5">
              {!isMarkedRead && (
                <button
                  type="button"
                  onClick={handleManualMarkComplete}
                  className="px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold cursor-pointer"
                >
                  ทำเครื่องหมายว่าอ่านจบแล้ว
                </button>
              )}
              {hasNextStory && onNextStory && (
                <button
                  type="button"
                  onClick={() => {
                    stopAudio();
                    onNextStory();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                >
                  <span>อ่านเรื่องถัดไป</span>
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
