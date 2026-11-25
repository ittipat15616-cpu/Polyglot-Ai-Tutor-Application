import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookMarked,
  Bot,
  CheckCircle2,
  Clock,
  Edit3,
  Loader2,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import {
  formatNextReviewLabel,
  getCachedWordbookEntries,
  getLocalReviewLogs,
  getWordMasteryStatus,
  isWordDueForReview,
  normalizeWordbookLang,
  removeWordFromWordbook,
  saveWordToWordbook,
  syncWordbookWithFirestore,
} from '../../services/wordbookService';
import { WordbookEntry, WordbookSource } from '../../types/wordbook';
import SrsReviewDeck from './SrsReviewDeck';
import ProgressDashboardView from './ProgressDashboardView';
import MistakeNotebookView from './MistakeNotebookView';
import { getActiveMistakeCount, syncMistakesWithFirestore } from '../../services/mistakeService';

interface StudyHubAreaProps {
  activeLang: 'EN' | 'CN' | 'TH';
  userName?: string;
  onNavigateTab?: (tabId: string) => void;
  onAskAI?: (word: string) => void;
}

type HubSection = 'progress' | 'wordbook' | 'mistakes';
type StatusFilter = 'all' | 'due' | 'learning' | 'mastered';
type SourceFilter = 'all' | WordbookSource;

const SOURCE_OPTIONS: Array<{ id: SourceFilter; label: string }> = [
  { id: 'all', label: 'ทุกแหล่งที่มา' },
  { id: 'lessons', label: 'คลังคำศัพท์' },
  { id: 'karaoke', label: 'คาราโอเกะ' },
  { id: 'flashcards', label: 'แฟลชการ์ด' },
  { id: 'manual', label: 'เพิ่มเอง' },
];

const SOURCE_LABEL_MAP: Record<WordbookSource, string> = {
  lessons: 'คลังคำศัพท์',
  flashcards: 'แฟลชการ์ด',
  karaoke: 'คาราโอเกะ',
  reading: 'อ่านเรื่องสั้น',
  manual: 'เพิ่มเอง',
};

