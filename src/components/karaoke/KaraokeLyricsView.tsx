import React, { useEffect, useRef, useState } from 'react';
import { KaraokeLanguage, KaraokeLine } from '../../types/karaoke';
import { Repeat, ArrowDownCircle, Sparkles } from 'lucide-react';

interface KaraokeLyricsViewProps {
  lines: KaraokeLine[];
  language: KaraokeLanguage;
  isSynced: boolean;
  effectiveTimeSec: number;
  activeLineIndex: number;
  loopLineIndex: number | null;
  showThai: boolean;
  showPinyin: boolean;
  onLineClick: (line: KaraokeLine) => void;
  onToggleLoopLine: (lineIndex: number) => void;
  onWordTap: (word: string, lineText: string) => void;
}

/**
 * Tokenize a lyric line into clickable words/chunks so learners can tap any word to get instant explanations.
 */
function tokenizeLine(text: string, language: KaraokeLanguage): Array<{ token: string; clickable: boolean }> {
  if (!text) return [];
  if (language === 'zh') {
    // Group contiguous Chinese characters into 2-char readable segments or single chars while preserving punctuation/spaces
    const parts: Array<{ token: string; clickable: boolean }> = [];
    const regex = /([\u4E00-\u9FFF]+|[a-zA-Z0-9']+|[^\u4E00-\u9FFFa-zA-Z0-9']+)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const seg = m[0];
      if (/^[\u4E00-\u9FFF]+$/.test(seg)) {
        // Split long Hanzi runs into clickable 1-2 char words for comfortable tapping
        for (let i = 0; i < seg.length; i += 2) {
          parts.push({ token: seg.slice(i, i + 2), clickable: true });
        }
      } else if (/^[a-zA-Z0-9']+$/.test(seg)) {
        parts.push({ token: seg, clickable: true });
      } else {
        parts.push({ token: seg, clickable: false });
      }
    }
    return parts;
  }

  // English: split keeping spaces & punctuation intact
  const parts: Array<{ token: string; clickable: boolean }> = [];
  const regex = /([a-zA-Z0-9''-]+|[^a-zA-Z0-9''-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const seg = m[0];
    const isWord = /[a-zA-Z]/.test(seg);
    parts.push({ token: seg, clickable: isWord });
  }
  return parts;
}

function formatTimestamp(sec: number): string {
  if (sec < 0 || !Number.isFinite(sec)) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const KaraokeLyricsView: React.FC<KaraokeLyricsViewProps> = ({
  lines,
  language,
  isSynced,
  effectiveTimeSec,
  activeLineIndex,
  loopLineIndex,
  showThai,
  showPinyin,
  onLineClick,
  onToggleLoopLine,
  onWordTap,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [userScrolling, setUserScrolling] = useState(false);
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isChinese = language === 'zh';

  // Auto-scroll active line into smooth center view (paused briefly if user manually scrolls)
  useEffect(() => {
    if (!isSynced || activeLineIndex < 0 || userScrolling) return;
    const el = lineRefs.current[activeLineIndex];
    const container = scrollContainerRef.current;
    if (!el || !container) return;

    const targetTop = el.offsetTop - container.clientHeight * 0.36 + el.clientHeight / 2;
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
  }, [activeLineIndex, isSynced, userScrolling]);

  const handleManualScroll = () => {
    if (!isSynced) return;
    setUserScrolling(true);
    if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current);
    userScrollTimerRef.current = setTimeout(() => {
      setUserScrolling(false);
    }, 4500);
  };

  const scrollBackToActive = () => {
    setUserScrolling(false);
    const el = lineRefs.current[activeLineIndex];
    const container = scrollContainerRef.current;
    if (el && container) {
      const targetTop = el.offsetTop - container.clientHeight * 0.36 + el.clientHeight / 2;
      container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    }
  };

  if (lines.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
        <p className="font-bold text-slate-600">ไม่พบเนื้อเพลงสำหรับเวอร์ชันนี้</p>
        <p className="text-xs mt-1">ลองกดปุ่ม "เปลี่ยนเวอร์ชันเนื้อเพลง" ด้านซ้ายเพื่อค้นหาใหม่ได้เลยครับ</p>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      {/* Subtle tip header */}
      <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
        <span className="flex items-center gap-1.5">
          <Sparkles size={12} className={isChinese ? 'text-rose-500' : 'text-indigo-500'} />
          <span>คลิกบรรทัดเพื่อกระโดดไปท่อนนั้น • แตะที่คำศัพท์เพื่อดูคำอธิบาย</span>
        </span>
        {!isSynced && (
          <span className="font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
            โหมดเนื้อเพลงปกติ (ไม่ระบุเวลา)
          </span>
        )}
      </div>

      {/* Scrollable Lyrics Canvas */}
      <div
        ref={scrollContainerRef}
        onWheel={handleManualScroll}
        onTouchMove={handleManualScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-2.5 scroll-smooth"
      >
        {lines.map((line, idx) => {
          const isActive = isSynced && idx === activeLineIndex;
          const isPast = isSynced && activeLineIndex >= 0 && idx < activeLineIndex;
          const isLooped = loopLineIndex === idx;

          // Compute smooth 0..100% left-to-right karaoke sweep progress on active line
          let sweepPct = 0;
          if (isActive && line.timeSec >= 0) {
            const dur = Math.max(0.6, line.endSec - line.timeSec);
            sweepPct = Math.max(0, Math.min(100, ((effectiveTimeSec - line.timeSec) / dur) * 100));
          }

          const tokens = tokenizeLine(line.text, language);
          const accentBg = isChinese ? 'bg-rose-50/90 border-rose-200/90' : 'bg-indigo-50/90 border-indigo-200/90';
          const accentBar = isChinese ? 'bg-rose-500' : 'bg-indigo-600';
          const activeWordColor = isChinese ? 'text-rose-700' : 'text-indigo-700';

          return (
            <div
              key={`${line.index}_${line.timeSec}`}
              ref={(el) => {
                lineRefs.current[idx] = el;
              }}
              onClick={() => onLineClick(line)}
              className={`group relative rounded-2xl border px-4 sm:px-5 py-3.5 transition-all duration-200 cursor-pointer select-none ${
                isActive
                  ? `${accentBg} shadow-sm scale-[1.01]`
                  : isLooped
                  ? 'bg-amber-50/70 border-amber-200'
                  : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50/80'
              }`}
            >
              {/* Left active indicator strip */}
              {isActive && (
                <div
                  className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${accentBar}`}
                />
              )}

              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  {/* Pinyin row above Hanzi for Chinese songs */}
                  {isChinese && showPinyin && line.pinyin && (
                    <div
                      className={`text-xs sm:text-sm font-medium tracking-wide leading-snug transition-colors ${
                        isActive
                          ? 'text-rose-600 font-semibold'
                          : isPast
                          ? 'text-slate-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {line.pinyin}
                    </div>
                  )}

                  {/* Primary Lyric Text with clickable words & active sweep */}
                  <div
                    className={`leading-relaxed transition-all duration-200 ${
                      isActive
                        ? 'text-lg sm:text-xl font-extrabold text-slate-900'
                        : isPast
                        ? 'text-base sm:text-[17px] font-semibold text-slate-400'
                        : 'text-base sm:text-[17px] font-semibold text-slate-700'
                    }`}
                  >
                    {tokens.map((part, tIdx) => {
                      if (!part.clickable) {
                        return <span key={tIdx}>{part.token}</span>;
                      }
                      // Highlight words progressively across the active line
                      const tokenProgress = tokens.length > 0 ? ((tIdx + 0.5) / tokens.length) * 100 : 0;
                      const isSwept = isActive && sweepPct >= tokenProgress;
                      return (
                        <span
                          key={tIdx}
                          onClick={(e) => {
                            e.stopPropagation();
                            onWordTap(part.token.trim(), line.text);
                          }}
                          title="แตะเพื่อดูคำอธิบายคำนี้"
                          className={`rounded px-0.5 transition-colors duration-150 ${
                            isSwept ? activeWordColor : ''
                          } hover:bg-white/90 hover:underline decoration-dotted underline-offset-4`}
                        >
                          {part.token}
                        </span>
                      );
                    })}
                  </div>

                  {/* Thai Translation row */}
                  {showThai && line.thaiTranslation && (
                    <div
                      className={`text-xs sm:text-sm leading-relaxed transition-colors ${
                        isActive
                          ? 'text-slate-700 font-medium'
                          : isPast
                          ? 'text-slate-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {line.thaiTranslation}
                    </div>
                  )}
                </div>

                {/* Right meta: timestamp + loop button */}
                <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                  {isSynced && line.timeSec >= 0 && (
                    <span className="text-[11px] font-mono text-slate-400">
                      {formatTimestamp(line.timeSec)}
                    </span>
                  )}
                  {isSynced && line.timeSec >= 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleLoopLine(idx);
                      }}
                      title={isLooped ? 'ปิดการวนซ้ำท่อนนี้' : 'วนซ้ำเฉพาะท่อนนี้เพื่อฝึกออกเสียง'}
                      className={`p-1.5 rounded-lg border text-xs transition-all ${
                        isLooped
                          ? 'bg-amber-500 border-amber-500 text-white shadow-2xs'
                          : 'bg-white/80 border-slate-200 text-slate-400 opacity-70 group-hover:opacity-100 hover:text-indigo-600 hover:border-indigo-200'
                      }`}
                    >
                      <Repeat size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Smooth bottom progress sweep line for the currently singing line */}
              {isActive && (
                <div className="mt-2.5 h-1 w-full bg-white/80 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-[width] duration-75 ease-linear ${accentBar}`}
                    style={{ width: `${sweepPct}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Bottom padding so final lines center cleanly */}
        <div className="h-28" />
      </div>

      {/* Return to active line button when user scrolled manually */}
      {isSynced && userScrolling && activeLineIndex >= 0 && (
        <button
          type="button"
          onClick={scrollBackToActive}
          className="absolute bottom-4 right-5 z-20 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-lg hover:bg-slate-800 transition-all"
        >
          <ArrowDownCircle size={15} />
          <span>กลับไปท่อนปัจจุบัน</span>
        </button>
      )}
    </div>
  );
};

export default KaraokeLyricsView;
