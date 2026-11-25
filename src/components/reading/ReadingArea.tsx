import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  FilePlus2,
  Loader2,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  CN_READING_LEVELS,
  EN_READING_LEVELS,
  READING_CATEGORIES,
  READING_TARGET_COUNTS,
  ReadingCategory,
  ReadingLang,
  ReadingProgressEntry,
  ReadingStory,
} from '../../types/reading';
import { loadAllReadingStoriesForLang } from '../../data/reading';
import {
  deleteCustomArticle,
  getLocalCustomArticles,
  getLocalReadingProgressMap,
  syncCustomArticlesWithFirestore,
  syncReadingProgressWithFirestore,
} from '../../services/readingService';
import ReadingReaderView from './ReadingReaderView';
import CustomArticleModal from './CustomArticleModal';

interface ReadingAreaProps {
  activeLang: 'EN' | 'CN' | 'TH';
  onAskAI?: (prompt: string) => void;
}

export default function ReadingArea({ activeLang, onAskAI }: ReadingAreaProps) {
  const lang: ReadingLang = activeLang === 'CN' ? 'CN' : 'EN';
  const isCn = lang === 'CN';
  const levelDefs = isCn ? CN_READING_LEVELS : EN_READING_LEVELS;

  const [curatedStories, setCuratedStories] = useState<ReadingStory[]>([]);
  const [customStories, setCustomStories] = useState<ReadingStory[]>(() =>
    getLocalCustomArticles(lang)
  );
  const [progressMap, setProgressMap] = useState<Record<string, ReadingProgressEntry>>(() =>
    getLocalReadingProgressMap()
  );
  const [isLoading, setIsLoading] = useState(true);

  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<ReadingCategory | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [activeStory, setActiveStory] = useState<ReadingStory | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);

  // Load curated packs + sync user reading progress & custom articles when language changes
  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setActiveStory(null);
    setSelectedLevel('ALL');
    setSelectedCategory('ALL');
    setStatusFilter('all');
    setSearchQuery('');

    Promise.all([
      loadAllReadingStoriesForLang(lang),
      syncReadingProgressWithFirestore(),
      syncCustomArticlesWithFirestore(),
    ])
      .then(([stories, prog, custom]) => {
        if (!mounted) return;
        setCuratedStories(stories);
        setProgressMap(prog);
        setCustomStories(custom.filter((c) => c.lang === lang));
        setIsLoading(false);
      })
      .catch(() => {
        if (mounted) setIsLoading(false);
      });

    const onReadingUpdated = () => {
      setProgressMap(getLocalReadingProgressMap());
      setCustomStories(getLocalCustomArticles(lang));
    };
    window.addEventListener('reading_updated', onReadingUpdated);
    return () => {
      mounted = false;
      window.removeEventListener('reading_updated', onReadingUpdated);
    };
  }, [lang]);

  const allStoriesForLang = useMemo(
    () => [...customStories, ...curatedStories],
    [customStories, curatedStories]
  );

  const completedCuratedCount = useMemo(
    () => curatedStories.filter((s) => progressMap[s.id]?.completed).length,
    [curatedStories, progressMap]
  );

  const totalCompletedCount = useMemo(
    () => allStoriesForLang.filter((s) => progressMap[s.id]?.completed).length,
    [allStoriesForLang, progressMap]
  );

  const filteredStories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const baseList =
      selectedLevel === 'CUSTOM'
        ? customStories
        : selectedLevel === 'ALL'
        ? allStoriesForLang
        : allStoriesForLang.filter((s) => s.level === selectedLevel);

    return baseList.filter((story) => {
      if (selectedCategory !== 'ALL' && story.category !== selectedCategory) return false;
      const done = Boolean(progressMap[story.id]?.completed);
      if (statusFilter === 'completed' && !done) return false;
      if (statusFilter === 'unread' && done) return false;
      if (q) {
        const hay = `${story.title} ${story.titleTh} ${story.summaryTh} ${story.level}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    allStoriesForLang,
    customStories,
    selectedLevel,
    selectedCategory,
    statusFilter,
    searchQuery,
    progressMap,
  ]);

  useEffect(() => {
    setVisibleCount(24);
  }, [lang, selectedLevel, selectedCategory, statusFilter, searchQuery]);

  const visibleStories = useMemo(
    () => filteredStories.slice(0, visibleCount),
    [filteredStories, visibleCount]
  );

  if (activeStory) {
    const curIdx = filteredStories.findIndex((s) => s.id === activeStory.id);
    const nextStory =
      curIdx >= 0 && curIdx + 1 < filteredStories.length ? filteredStories[curIdx + 1] : null;
    return (
      <ReadingReaderView
        story={activeStory}
        progress={progressMap[activeStory.id]}
        hasNextStory={Boolean(nextStory)}
        onBack={() => setActiveStory(null)}
        onNextStory={nextStory ? () => setActiveStory(nextStory) : undefined}
        onAskAI={onAskAI}
      />
    );
  }

  const targetCount = READING_TARGET_COUNTS[lang];
  const progressPct =
    curatedStories.length > 0
      ? Math.min(100, Math.round((completedCuratedCount / curatedStories.length) * 100))
      : 0;

  return (
    <div className="max-w-6xl mx-auto pb-12 space-y-6 animate-in fade-in duration-200">
      {/* Header & Progress Banner */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-7">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                isCn ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
              }`}
            >
              <BookOpen size={24} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                คลังอ่านเรื่องสั้น & ข่าวสั้น ({isCn ? 'ภาษาจีน HSK 1–6' : 'ภาษาอังกฤษ A1–C1'})
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                ฟังเสียงทีละประโยค แตะคำแปลเก็บเข้าสมุดศัพท์ SRS และทำควิซ 3 ข้อท้ายเรื่อง ฟรี 100%
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowCustomModal(true)}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-xs transition-all shrink-0 cursor-pointer ${
              isCn ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            <FilePlus2 size={17} />
            <span>วางบทความเอง (AI)</span>
          </button>
        </div>

        {/* Reading Progress Bar */}
        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold text-slate-800 tabular-nums">
              อ่านจบแล้ว {totalCompletedCount} / {curatedStories.length} เรื่อง
            </span>
            {curatedStories.length >= targetCount ? (
              <span
                className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-md ${
                  isCn ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                ครบคลัง {curatedStories.length} เรื่อง · ฟรี 100%
              </span>
            ) : (
              <span className="text-xs text-slate-500 tabular-nums">
                (คลังปัจจุบัน {curatedStories.length} เรื่อง · เป้าหมายครบ {targetCount} เรื่อง)
              </span>
            )}
          </div>
          <div className="w-full sm:w-64 h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isCn ? 'bg-rose-500' : 'bg-indigo-600'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Level Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => setSelectedLevel('ALL')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition-all cursor-pointer ${
            selectedLevel === 'ALL'
              ? isCn
                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                : 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
          }`}
        >
          ทุกระดับ ({allStoriesForLang.length})
        </button>

        {levelDefs.map((lvl) => {
          const count = allStoriesForLang.filter((s) => s.level === lvl.id).length;
          const active = selectedLevel === lvl.id;
          return (
            <button
              key={lvl.id}
              type="button"
              onClick={() => setSelectedLevel(lvl.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition-all cursor-pointer ${
                active
                  ? isCn
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              {lvl.label} <span className="opacity-75 tabular-nums">({count})</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setSelectedLevel('CUSTOM')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition-all cursor-pointer ${
            selectedLevel === 'CUSTOM'
              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
          }`}
        >
          <Sparkles size={13} />
          <span>บทความของฉัน ({customStories.length})</span>
        </button>
      </div>

      {/* Search + Category + Status Filter Row */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อเรื่อง หัวข้อ หรือคำสำคัญ..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200 shrink-0 self-start">
            {(
              [
                { id: 'all', label: 'ทั้งหมด' },
                { id: 'unread', label: 'ยังไม่อ่าน' },
                { id: 'completed', label: 'อ่านจบแล้ว' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFilter(st.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === st.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter Row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              selectedCategory === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            ทุกหมวดหมู่
          </button>
          {READING_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                selectedCategory === cat.id
                  ? isCn
                    ? 'bg-rose-100 text-rose-800 font-bold'
                    : 'bg-indigo-100 text-indigo-800 font-bold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.labelTh}
            </button>
          ))}
        </div>
      </div>

      {/* Story Cards Grid */}
      {isLoading ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-16 flex flex-col items-center justify-center gap-3 text-slate-500">
          <Loader2 size={24} className="animate-spin text-indigo-600" />
          <span className="text-sm font-medium">กำลังโหลดคลังเรื่องสั้น...</span>
        </div>
      ) : filteredStories.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-14 text-center">
          <p className="text-base font-bold text-slate-800">ไม่พบบทความตามตัวกรองที่เลือก</p>
          <p className="text-sm text-slate-500 mt-1">
            {selectedLevel === 'CUSTOM'
              ? 'คุณยังไม่ได้เพิ่มบทความส่วนตัว กดปุ่ม "วางบทความเอง (AI)" ด้านบนเพื่อเริ่มต้นได้เลย'
              : 'ลองล้างตัวกรองหรือเปลี่ยนคำค้นหาดูอีกครั้ง'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span className="tabular-nums">
              แสดง {visibleStories.length} จาก {filteredStories.length} เรื่อง
            </span>
            {filteredStories.length > visibleStories.length && (
              <button
                type="button"
                onClick={() => setVisibleCount(filteredStories.length)}
                className={`font-bold hover:underline cursor-pointer ${
                  isCn ? 'text-rose-600' : 'text-indigo-600'
                }`}
              >
                แสดงทั้งหมด
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleStories.map((story) => {
            const prog = progressMap[story.id];
            const isDone = Boolean(prog?.completed);
            const catLabel =
              READING_CATEGORIES.find((c) => c.id === story.category)?.labelTh || story.category;

            return (
              <div
                key={story.id}
                onClick={() => setActiveStory(story)}
                className={`group bg-white rounded-2xl border p-5 flex flex-col justify-between gap-4 transition-all cursor-pointer hover:shadow-md ${
                  isDone
                    ? 'border-emerald-200 hover:border-emerald-300'
                    : isCn
                    ? 'border-slate-200 hover:border-rose-300'
                    : 'border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div>
                  {/* Top Row: Level + Category + Status */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold border ${
                          isCn
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}
                      >
                        {story.level}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        {catLabel}
                      </span>
                      {story.isCustom && (
                        <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                          ส่วนตัว
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isDone && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-bold">
                          <CheckCircle2 size={15} />
                        </span>
                      )}
                      {story.isCustom && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCustomArticle(story.id);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="ลบบทความนี้"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Titles */}
                  <h3
                    className={`text-lg font-extrabold text-slate-900 group-hover:text-indigo-700 transition-colors leading-snug ${
                      isCn ? 'font-serif group-hover:text-rose-700' : ''
                    }`}
                  >
                    {story.title}
                  </h3>
                  <p className="text-sm font-bold text-slate-600 mt-1">{story.titleTh}</p>
                  <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                    {story.summaryTh}
                  </p>
                </div>

                {/* Footer meta */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={13} /> {story.estimatedMinutes} นาที
                    </span>
                    <span>· {story.vocab.length} ศัพท์เด่น</span>
                  </div>

                  {prog && prog.quizTotal > 0 && prog.bestQuizScore > 0 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-bold tabular-nums">
                      <Award size={13} /> {prog.bestQuizScore}/{prog.quizTotal}
                    </span>
                  ) : (
                    <span
                      className={`font-bold ${
                        isCn ? 'text-rose-600' : 'text-indigo-600'
                      }`}
                    >
                      เริ่มอ่าน →
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          </div>

          {filteredStories.length > visibleStories.length && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + 24)}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
                  isCn
                    ? 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                    : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                }`}
              >
                แสดงเพิ่มอีก {Math.min(24, filteredStories.length - visibleStories.length)} เรื่อง
                <span className="ml-1.5 text-xs opacity-75 tabular-nums">
                  (เหลืออีก {filteredStories.length - visibleStories.length} เรื่อง)
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      <CustomArticleModal
        isOpen={showCustomModal}
        lang={lang}
        onClose={() => setShowCustomModal(false)}
        onCreated={(story) => {
          setCustomStories(getLocalCustomArticles(lang));
          setActiveStory(story);
        }}
      />
    </div>
  );
}