export const StudyHubArea: React.FC<StudyHubAreaProps> = ({
  activeLang,
  userName,
  onNavigateTab,
  onAskAI,
}) => {
  const lang = normalizeWordbookLang(activeLang);
  const isChinese = lang === 'CN';

  const [hubSection, setHubSection] = useState<HubSection>('progress');
  const [entries, setEntries] = useState<WordbookEntry[]>(() =>
    getCachedWordbookEntries(lang)
  );
  const [activeMistakeCount, setActiveMistakeCount] = useState<number>(() =>
    getActiveMistakeCount(lang)
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  // Review session state
  const [reviewQueue, setReviewQueue] = useState<WordbookEntry[] | null>(null);
  const [isPracticeAllMode, setIsPracticeAllMode] = useState(false);

  // Add / Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WordbookEntry | null>(null);
  const [formWord, setFormWord] = useState('');
  const [formReading, setFormReading] = useState('');
  const [formMeaningTh, setFormMeaningTh] = useState('');
  const [formExample, setFormExample] = useState('');
  const [formExampleTh, setFormExampleTh] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSavingForm, setIsSavingForm] = useState(false);

  // Audio playback
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const refresh = () => setEntries(getCachedWordbookEntries(lang));
    refresh();
    setIsSyncing(true);
    syncWordbookWithFirestore()
      .then(() => refresh())
      .finally(() => setIsSyncing(false));

    window.addEventListener('wordbook_updated', refresh);
    const refreshMistakes = () => setActiveMistakeCount(getActiveMistakeCount(lang));
    refreshMistakes();
    syncMistakesWithFirestore().then(() => refreshMistakes());
    window.addEventListener('mistakes_updated', refreshMistakes);
    return () => {
      window.removeEventListener('wordbook_updated', refresh);
      window.removeEventListener('mistakes_updated', refreshMistakes);
    };
  }, [lang]);

  // Reset active review session cleanly if user switches top-bar language EN <-> CN
  useEffect(() => {
    setReviewQueue(null);
    setStatusFilter('all');
    setSourceFilter('all');
    setSearchQuery('');
  }, [lang]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {}
      }
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
    };
  }, []);

  const speakWord = async (entry: WordbookEntry) => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {}
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    setSpeakingId(entry.id);
    try {
      const voice = isChinese ? 'zh-CN-XiaoxiaoNeural' : 'en-US-JennyNeural';
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: entry.word, lang: isChinese ? 'CN' : 'EN', voice }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.audio) {
          const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
          audioRef.current = audio;
          audio.onended = () => setSpeakingId(null);
          audio.onerror = () => setSpeakingId(null);
          await audio.play();
          return;
        }
      }
    } catch {}
    try {
      const utter = new SpeechSynthesisUtterance(entry.word);
      utter.lang = isChinese ? 'zh-CN' : 'en-US';
      utter.onend = () => setSpeakingId(null);
      utter.onerror = () => setSpeakingId(null);
      window.speechSynthesis.speak(utter);
    } catch {
      setSpeakingId(null);
    }
  };

  const now = Date.now();
  const dueEntries = useMemo(
    () =>
      entries
        .filter((e) => isWordDueForReview(e, now))
        .sort((a, b) => a.nextReviewAt - b.nextReviewAt),
    [entries, now]
  );

  const metrics = useMemo(() => {
    let dueCount = 0;
    let learningCount = 0;
    let masteredCount = 0;
    for (const entry of entries) {
      const st = getWordMasteryStatus(entry, now);
      if (st === 'due' || st === 'new') dueCount += 1;
      else if (st === 'mastered') masteredCount += 1;
      else learningCount += 1;
    }
    const todayLogs = getLocalReviewLogs(lang);
    const todayKey = new Date().toLocaleDateString('en-CA');
    const reviewedToday =
      todayLogs.find((l) => l.dateKey === todayKey)?.reviewedCount || 0;

    return {
      total: entries.length,
      dueCount,
      learningCount,
      masteredCount,
      reviewedToday,
    };
  }, [entries, lang, now]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false;
      if (statusFilter !== 'all') {
        const st = getWordMasteryStatus(entry, now);
        if (statusFilter === 'due' && st !== 'due' && st !== 'new') return false;
        if (statusFilter === 'learning' && st !== 'learning') return false;
        if (statusFilter === 'mastered' && st !== 'mastered') return false;
      }
      if (!q) return true;
      return (
        entry.word.toLowerCase().includes(q) ||
        (entry.reading || '').toLowerCase().includes(q) ||
        entry.meaningTh.toLowerCase().includes(q) ||
        (entry.example || '').toLowerCase().includes(q) ||
        (entry.sourceLabel || '').toLowerCase().includes(q)
      );
    });
  }, [entries, searchQuery, statusFilter, sourceFilter, now]);

  const openAddModal = () => {
    setEditingEntry(null);
    setFormWord('');
    setFormReading('');
    setFormMeaningTh('');
    setFormExample('');
    setFormExampleTh('');
    setFormNote('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (entry: WordbookEntry) => {
    setEditingEntry(entry);
    setFormWord(entry.word);
    setFormReading(entry.reading || '');
    setFormMeaningTh(entry.meaningTh);
    setFormExample(entry.example || '');
    setFormExampleTh(entry.exampleTh || '');
    setFormNote(entry.note || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formWord.trim()) {
      setFormError('กรุณากรอกคำศัพท์');
      return;
    }
    if (!formMeaningTh.trim()) {
      setFormError('กรุณากรอกคำแปลภาษาไทย');
      return;
    }

    setIsSavingForm(true);
    setFormError(null);
    try {
      // If editing and word changed, remove old doc ID to avoid orphan duplicate
      if (
        editingEntry &&
        editingEntry.word.trim().toLowerCase() !== formWord.trim().toLowerCase()
      ) {
        await removeWordFromWordbook(editingEntry.id);
      }
      await saveWordToWordbook({
        lang,
        word: formWord.trim(),
        reading: formReading.trim() || undefined,
        meaningTh: formMeaningTh.trim(),
        example: formExample.trim() || undefined,
        exampleTh: formExampleTh.trim() || undefined,
        note: formNote.trim() || undefined,
        source: editingEntry ? editingEntry.source : 'manual',
        sourceLabel: editingEntry?.sourceLabel,
      });
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || 'ไม่สามารถบันทึกคำศัพท์ได้');
    } finally {
      setIsSavingForm(false);
    }
  };

  const handleDeleteEntry = async (entry: WordbookEntry) => {
    await removeWordFromWordbook(entry.id);
  };

  const startDueReview = () => {
    if (dueEntries.length === 0) return;
    setIsPracticeAllMode(false);
    setReviewQueue(dueEntries);
  };

  const startPracticeAll = () => {
    if (entries.length === 0) return;
    setIsPracticeAllMode(true);
    // Prioritize lowest stage first
    const ordered = [...entries].sort((a, b) => a.stage - b.stage || a.nextReviewAt - b.nextReviewAt);
    setReviewQueue(ordered.slice(0, 20));
  };

  // Render focused Review Deck when a review session is active
  if (reviewQueue !== null) {
    return (
      <div className="pb-10">
        <SrsReviewDeck
          entries={reviewQueue}
          lang={lang}
          isPracticeAllMode={isPracticeAllMode}
          onExit={() => {
            setReviewQueue(null);
            setEntries(getCachedWordbookEntries(lang));
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Unified Study Hub Section Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
          <span className={isChinese ? 'text-rose-600' : 'text-indigo-600'}>
            {isChinese ? '🇨🇳 ภาษาจีนกลาง (CN)' : '🇬🇧 ภาษาอังกฤษ (EN)'}
          </span>
          <span className="text-slate-300">•</span>
          <span>ศูนย์รวมพัฒนาการและสมุดเรียนส่วนตัว</span>
        </div>

        <div className="inline-flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setHubSection('progress')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap ${
              hubSection === 'progress'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 size={14} className={hubSection === 'progress' ? (isChinese ? 'text-rose-600' : 'text-indigo-600') : ''} />
            <span>พัฒนาการ & การ์ดแชร์</span>
          </button>

          <button
            type="button"
            onClick={() => setHubSection('wordbook')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap ${
              hubSection === 'wordbook'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookMarked size={14} className={hubSection === 'wordbook' ? (isChinese ? 'text-rose-600' : 'text-indigo-600') : ''} />
            <span>สมุดคำศัพท์ SRS</span>
            {metrics.dueCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold tabular-nums">
                {metrics.dueCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setHubSection('mistakes')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap ${
              hubSection === 'mistakes'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck size={14} className={hubSection === 'mistakes' ? (isChinese ? 'text-rose-600' : 'text-indigo-600') : ''} />
            <span>ซ่อมจุดอ่อน</span>
            {activeMistakeCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold tabular-nums">
                {activeMistakeCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {hubSection === 'progress' ? (
        <ProgressDashboardView
          lang={lang}
          userName={userName}
          onNavigateTab={onNavigateTab}
          onOpenWordbookDue={() => {
            setHubSection('wordbook');
            if (dueEntries.length > 0) startDueReview();
          }}
          onOpenMistakes={() => setHubSection('mistakes')}
        />
      ) : hubSection === 'mistakes' ? (
        <MistakeNotebookView
          lang={lang}
          onNavigateTab={onNavigateTab}
          onAskAI={onAskAI}
        />
      ) : (
        <>
          {/* Top Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-1">
                <BookMarked size={14} className={isChinese ? 'text-rose-600' : 'text-indigo-600'} />
                <span>{isChinese ? '🇨🇳 ภาษาจีน (CN)' : '🇬🇧 ภาษาอังกฤษ (EN)'}</span>
                {isSyncing && (
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <Loader2 size={12} className="animate-spin" /> กำลังซิงก์ข้อมูล
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                สมุดคำศัพท์ส่วนตัว & ทบทวนอัจฉริยะ (SRS)
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                รวบรวมคำศัพท์ที่คุณบันทึกจากคลังคำศัพท์ คาราโอเกะ และแฟลชการ์ด พร้อมจัดตารางทบทวน 1 → 3 → 7 → 14 → 30 วันอัตโนมัติ
              </p>
            </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 text-slate-800 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus size={15} />
            <span>เพิ่มคำศัพท์เอง</span>
          </button>

          {dueEntries.length > 0 ? (
            <button
              type="button"
              onClick={startDueReview}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap ${
                isChinese
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              <Play size={14} fill="currentColor" />
              <span className="tabular-nums">เริ่มทบทวนวันนี้ ({dueEntries.length} คำ)</span>
            </button>
          ) : entries.length > 0 ? (
            <button
              type="button"
              onClick={startPracticeAll}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sparkles size={14} />
              <span>ฝึกทบทวนเพิ่ม</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Single-Elevation Summary Metrics Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-500">ถึงกำหนดทบทวนวันนี้</div>
          <div
            className={`text-2xl font-extrabold tabular-nums mt-1 ${
              metrics.dueCount > 0
                ? isChinese
                  ? 'text-rose-600'
                  : 'text-indigo-600'
                : 'text-emerald-600'
            }`}
          >
            {metrics.dueCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            ทบทวนไปแล้ววันนี้ {metrics.reviewedToday} ครั้ง
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-500">คำศัพท์ในสมุดทั้งหมด</div>
          <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1">
            {metrics.total}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {isChinese ? 'เฉพาะภาษาจีน' : 'เฉพาะภาษาอังกฤษ'}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-500">กำลังจดจำ (1–7 วัน)</div>
          <div className="text-2xl font-extrabold text-amber-600 tabular-nums mt-1">
            {metrics.learningCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">รอทบทวนตามรอบ SRS</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-500">จำแม่นระยะยาว (14+ วัน)</div>
          <div className="text-2xl font-extrabold text-emerald-600 tabular-nums mt-1">
            {metrics.masteredCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {metrics.total > 0
              ? `${Math.round((metrics.masteredCount / metrics.total) * 100)}% ของทั้งหมด`
              : 'เริ่มต้นสะสมคำแรก'}
          </div>
        </div>
      </div>

      {/* Empty State vs Populated Wordbook */}
      {entries.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-5">
          <div
            className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center border ${
              isChinese
                ? 'bg-rose-50 text-rose-600 border-rose-200'
                : 'bg-indigo-50 text-indigo-600 border-indigo-200'
            }`}
          >
            <BookMarked size={30} />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-xl font-extrabold text-slate-900">
              ยังไม่มีคำศัพท์{isChinese ? 'ภาษาจีน' : 'ภาษาอังกฤษ'}ในสมุดส่วนตัว
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              กดปุ่ม <span className="font-bold text-slate-700">“+ สมุดศัพท์”</span> จากหน้าคลังคำศัพท์ แฟลชการ์ด หรือเพลงคาราโอเกะ หรือเพิ่มคำศัพท์เองด้านล่าง เพื่อให้ระบบ SRS ช่วยเตือนทบทวนก่อนลืมครับ
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={openAddModal}
              className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-xs font-bold transition-colors cursor-pointer ${
                isChinese ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              <Plus size={15} />
              <span>เพิ่มคำศัพท์คำแรกเอง</span>
            </button>
            {onNavigateTab && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigateTab('lessons')}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  ไปเลือกคำในคลังคำศัพท์
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('karaoke')}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  ไปเก็บคำจากคาราโอเกะ
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1 min-w-0">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`ค้นหาคำศัพท์${isChinese ? 'จีน / พินอิน' : 'อังกฤษ'} หรือคำแปลไทย...`}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70">
                {(
                  [
                    { id: 'all', label: 'ทั้งหมด' },
                    { id: 'due', label: `ต้องทวน (${metrics.dueCount})` },
                    { id: 'learning', label: 'กำลังจำ' },
                    { id: 'mastered', label: 'จำแม่นแล้ว' },
                  ] as Array<{ id: StatusFilter; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                      statusFilter === tab.id
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
                className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-400 cursor-pointer"
                aria-label="กรองตามแหล่งที่มา"
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filtered Results List */}
          {filteredEntries.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
              ไม่พบคำศัพท์ที่ตรงกับเงื่อนไขการค้นหา
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredEntries.map((entry) => {
                const status = getWordMasteryStatus(entry, now);
                const isDue = status === 'due' || status === 'new';
                const isMastered = status === 'mastered';
                const stageDots = Math.min(5, entry.stage);

                return (
                  <div
                    key={entry.id}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 p-4 sm:p-5 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center flex-wrap gap-2.5">
                          <span
                            className={`text-xl font-extrabold text-slate-900 ${
                              isChinese ? 'font-serif' : ''
                            }`}
                          >
                            {entry.word}
                          </span>
                          {entry.reading && (
                            <span
                              className={`text-sm font-mono font-semibold ${
                                isChinese ? 'text-rose-600' : 'text-indigo-600'
                              }`}
                            >
                              {entry.reading}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => speakWord(entry)}
                            disabled={speakingId === entry.id}
                            className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-indigo-50 border border-slate-200 text-slate-600 hover:text-indigo-600 flex items-center justify-center transition-colors cursor-pointer"
                            title="ฟังเสียงอ่าน"
                          >
                            {speakingId === entry.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Volume2 size={14} />
                            )}
                          </button>
                          {onAskAI && (
                            <button
                              type="button"
                              onClick={() => onAskAI(entry.word)}
                              className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-purple-50 border border-slate-200 text-slate-600 hover:text-purple-600 flex items-center justify-center transition-colors cursor-pointer"
                              title="ถามติวเตอร์ AI เกี่ยวกับคำนี้"
                            >
                              <Bot size={14} />
                            </button>
                          )}
                        </div>

                        <div className="text-sm sm:text-base font-bold text-slate-800">
                          {entry.meaningTh}
                        </div>

                        {entry.example && (
                          <div className="text-xs sm:text-sm text-slate-600 pt-1">
                            <span>“{entry.example}”</span>
                            {entry.exampleTh && (
                              <span className="text-slate-400"> — {entry.exampleTh}</span>
                            )}
                          </div>
                        )}

                        {entry.note && (
                          <div className="text-xs text-amber-700 pt-0.5">
                            โน้ต: {entry.note}
                          </div>
                        )}

                        {/* Plain metadata row (zero pill clutter) */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-slate-500">
                          <span>
                            ที่มา: {SOURCE_LABEL_MAP[entry.source] || entry.source}
                            {entry.sourceLabel ? ` · ${entry.sourceLabel}` : ''}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span
                            className={`inline-flex items-center gap-1 font-semibold tabular-nums ${
                              isDue
                                ? isChinese
                                  ? 'text-rose-600'
                                  : 'text-indigo-600'
                                : isMastered
                                ? 'text-emerald-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {isMastered ? (
                              <CheckCircle2 size={12} />
                            ) : (
                              <Clock size={12} />
                            )}
                            <span>{formatNextReviewLabel(entry, now)}</span>
                          </span>
                          <span className="text-slate-300">•</span>
                          <span
                            className="inline-flex items-center gap-1"
                            title={`ระดับความจำ SRS ขั้นที่ ${entry.stage}/6`}
                          >
                            <span className="text-slate-400">ระดับความจำ:</span>
                            <span className="inline-flex items-center gap-0.5">
                              {[0, 1, 2, 3, 4].map((dotIdx) => (
                                <span
                                  key={dotIdx}
                                  className={`w-2 h-2 rounded-full ${
                                    dotIdx < stageDots ? 'bg-emerald-500' : 'bg-slate-200'
                                  }`}
                                />
                              ))}
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* Right Actions */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-end gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setIsPracticeAllMode(!isDue);
                            setReviewQueue([entry]);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-bold transition-colors cursor-pointer"
                        >
                          ทบทวนคำนี้
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(entry)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="แก้ไขคำศัพท์"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(entry)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="ลบออกจากสมุดคำศัพท์"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Word Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {editingEntry ? 'แก้ไขคำศัพท์ในสมุดส่วนตัว' : 'เพิ่มคำศัพท์ใหม่เข้าสมุด SRS'}
                </h3>
                <p className="text-xs text-slate-500">
                  บันทึกในหมวด {isChinese ? '🇨🇳 ภาษาจีน (CN)' : '🇬🇧 ภาษาอังกฤษ (EN)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-6 space-y-4">
              {formError && (
                <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    คำศัพท์ *
                  </label>
                  <input
                    type="text"
                    value={formWord}
                    onChange={(e) => setFormWord(e.target.value)}
                    placeholder={isChinese ? 'เช่น 坚持' : 'เช่น resilient'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isChinese ? 'พินอิน (Pinyin)' : 'คำอ่าน (Phonetic)'}
                  </label>
                  <input
                    type="text"
                    value={formReading}
                    onChange={(e) => setFormReading(e.target.value)}
                    placeholder={isChinese ? 'เช่น jiānchí' : 'เช่น /rɪˈzɪl.jənt/'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ความหมายภาษาไทย *
                </label>
                <input
                  type="text"
                  value={formMeaningTh}
                  onChange={(e) => setFormMeaningTh(e.target.value)}
                  placeholder="เช่น ยืนหยัด, ไม่ยอมแพ้, ฟื้นตัวเร็ว"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ตัวอย่างประโยค (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={formExample}
                  onChange={(e) => setFormExample(e.target.value)}
                  placeholder={
                    isChinese
                      ? 'เช่น 只要坚持，就一定能成功。'
                      : 'เช่น She remained resilient despite the setbacks.'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  คำแปลประโยคตัวอย่าง (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={formExampleTh}
                  onChange={(e) => setFormExampleTh(e.target.value)}
                  placeholder="คำแปลไทยของประโยคตัวอย่าง"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  โน้ตช่วยจำส่วนตัว (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="เทคนิคช่วยจำหรือบริบทที่เจอบ่อย"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSavingForm}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer disabled:opacity-60"
                >
                  {isSavingForm && <Loader2 size={14} className="animate-spin" />}
                  <span>{editingEntry ? 'บันทึกการแก้ไข' : 'เพิ่มลงสมุดคำศัพท์'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default StudyHubArea;
