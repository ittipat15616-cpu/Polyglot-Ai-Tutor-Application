import React, { useState, useEffect, useCallback } from 'react';
import {
  Languages,
  Wand2,
  Camera,
  Mic,
  History,
  Key,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import {
  SavedPhraseItem,
  TranslatorHistoryItem,
  TranslatorLang,
  TranslatorStudioMode,
} from '../../types/translator';
import {
  clearTranslatorHistory,
  loadSavedPhrases,
  loadTranslatorHistory,
  removeSavedPhrase,
} from '../../services/translatorService';
import {
  BYOK_DAILY_LIMITS,
  getByokQuotaStatus,
  hasActiveByokKey,
} from '../../services/byokService';
import TextTranslatePanel from './TextTranslatePanel';
import NativePolishPanel from './NativePolishPanel';
import PhotoTranslatePanel from './PhotoTranslatePanel';
import VoiceInterpreterPanel from './VoiceInterpreterPanel';
import TranslatorHistoryDrawer from './TranslatorHistoryDrawer';

interface TranslatorAreaProps {
  activeLang: 'EN' | 'CN' | 'TH';
  onOpenByok: () => void;
}

const STUDIO_MODES: Array<{
  id: TranslatorStudioMode;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: 'text', label: 'แปลข้อความ & โทน', shortLabel: 'แปลข้อความ', icon: Languages },
  { id: 'polish', label: 'เกลาประโยคเจ้าของภาษา', shortLabel: 'เกลาประโยค', icon: Wand2 },
  { id: 'photo', label: 'แปลรูปภาพ / เมนู', shortLabel: 'แปลรูปภาพ', icon: Camera },
  { id: 'voice', label: 'ล่ามเสียง 2 ฝั่ง', shortLabel: 'ล่าม 2 ฝั่ง', icon: Mic },
];

