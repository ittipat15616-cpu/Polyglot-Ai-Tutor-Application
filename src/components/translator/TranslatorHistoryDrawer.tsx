import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, History, Star, Search, Volume2, Trash2, ArrowRight, RotateCcw } from 'lucide-react';
import {
  SavedPhraseItem,
  TRANSLATOR_LANGUAGES,
  TRANSLATOR_LANG_MAP,
  TranslatorHistoryItem,
  TranslatorLang,
} from '../../types/translator';
import { playTranslatorTTS } from '../../utils/audio';

interface TranslatorHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: TranslatorHistoryItem[];
  savedPhrases: SavedPhraseItem[];
  onRestoreHistory: (item: TranslatorHistoryItem) => void;
  onRestoreSaved: (item: SavedPhraseItem) => void;
  onRemoveSaved: (id: string) => void;
  onClearHistory: () => void;
}

export const TranslatorHistoryDrawer: React.FC<TranslatorHistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  savedPhrases,
  onRestoreHistory,
  onRestoreSaved,
  onRemoveSaved,
  onClearHistory,
}) => {
  const [activeTab, setActiveTab] = useState<'history' | 'saved'>('history');
  const [searchQuery, setSearchQuery] = useState('');
  const [langFilter, setLangFilter] = useState<'ALL' | TranslatorLang>('ALL');

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return history.filter((item) => {
      if (langFilter !== 'ALL' && item.sourceLang !== langFilter && item.targetLang !== langFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.sourceText.toLowerCase().includes(q) ||
        item.translatedText.toLowerCase().includes(q) ||
        (item.reading || '').toLowerCase().includes(q)
      );
    });
  }, [history, searchQuery, langFilter]);

  const filteredSaved = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return savedPhrases.filter((item) => {
      if (langFilter !== 'ALL' && item.sourceLang !== langFilter && item.targetLang !== langFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.sourceText.toLowerCase().includes(q) ||
        item.translatedText.toLowerCase().includes(q) ||
        (item.reading || '').toLowerCase().includes(q) ||
        (item.noteTh || '').toLowerCase().includes(q)
      );
    });
  }, [savedPhrases, searchQuery, langFilter]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/35 backdrop-blur-xs">
          <div className="flex-1" onClick={onClose} />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="w-full max-w-md bg-white h-full shadow-2xl border-l border-indigo-100 flex flex-col"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">ประวัติ & คลังประโยคโปรด</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="ปิดหน้าต่างประวัติ"
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Segmented Tab Switcher */}
            <div className="px-5 pt-3 pb-2 space-y-3 border-b border-slate-100">
              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'history'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <History size={14} />
                  <span>ประวัติล่าสุด ({history.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('saved')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'saved'
                      ? 'bg-white text-amber-700 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Star size={14} />
                  <span>คลังโปรด ({savedPhrases.length})</span>
                </button>
              </div>

              {/* Search & Language Filter */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหาคำหรือประโยค..."
                    className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:bg-white"
                  />
                </div>
                <select
                  value={langFilter}
                  onChange={(e) => setLangFilter(e.target.value as 'ALL' | TranslatorLang)}
                  className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-700 focus:outline-none focus:border-indigo-400"
                >
                  <option value="ALL">ทุกภาษา</option>
                  {TRANSLATOR_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.labelTh}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {activeTab === 'history' ? (
                filteredHistory.length === 0 ? (
                  <div className="py-16 text-center space-y-2 text-slate-400">
                    <History size={28} className="mx-auto opacity-40" />
                    <p className="text-sm font-medium text-slate-500">ยังไม่มีประวัติการแปล</p>
                    <p className="text-xs">ข้อความที่คุณแปลจะถูกเก็บไว้อัตโนมัติสูงสุด 50 รายการ</p>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={onClearHistory}
                        className="text-xs font-medium text-slate-400 hover:text-rose-600 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={12} />
                        <span>ล้างประวัติทั้งหมด</span>
                      </button>
                    </div>
                    {filteredHistory.map((item) => (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-2xl border border-slate-200/80 bg-white hover:border-indigo-200 transition-colors space-y-2"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span className="font-semibold text-slate-600 inline-flex items-center gap-1">
                            {TRANSLATOR_LANG_MAP[item.sourceLang].flag} {item.sourceLang}
                            <ArrowRight size={11} />
                            {TRANSLATOR_LANG_MAP[item.targetLang].flag} {item.targetLang}
                          </span>
                          <span>{item.isAiDeep ? '✦ AI เจาะลึก' : 'แปลไวฟรี'}</span>
                        </div>
                        <div className="text-xs text-slate-500 line-clamp-2">{item.sourceText}</div>
                        <div className="text-sm font-semibold text-slate-900 leading-snug">
                          {item.translatedText}
                        </div>
                        {item.reading && (
                          <div className="text-xs text-indigo-600">{item.reading}</div>
                        )}
                        <div className="pt-1.5 flex items-center justify-between border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => playTranslatorTTS(item.translatedText, item.targetLang)}
                            className="text-xs font-semibold text-slate-500 hover:text-indigo-700 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Volume2 size={13} />
                            <span>ฟังเสียง</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onRestoreHistory(item);
                              onClose();
                            }}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw size={12} />
                            <span>ดึงกลับมาแปล</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )
              ) : filteredSaved.length === 0 ? (
                <div className="py-16 text-center space-y-2 text-slate-400">
                  <Star size={28} className="mx-auto opacity-40" />
                  <p className="text-sm font-medium text-slate-500">ยังไม่มีรายการในคลังโปรด</p>
                  <p className="text-xs">กดรูปดาวที่คำแปล หรือกดบันทึกศัพท์ JP/KR เพื่อเก็บไว้ฟังซ้ำได้ทุกเวลา</p>
                </div>
              ) : (
                filteredSaved.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl border border-amber-200/70 bg-amber-50/20 hover:border-amber-300 transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-semibold inline-flex items-center gap-1">
                        {TRANSLATOR_LANG_MAP[item.sourceLang].flag} {item.sourceLang}
                        <ArrowRight size={11} />
                        {TRANSLATOR_LANG_MAP[item.targetLang].flag} {item.targetLang}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveSaved(item.id)}
                        aria-label="ลบออกจากคลังโปรด"
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="text-xs text-slate-600">{item.sourceText}</div>
                    <div className="text-sm font-bold text-slate-900 leading-snug">
                      {item.translatedText}
                    </div>
                    {item.reading && <div className="text-xs text-indigo-600">{item.reading}</div>}
                    {item.thaiPhonetic && (
                      <div className="text-xs text-slate-500">คำอ่านไทย: {item.thaiPhonetic}</div>
                    )}
                    {item.noteTh && (
                      <div className="text-xs text-slate-500 italic">{item.noteTh}</div>
                    )}
                    <div className="pt-1.5 flex items-center justify-between border-t border-amber-100/80">
                      <button
                        type="button"
                        onClick={() =>
                          playTranslatorTTS(
                            item.targetLang === 'TH' ? item.sourceText : item.translatedText,
                            item.targetLang === 'TH' ? item.sourceLang : item.targetLang
                          )
                        }
                        className="text-xs font-semibold text-slate-600 hover:text-indigo-700 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Volume2 size={13} />
                        <span>ฟังเสียง</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onRestoreSaved(item);
                          onClose();
                        }}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw size={12} />
                        <span>เปิดในหน้าแปล</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};

export default TranslatorHistoryDrawer;
