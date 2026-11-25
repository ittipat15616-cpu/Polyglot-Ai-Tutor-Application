import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { MistakeEntry, MistakeSource } from '../../types/mistakes';
import { WordbookLang } from '../../types/wordbook';
import {
  getCachedMistakes,
  MASTERY_STREAK_TARGET,
  removeMistake,
  reopenMistake,
  syncMistakesWithFirestore,
} from '../../services/mistakeService';
import MistakeDrillSession from './MistakeDrillSession';
import SaveToWordbookButton from './SaveToWordbookButton';

interface MistakeNotebookViewProps {
  lang: WordbookLang;
  onNavigateTab?: (tabId: string) => void;
  onAskAI?: (prompt: string) => void;
}

type StatusFilter = 'active' | 'mastered' | 'all';
type SourceFilter = 'all' | MistakeSource;

const SOURCE_OPTIONS: Array<{ id: SourceFilter; label: string }> = [
  { id: 'all', label: 'ทุกแหล่งที่มา' },
  { id: 'vocab_exam', label: 'สอบศัพท์' },
  { id: 'exams', label: 'ข้อสอบ' },
  { id: 'mock_test', label: 'จำลองสอบ' },
  { id: 'reading', label: 'อ่านเรื่องสั้น' },
];

const SOURCE_LABEL_MAP: Record<MistakeSource, string> = {
  vocab_exam: 'สอบศัพท์',
  exams: 'ข้อสอบ',
  mock_test: 'จำลองสอบ',
  reading: 'อ่านเรื่องสั้น',
};

