import React, { useEffect, useState } from 'react';
import { BookmarkCheck, BookmarkPlus } from 'lucide-react';
import {
  isWordSavedInWordbook,
  normalizeWordbookLang,
  toggleWordInWordbook,
} from '../../services/wordbookService';
import { WordbookSource } from '../../types/wordbook';

interface SaveToWordbookButtonProps {
  word: string;
  lang: 'EN' | 'CN' | 'TH' | 'en' | 'zh' | string;
  meaningTh: string;
  reading?: string;
  partOfSpeech?: string;
  example?: string;
  exampleTh?: string;
  source: WordbookSource;
  sourceLabel?: string;
  size?: 'xs' | 'sm' | 'md';
  compactLabel?: boolean;
  className?: string;
}

export const SaveToWordbookButton: React.FC<SaveToWordbookButtonProps> = ({
  word,
  lang,
  meaningTh,
  reading,
  partOfSpeech,
  example,
  exampleTh,
  source,
  sourceLabel,
  size = 'sm',
  compactLabel = false,
  className = '',
}) => {
  const normalizedLang = normalizeWordbookLang(lang);
  const [saved, setSaved] = useState<boolean>(() => isWordSavedInWordbook(normalizedLang, word));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const syncState = () => setSaved(isWordSavedInWordbook(normalizedLang, word));
    syncState();
    window.addEventListener('wordbook_updated', syncState);
    return () => window.removeEventListener('wordbook_updated', syncState);
  }, [normalizedLang, word]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy || !word.trim()) return;
    setBusy(true);
    try {
      const res = await toggleWordInWordbook({
        lang: normalizedLang,
        word,
        meaningTh: meaningTh || 'ยังไม่ได้ระบุคำแปล',
        reading,
        partOfSpeech,
        example,
        exampleTh,
        source,
        sourceLabel,
      });
      setSaved(res.saved);
    } finally {
      setBusy(false);
    }
  };

  const sizeStyles =
    size === 'xs'
      ? 'px-2.5 py-1 text-[11px] rounded-lg gap-1'
      : size === 'md'
      ? 'px-3.5 py-2 text-xs rounded-xl gap-1.5'
      : 'px-3 py-1.5 text-xs rounded-xl gap-1.5';

  const iconSize = size === 'xs' ? 13 : 14;

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={busy}
      title={saved ? 'บันทึกอยู่ในสมุดคำศัพท์ SRS แล้ว (กดเพื่อนำออก)' : 'บันทึกเข้าสมุดคำศัพท์ส่วนตัว (SRS)'}
      className={`inline-flex items-center font-bold border transition-all whitespace-nowrap shrink-0 cursor-pointer ${sizeStyles} ${
        saved
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
          : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300'
      } ${className}`}
    >
      {saved ? <BookmarkCheck size={iconSize} /> : <BookmarkPlus size={iconSize} />}
      <span>
        {saved
          ? compactLabel
            ? 'บันทึกแล้ว'
            : 'อยู่ในสมุดศัพท์แล้ว'
          : compactLabel
          ? '+ สมุดศัพท์'
          : '+ บันทึกเข้าสมุดศัพท์'}
      </span>
    </button>
  );
};

export default SaveToWordbookButton;
