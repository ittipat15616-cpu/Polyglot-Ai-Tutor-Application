import React, { useState, useEffect } from 'react';
import { Volume2, BookmarkPlus, Check } from 'lucide-react';
import { VocabBreakdownItem, TRANSLATOR_LANG_MAP } from '../../types/translator';
import { isWordSavedInWordbook, saveWordToWordbook } from '../../services/wordbookService';
import { isPhraseSaved, toggleSavedPhrase } from '../../services/translatorService';
import { playTranslatorTTS } from '../../utils/audio';

interface VocabBreakdownCardProps {
  item: VocabBreakdownItem;
  exampleSentence?: string;
  exampleTh?: string;
  onNotify: (msg: string) => void;
  onSavedListChanged?: () => void;
}

export const VocabBreakdownCard: React.FC<VocabBreakdownCardProps> = ({
  item,
  exampleSentence,
  exampleTh,
  onNotify,
  onSavedListChanged,
}) => {
  const isWordbookEligible = item.wordLang === 'EN' || item.wordLang === 'CN';
  const [saved, setSaved] = useState<boolean>(() => {
    if (isWordbookEligible) {
      return isWordSavedInWordbook(item.wordLang as 'EN' | 'CN', item.word);
    }
    return isPhraseSaved(item.wordLang, 'TH', item.word, item.meaningTh);
  });
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    const syncState = () => {
      if (isWordbookEligible) {
        setSaved(isWordSavedInWordbook(item.wordLang as 'EN' | 'CN', item.word));
      } else {
        setSaved(isPhraseSaved(item.wordLang, 'TH', item.word, item.meaningTh));
      }
    };
    syncState();
    window.addEventListener('wordbook_updated', syncState);
    return () => window.removeEventListener('wordbook_updated', syncState);
  }, [item.word, item.wordLang, item.meaningTh, isWordbookEligible]);

  const handleSpeak = () => {
    setSpeaking(true);
    playTranslatorTTS(item.word, item.wordLang, {
      onEnd: () => setSpeaking(false),
    });
  };

  const handleSave = async () => {
    try {
      if (isWordbookEligible) {
        await saveWordToWordbook({
          lang: item.wordLang as 'EN' | 'CN',
          word: item.word,
          reading: item.reading,
          meaningTh: item.meaningTh,
          partOfSpeech: item.partOfSpeech,
          example: exampleSentence,
          exampleTh,
          note: item.noteTh,
          source: 'translator',
          sourceLabel: 'Smart Translator',
        });
        setSaved(true);
        onNotify(`บันทึก "${item.word}" เข้าสมุดศัพท์ SRS (${item.wordLang}) แล้ว`);
      } else {
        const result = toggleSavedPhrase({
          sourceLang: item.wordLang,
          targetLang: 'TH',
          sourceText: item.word,
          translatedText: item.meaningTh,
          reading: item.reading,
          noteTh: item.noteTh || item.partOfSpeech,
        });
        setSaved(result.saved);
        onSavedListChanged?.();
        onNotify(
          result.saved
            ? `บันทึก "${item.word}" (${TRANSLATOR_LANG_MAP[item.wordLang].labelTh}) ลงคลังโปรดแล้ว`
            : `นำ "${item.word}" ออกจากคลังโปรดแล้ว`
        );
      }
    } catch {
      onNotify('ไม่สามารถบันทึกคำศัพท์ได้ในขณะนี้');
    }
  };

  return (
    <div className="bg-white border border-indigo-100/90 rounded-2xl p-3.5 flex flex-col justify-between gap-2.5 hover:border-indigo-300/80 transition-colors">
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-base font-bold text-slate-900 break-words leading-snug">
                {item.word}
              </span>
              {item.partOfSpeech && (
                <span className="text-[11px] font-medium text-slate-400">
                  {item.partOfSpeech}
                </span>
              )}
            </div>
            {item.reading && (
              <div className="text-xs font-medium text-indigo-600 mt-0.5 break-words">
                {item.reading}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleSpeak}
            aria-label={`ฟังเสียงคำว่า ${item.word}`}
            className={`p-1.5 rounded-lg border transition-colors shrink-0 cursor-pointer ${
              speaking
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-slate-50 text-slate-500 border-slate-200/80 hover:text-indigo-700 hover:border-indigo-200'
            }`}
          >
            <Volume2 size={14} />
          </button>
        </div>

        <p className="text-sm text-slate-700 font-medium leading-snug">
          {item.meaningTh}
        </p>
        {item.noteTh && (
          <p className="text-xs text-slate-500 leading-relaxed">
            {item.noteTh}
          </p>
        )}
      </div>

      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400 font-medium">
          {isWordbookEligible ? `สมุดศัพท์ SRS (${item.wordLang})` : `คลังโปรด (${item.wordLang})`}
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={isWordbookEligible && saved}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            saved
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-indigo-50/80 text-indigo-700 border border-indigo-200/80 hover:bg-indigo-600 hover:text-white hover:border-indigo-600'
          }`}
        >
          {saved ? (
            <>
              <Check size={13} />
              <span>บันทึกแล้ว</span>
            </>
          ) : (
            <>
              <BookmarkPlus size={13} />
              <span>{isWordbookEligible ? '+ สมุดศัพท์' : '+ คลังโปรด'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default VocabBreakdownCard;