export const MistakeNotebookView: React.FC<MistakeNotebookViewProps> = ({
  lang,
  onNavigateTab,
  onAskAI,
}) => {
  const isChinese = lang === 'CN';
  const [entries, setEntries] = useState<MistakeEntry[]>(() => getCachedMistakes(lang));
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [drillItems, setDrillItems] = useState<MistakeEntry[] | null>(null);

  useEffect(() => {
    const refresh = () => setEntries(getCachedMistakes(lang));
    refresh();
    setIsSyncing(true);
    syncMistakesWithFirestore()
      .then(() => refresh())
      .finally(() => setIsSyncing(false));

    window.addEventListener('mistakes_updated', refresh);
    return () => window.removeEventListener('mistakes_updated', refresh);
  }, [lang]);

  useEffect(() => {
    setDrillItems(null);
    setStatusFilter('active');
    setSourceFilter('all');
    setSearchQuery('');
  }, [lang]);

  const metrics = useMemo(() => {
    let active = 0;
    let almostMastered = 0;
    let mastered = 0;
    for (const item of entries) {
      if (item.status === 'mastered') {
        mastered += 1;
      } else {
        active += 1;
        if (item.consecutiveCorrect === 1) almostMastered += 1;
      }
    }
    const total = entries.length;
    const masteryPct = total > 0 ? Math.round((mastered / total) * 100) : 0;
    return { total, active, almostMastered, mastered, masteryPct };
  }, [entries]);

  const activePool = useMemo(() => {
    return entries
      .filter((e) => e.status === 'active')
      .filter((e) => (sourceFilter === 'all' ? true : e.source === sourceFilter))
      .sort((a, b) => b.wrongCount - a.wrongCount || b.updatedAt - a.updatedAt);
  }, [entries, sourceFilter]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        item.prompt.toLowerCase().includes(q) ||
        item.correctAnswer.toLowerCase().includes(q) ||
        item.userWrongAnswer.toLowerCase().includes(q) ||
        item.sourceLabel.toLowerCase().includes(q) ||
        (item.explanationTh || '').toLowerCase().includes(q)
      );
    });
  }, [entries, statusFilter, sourceFilter, searchQuery]);

  const startTargetedDrill = (customItems?: MistakeEntry[]) => {
    const pool = customItems || activePool.slice(0, 10);
    if (pool.length === 0) return;
    setDrillItems(pool);
  };

  if (drillItems !== null) {
    return (
      <MistakeDrillSession
        items={drillItems}
        lang={lang}
        onAskAI={onAskAI}
        onExit={() => {
          setDrillItems(null);
          setEntries(getCachedMistakes(lang));
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-1">
            <ShieldCheck size={14} className={isChinese ? 'text-rose-600' : 'text-indigo-600'} />
            <span>{isChinese ? '🇨🇳 ภาษาจีนกลาง (CN)' : '🇬🇧 ภาษาอังกฤษ (EN)'}</span>
            {isSyncing && (
              <span className="inline-flex items-center gap-1 text-slate-400">
                <Loader2 size={12} className="animate-spin" /> กำลังซิงก์ข้อมูล
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            สมุดซ่อมจุดอ่อนอัตโนมัติ (Smart Mistake Notebook)
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            เก็บข้อที่ตอบผิดจากสอบศัพท์ ข้อสอบ และจำลองสอบอัตโนมัติ — ตอบถูกติดกัน {MASTERY_STREAK_TARGET} รอบเพื่อปลดล็อกเป็น “ซ่อมผ่านแล้ว”
          </p>
        </div>

        {activePool.length > 0 && (
          <button
            type="button"
            onClick={() => startTargetedDrill()}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isChinese ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            <Play size={14} fill="currentColor" />
            <span className="tabular-nums">
              เริ่มติวซ่อมจุดอ่อน ({Math.min(10, activePool.length)} ข้อ)
            </span>
          </button>
        )}
      </div>

      {/* 4 Single-Elevation Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-500">จุดอ่อนรอซ่อม</div>
          <div
            className={`text-2xl font-extrabold tabular-nums mt-1 ${
              metrics.active > 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {metrics.active}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            ข้อที่ยังต้องฝึกซ้ำ
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-500">ใกล้ผ่านแล้ว (1/2 รอบ)</div>
          <div className="text-2xl font-extrabold text-amber-600 tabular-nums mt-1">
            {metrics.almostMastered}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">ถูกอีก 1 รอบจะซ่อมผ่าน</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-500">ซ่อมผ่านแล้ว (Mastered)</div>
          <div className="text-2xl font-extrabold text-emerald-600 tabular-nums mt-1">
            {metrics.mastered}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">ตอบถูกครบ 2 รอบติด</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-500">อัตรากำจัดจุดอ่อน</div>
          <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1">
            {metrics.total > 0 ? `${metrics.masteryPct}%` : '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            จากทั้งหมด {metrics.total} ข้อที่เคยพลาด
          </div>
        </div>
      </div>

      {/* Empty State vs Populated Notebook */}
      {entries.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
            <ShieldCheck size={32} />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-xl font-extrabold text-slate-900">
              ยังไม่มีข้อผิดพลาดในสมุดซ่อมจุดอ่อน ({isChinese ? 'ภาษาจีน' : 'ภาษาอังกฤษ'})
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              เมื่อคุณทำข้อสอบในหน้า <span className="font-bold text-slate-700">สอบศัพท์</span>,{' '}
              <span className="font-bold text-slate-700">ข้อสอบ</span> หรือ{' '}
              <span className="font-bold text-slate-700">จำลองสอบ</span> ระบบจะดึงข้อที่ตอบผิดเข้ามาเก็บให้อัตโนมัติเพื่อให้คุณกดติวซ่อมได้ทันที
            </p>
          </div>
          {onNavigateTab && (
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => onNavigateTab('vocab_exam')}
                className={`px-4 py-2.5 rounded-xl text-white text-xs font-bold cursor-pointer ${
                  isChinese ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                ไปทำสอบศัพท์
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('exams')}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                ไปทำข้อสอบ
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('mocktests')}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                ไปจำลองสอบ
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
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
                placeholder="ค้นหาโจทย์ คำตอบที่พลาด เฉลย หรือชื่อชุดข้อสอบ..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70">
                {(
                  [
                    { id: 'active', label: `รอซ่อม (${metrics.active})` },
                    { id: 'mastered', label: `ผ่านแล้ว (${metrics.mastered})` },
                    { id: 'all', label: 'ทั้งหมด' },
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
                aria-label="กรองตามแหล่งที่มาข้อสอบ"
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* List */}
          {filteredEntries.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
              {statusFilter === 'active' && metrics.active === 0
                ? 'สุดยอดมาก! คุณซ่อมจุดอ่อนที่มีอยู่ผ่านครบทุกข้อแล้ว'
                : 'ไม่พบรายการจุดอ่อนที่ตรงกับเงื่อนไขการกรอง'}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredEntries.map((item) => {
                const isMastered = item.status === 'mastered';
                const streak = Math.min(MASTERY_STREAK_TARGET, item.consecutiveCorrect);

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 p-4 sm:p-5 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start gap-2">
                          {isMastered ? (
                            <CheckCircle2
                              size={17}
                              className="text-emerald-600 shrink-0 mt-0.5"
                            />
                          ) : (
                            <AlertTriangle
                              size={17}
                              className="text-amber-600 shrink-0 mt-0.5"
                            />
                          )}
                          <h4 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">
                            {item.prompt}
                          </h4>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl bg-rose-50/70 border border-rose-200/70 px-3 py-2">
                            <span className="text-rose-600 font-semibold">คำตอบที่เคยพลาด: </span>
                            <span className="font-bold text-rose-900">{item.userWrongAnswer}</span>
                          </div>
                          <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/70 px-3 py-2">
                            <span className="text-emerald-700 font-semibold">เฉลยที่ถูกต้อง: </span>
                            <span className="font-bold text-emerald-900">{item.correctAnswer}</span>
                          </div>
                        </div>

                        {item.explanationTh && (
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {item.explanationTh}
                          </p>
                        )}

                        {/* Clean metadata line (zero pill clutter) */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-slate-500">
                          <span>
                            {SOURCE_LABEL_MAP[item.source]} · {item.sourceLabel}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="tabular-nums">พลาดสะสม {item.wrongCount} ครั้ง</span>
                          <span className="text-slate-300">•</span>
                          <span
                            className={`font-bold tabular-nums ${
                              isMastered ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {isMastered
                              ? 'ซ่อมผ่านแล้ว (2/2 รอบ)'
                              : `ถูกติดกัน ${streak}/${MASTERY_STREAK_TARGET} รอบ`}
                          </span>
                        </div>
                      </div>

                      {/* Right Actions */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-end gap-1.5 shrink-0">
                        {!isMastered ? (
                          <button
                            type="button"
                            onClick={() => startTargetedDrill([item])}
                            className="px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            ซ่อมข้อนี้
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => reopenMistake(item.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                            title="นำกลับไปฝึกซ้ำในรายการรอซ่อม"
                          >
                            <RotateCcw size={12} />
                            <span>ฝึกซ้ำ</span>
                          </button>
                        )}

                        <div className="flex items-center gap-1.5">
                          {item.vocabWord && (
                            <SaveToWordbookButton
                              word={item.vocabWord}
                              lang={lang}
                              meaningTh={item.vocabMeaningTh || item.correctAnswer}
                              reading={item.reading}
                              example={item.vocabExample}
                              source="lessons"
                              sourceLabel={item.sourceLabel}
                              size="xs"
                              compactLabel
                            />
                          )}
                          {onAskAI && (
                            <button
                              type="button"
                              onClick={() =>
                                onAskAI(
                                  `ช่วยอธิบายข้อสอบที่ฉันเคยทำผิดข้อนี้หน่อยครับ: "${item.prompt}" คำตอบที่ถูกคือ "${item.correctAnswer}"`
                                )
                              }
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                              title="ถามติวเตอร์ AI อธิบายข้อนี้"
                            >
                              <Bot size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeMistake(item.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="ลบรายการนี้"
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
    </div>
  );
};

export default MistakeNotebookView;
