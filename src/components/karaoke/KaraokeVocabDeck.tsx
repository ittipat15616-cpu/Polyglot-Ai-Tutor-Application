import React, { useState } from 'react';
import { KaraokeLanguage, KaraokeLine, KaraokeVocabItem } from '../../types/karaoke';
import { Volume2, Play, BookOpen, Loader2 } from 'lucide-react';
import SaveToWordbookButton from '../wordbook/SaveToWordbookButton';

interface KaraokeVocabDeckProps {
  vocabDeck: KaraokeVocabItem[];
  lines: KaraokeLine[];
  language: KaraokeLanguage;
  songTitle?: string;
  onSeekToTime?: (timeSec: number) => void;
}

export const KaraokeVocabDeck: React.FC<KaraokeVocabDeckProps> = ({
  vocabDeck,
  lines,
  language,
  songTitle,
  onSeekToTime,
}) => {
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const isChinese = language === 'zh';

  const speakWord = async (text: string, idx: number) => {
    setSpeakingIdx(idx);
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
          audio.onended = () => setSpeakingIdx(null);
          audio.onerror = () => setSpeakingIdx(null);
          await audio.play();
          return;
        }
      }
    } catch {}
    // Browser SpeechSynthesis fallback
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = isChinese ? 'zh-CN' : 'en-US';
      utter.onend = () => setSpeakingIdx(null);
      utter.onerror = () => setSpeakingIdx(null);
      window.speechSynthesis.speak(utter);
    } catch {
      setSpeakingIdx(null);
    }
  };

  const findLineTime = (quote: string): number | null => {
    if (!quote) return null;
    const cleanQ = quote.trim().toLowerCase();
    const hit = lines.find(
      (l) => l.timeSec >= 0 && l.text.toLowerCase().includes(cleanQ.slice(0, Math.min(18, cleanQ.length)))
    );
    return hit ? hit.timeSec : null;
  };

  if (!vocabDeck || vocabDeck.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        ยังไม่มีรายการคำศัพท์สกัดสำหรับเพลงนี้
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen size={15} className={isChinese ? 'text-rose-600' : 'text-indigo-600'} />
          <h4 className="text-sm font-bold text-slate-900">
            คลังคำศัพท์ & สำนวนเด่นจากเพลงนี้ ({vocabDeck.length} คำ)
          </h4>
        </div>
        <span className="text-[11px] text-slate-500">แตะลำโพงเพื่อฟังเสียงอ่าน</span>
      </div>

      <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 gap-3 content-start">
        {vocabDeck.map((item, idx) => {
          const lineTime = findLineTime(item.exampleLine);
          return (
            <div
              key={`${item.word}_${idx}`}
              className="rounded-2xl bg-white border border-slate-200 p-4 hover:border-indigo-200 transition-all shadow-2xs space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-lg font-extrabold text-slate-900">{item.word}</span>
                    {item.reading && (
                      <span className={`text-xs font-semibold ${isChinese ? 'text-rose-600' : 'text-indigo-600'}`}>
                        {item.reading}
                      </span>
                    )}
                    {item.partOfSpeech && (
                      <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        {item.partOfSpeech}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold text-slate-800 mt-1">{item.meaningTh}</div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <SaveToWordbookButton
                    word={item.word}
                    lang={isChinese ? 'CN' : 'EN'}
                    meaningTh={item.meaningTh}
                    reading={item.reading}
                    partOfSpeech={item.partOfSpeech}
                    example={item.exampleLine}
                    source="karaoke"
                    sourceLabel={songTitle ? `เพลง ${songTitle}` : 'คาราโอเกะ'}
                    size="xs"
                    compactLabel
                  />
                  <button
                    type="button"
                    onClick={() => speakWord(item.word, idx)}
                    disabled={speakingIdx === idx}
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition-all ${
                      speakingIdx === idx
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border-slate-200'
                    }`}
                    title="ฟังเสียงอ่าน"
                  >
                    {speakingIdx === idx ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
                  </button>
                </div>
              </div>

              {item.noteTh && (
                <p className="text-xs text-slate-600 leading-relaxed">{item.noteTh}</p>
              )}

              {item.exampleLine && (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-500 italic truncate">“{item.exampleLine}”</p>
                  {lineTime !== null && onSeekToTime && (
                    <button
                      type="button"
                      onClick={() => onSeekToTime(lineTime)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 shrink-0"
                    >
                      <Play size={11} fill="currentColor" />
                      <span>ฟังในเพลง</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default KaraokeVocabDeck;