export const TranslatorArea: React.FC<TranslatorAreaProps> = ({
  activeLang,
  onOpenByok,
}) => {
  const [mode, setMode] = useState<TranslatorStudioMode>('text');
  const [hasByok, setHasByok] = useState<boolean>(() => hasActiveByokKey());
  const [quotaRemaining, setQuotaRemaining] = useState<number>(
    () => getByokQuotaStatus('translate_ai').remaining
  );
  const [history, setHistory] = useState<TranslatorHistoryItem[]>(() => loadTranslatorHistory());
  const [savedPhrases, setSavedPhrases] = useState<SavedPhraseItem[]>(() => loadSavedPhrases());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [restorePayload, setRestorePayload] = useState<{
    nonce: number;
    sourceLang: TranslatorLang;
    targetLang: TranslatorLang;
    sourceText: string;
  } | null>(null);

  const [polishDraft, setPolishDraft] = useState<{
    text: string;
    lang: TranslatorLang;
  }>({
    text: '',
    lang: activeLang === 'CN' ? 'CN' : 'EN',
  });

  const refreshQuotaAndByok = useCallback(() => {
    setHasByok(hasActiveByokKey());
    setQuotaRemaining(getByokQuotaStatus('translate_ai').remaining);
  }, []);

  useEffect(() => {
    refreshQuotaAndByok();
    window.addEventListener('byok_key_updated', refreshQuotaAndByok);
    window.addEventListener('byok_quota_updated', refreshQuotaAndByok);
    return () => {
      window.removeEventListener('byok_key_updated', refreshQuotaAndByok);
      window.removeEventListener('byok_quota_updated', refreshQuotaAndByok);
    };
  }, [refreshQuotaAndByok]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 2800);
    return () => window.clearTimeout(t);
  }, [toastMsg]);

  const handleRefreshHistory = useCallback(() => {
    setHistory(loadTranslatorHistory());
  }, []);

  const handleRefreshSaved = useCallback(() => {
    setSavedPhrases(loadSavedPhrases());
  }, []);

  const handleJumpToPolish = (text: string, lang: TranslatorLang) => {
    setPolishDraft({ text, lang });
    setMode('polish');
  };

  const defaultForeignLang: TranslatorLang = activeLang === 'CN' ? 'CN' : 'EN';

  return (
    <div className="space-y-4 pb-6">
      {/* Compact Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              แปลภาษาอัจฉริยะ
            </h1>
            <span className="text-xs font-semibold text-emerald-700">
              ● แปลพื้นฐานฟรีไม่อั้น
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            ไทย • อังกฤษ • จีนกลาง (เจาะลึก) + ญี่ปุ่น • เกาหลี — ปรับโทน แยกศัพท์ลงสมุด เกลาประโยค แปลภาพ และล่าม 2 ฝั่ง
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={onOpenByok}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              hasByok
                ? 'bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
            }`}
            title="ตั้งค่า BYOK สำหรับโหมด AI เจาะลึก 150 ครั้ง/วัน"
          >
            {hasByok ? <Sparkles size={14} className="text-indigo-600" /> : <Key size={14} />}
            <span>
              {hasByok
                ? `AI เจาะลึก ${quotaRemaining}/${BYOK_DAILY_LIMITS.translate_ai}`
                : 'เชื่อม BYOK (ฟรี 150/วัน)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleRefreshHistory();
              handleRefreshSaved();
              setIsDrawerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:border-indigo-200 hover:text-indigo-700 transition-colors cursor-pointer"
          >
            <History size={14} />
            <span>ประวัติ & โปรด</span>
            {savedPhrases.length > 0 && (
              <span className="text-[11px] font-extrabold text-amber-600 tabular-nums">
                ({savedPhrases.length})
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Single-Row Segmented Mode Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1.5 bg-white border border-indigo-100 rounded-2xl shadow-2xs">
        {STUDIO_MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                active
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-indigo-700 hover:bg-indigo-50/60'
              }`}
            >
              <Icon size={15} />
              <span className="hidden md:inline">{m.label}</span>
              <span className="md:hidden">{m.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Active Workspace View */}
      {mode === 'text' && (
        <TextTranslatePanel
          defaultForeignLang={defaultForeignLang}
          restorePayload={restorePayload}
          hasByok={hasByok}
          aiQuotaRemaining={quotaRemaining}
          aiQuotaLimit={BYOK_DAILY_LIMITS.translate_ai}
          onOpenByok={onOpenByok}
          onNotify={showToast}
          onHistoryChanged={handleRefreshHistory}
          onSavedListChanged={handleRefreshSaved}
          onJumpToPolish={handleJumpToPolish}
        />
      )}

      {mode === 'polish' && (
        <NativePolishPanel
          initialText={polishDraft.text}
          initialLang={polishDraft.lang}
          hasByok={hasByok}
          onOpenByok={onOpenByok}
          onNotify={showToast}
          onSavedListChanged={handleRefreshSaved}
        />
      )}

      {mode === 'photo' && (
        <PhotoTranslatePanel
          hasByok={hasByok}
          onOpenByok={onOpenByok}
          onSwitchToFreeText={() => setMode('text')}
          onNotify={showToast}
          onSavedListChanged={handleRefreshSaved}
        />
      )}

      {mode === 'voice' && (
        <VoiceInterpreterPanel
          defaultForeignLang={defaultForeignLang}
          onOpenByok={onOpenByok}
          onNotify={showToast}
          onSavedListChanged={handleRefreshSaved}
        />
      )}

      {/* History & Saved Phrasebook Drawer */}
      <TranslatorHistoryDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        history={history}
        savedPhrases={savedPhrases}
        onRestoreHistory={(item) => {
          setMode('text');
          setRestorePayload({
            nonce: Date.now(),
            sourceLang: item.sourceLang,
            targetLang: item.targetLang,
            sourceText: item.sourceText,
          });
        }}
        onRestoreSaved={(item) => {
          setMode('text');
          setRestorePayload({
            nonce: Date.now(),
            sourceLang: item.sourceLang,
            targetLang: item.targetLang,
            sourceText: item.sourceText,
          });
        }}
        onRemoveSaved={(id) => {
          setSavedPhrases(removeSavedPhrase(id));
          showToast('ลบออกจากคลังโปรดแล้ว');
        }}
        onClearHistory={() => {
          clearTranslatorHistory();
          setHistory([]);
          showToast('ล้างประวัติการแปลทั้งหมดแล้ว');
        }}
      />

      {/* Lightweight Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-lg flex items-center gap-2 max-w-[90vw]">
          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
          <span className="truncate">{toastMsg}</span>
        </div>
      )}
    </div>
  );
};

export default TranslatorArea;
