import { saveVocabTestResult, loadVocabTestResultsHistory, VocabTestResultRecord } from "../services/userPersistence";
import { getStoredByokKey } from "../services/byokService";
import { deductCredit, loadUserSubscription, getTotalCredits } from "../services/subscriptionService";
import React, { useState, useEffect, useRef } from 'react';
import { History, X, Award, FileSignature, Play, Settings, ArrowRight, CheckCircle, XCircle, RotateCcw, Volume2, VolumeX, Sliders, Languages } from 'lucide-react';
import { allCNVocab, allENVocab, VocabWord } from '../data/vocabData';
import AnnotationToolbar, { AnnotationState } from './AnnotationToolbar';
import AnnotatableArea from './AnnotatableArea';

interface VocabExamAreaProps {
  activeLang: 'EN' | 'CN' | 'TH';
  onAskAI?: (prompt: string) => void;
}

type ExamState = 'SETUP' | 'TESTING' | 'RESULT';

interface Answer {
  wordId: string;
  userWord: string;
  userTranslation: string;
  isWordCorrect?: boolean;
  isTranslationCorrect?: boolean;
}

export default function VocabExamArea({ activeLang }: VocabExamAreaProps) {
  const [examState, setExamState] = useState<ExamState>('SETUP');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [scopeRange, setScopeRange] = useState('1-20');
  
  const [examWords, setExamWords] = useState<VocabWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  
  // Timer state
  const [timeLeft, setTimeLeft] = useState(30);
  
  const [annotationState, setAnnotationState] = useState<AnnotationState>({
    activeTool: 'none',
    size: 4,
    color: '#3b82f6',
    fontSize: 24,
    fontFamily: 'Arial, sans-serif'
  });
  const [clearTrigger, setClearTrigger] = useState(0);
  const [isAIGrading, setIsAIGrading] = useState(false);

  const lang = activeLang === 'CN' ? 'CN' : 'EN';
  const fullVocab = lang === 'CN' ? allCNVocab : allENVocab;
  const levels = ['ALL', ...Array.from(new Set(fullVocab.map(v => v.level)))];

  const filteredWords = levelFilter === 'ALL' ? fullVocab : fullVocab.filter(v => v.level === levelFilter);

  const [selectedVoice, setSelectedVoice] = useState(lang === 'CN' ? 'zh-CN-XiaoxiaoNeural' : 'en-US-JennyNeural');
  const [speakingRate, setSpeakingRate] = useState('default');
  const [autoRepeat, setAutoRepeat] = useState(false);
  const [history, setHistory] = useState<VocabTestResultRecord[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const fetchHistory = async () => {
    const list = await loadVocabTestResultsHistory();
    setHistory(list);
  };
  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    setSelectedVoice(lang === 'CN' ? 'zh-CN-XiaoxiaoNeural' : 'en-US-JennyNeural');
  }, [lang]);

  let parsedStart = 0;
  let parsedEnd = filteredWords.length;
  try {
    const parts = scopeRange.split('-');
    if (parts.length === 2) {
      parsedStart = Math.max(0, parseInt(parts[0]) - 1);
      parsedEnd = Math.max(parsedStart, parseInt(parts[1]));
    } else if (parts.length === 1 && parts[0].trim() !== '') {
      parsedEnd = parseInt(parts[0]);
    }
  } catch(e) {}

  if (isNaN(parsedStart)) parsedStart = 0;
  if (isNaN(parsedEnd)) parsedEnd = filteredWords.length;

  const estimatedCount = Math.max(0, Math.min(filteredWords.length - parsedStart, parsedEnd - parsedStart));

  // Ref for timer
  const timerRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speakWord = async (wordText: string, customRateParam?: string) => {
    // Cancel any current built-in speech synthesis or custom audio playback
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch (e) {}
    }

    const rate = customRateParam || speakingRate;

    const playAudioWithRetry = async (textToPlay: string, rateVal: string, isSecondPlay = false) => {
      try {
        const response = await fetch('/api/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: textToPlay, 
            lang: lang === 'CN' ? 'CN' : 'EN',
            voice: selectedVoice,
            rate: rateVal
          })
        });
        const data = await response.json();
        if (data.audio) {
          const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
          audioRef.current = audio;
          await audio.play();
          
          // If autoRepeat is true and this is the first play, wait for this audio to end and play again
          if (autoRepeat && !isSecondPlay && !customRateParam) {
            audio.onended = () => {
              setTimeout(() => {
                playAudioWithRetry(textToPlay, rateVal, true);
              }, 1200);
            };
          }
          return true;
        } else {
          throw new Error('No audio data received');
        }
      } catch (e) {
        console.error('TTS error', e);
        playLocalFallback(textToPlay, rateVal);
        return false;
      }
    };

    await playAudioWithRetry(wordText, rate);
  };

  const playLocalFallback = (text: string, rateVal: string) => {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang === 'CN' ? 'zh-CN' : 'en-US';
        
        // Map rate value to speech synthesis rate (0.1 to 10)
        if (rateVal === '-15%' || rateVal === '-20%') {
          utterance.rate = 0.8;
        } else if (rateVal === '-30%' || rateVal === '-35%') {
          utterance.rate = 0.65;
        } else {
          utterance.rate = 1.0;
        }
        
        window.speechSynthesis.speak(utterance);
        
        if (autoRepeat) {
          utterance.onend = () => {
            setTimeout(() => {
              const utterance2 = new SpeechSynthesisUtterance(text);
              utterance2.lang = lang === 'CN' ? 'zh-CN' : 'en-US';
              if (rateVal === '-15%' || rateVal === '-20%') {
                utterance2.rate = 0.8;
              } else if (rateVal === '-30%' || rateVal === '-35%') {
                utterance2.rate = 0.65;
              } else {
                utterance2.rate = 1.0;
              }
              window.speechSynthesis.speak(utterance2);
            }, 1200);
          };
        }
      } catch (err) {
        console.error('Fallback speech synthesis failed', err);
      }
    }
  };

  const startExam = async () => {
    // Filter by level
    const filtered = levelFilter === 'ALL' ? fullVocab : fullVocab.filter(v => v.level === levelFilter);
    
    // Parse scope (e.g. 1-20)
    let start = 0, end = filtered.length;
    try {
      const parts = scopeRange.split('-');
      if (parts.length === 2) {
        start = Math.max(0, parseInt(parts[0]) - 1);
        end = Math.max(start, parseInt(parts[1]));
      } else if (parts.length === 1 && parts[0].trim() !== '') {
        end = parseInt(parts[0]);
      }
    } catch(e) {}
    
    if (isNaN(start)) start = 0;
    if (isNaN(end)) end = filtered.length;
    
    let scopeWords = filtered.slice(start, end);
    // Randomize
    scopeWords = scopeWords.sort(() => Math.random() - 0.5);
    
    // Take all words in range (previously limited to 20 words)
    const finalWords = scopeWords;

    if (finalWords.length === 0) {
      console.warn("ไม่มีคำศัพท์ในช่วงที่เลือกครับ");
      return;
    }

    // Check credit balance before starting to inform user
    try {
      const subState = await loadUserSubscription();
      if (getTotalCredits(subState) < 1) {
        const wantTopup = confirm('⚡ เครดิต AI ของคุณไม่เพียงพอ (การส่งตรวจข้อสอบคำศัพท์ใช้ 1 เครดิต)\nต้องการไปที่หน้าเติมเครดิตเพื่อเริ่มใช้งานหรือไม่?');
        if (wantTopup) {
          window.dispatchEvent(new CustomEvent('open_subscription_modal', { detail: { tab: 'topup' } }));
        }
        return;
      }
    } catch (e) {
      console.error('Check credit error:', e);
    }
    
    setExamWords(finalWords);
    setCurrentIndex(0);
    setAnswers({});
    setExamState('TESTING');
    
    // Start first word
    speakWord(finalWords[0].word);
  };

  // Timer effect
  useEffect(() => {
    if (examState === 'TESTING') {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [examState]);

  useEffect(() => {
    if (timeLeft <= 0 && examState === 'TESTING') {
      handleNextWord();
    }
  }, [timeLeft, examState]);

  const handleNextWord = () => {
    if (currentIndex < examWords.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      setTimeLeft(30);
      speakWord(examWords[nextIdx].word);
    } else {
      finishExam();
    }
  };

  const toggleOverrideTranslation = (wordId: string) => {
    setAnswers(prev => ({
      ...prev,
      [wordId]: {
        ...prev[wordId],
        isTranslationCorrect: true
      }
    }));
  };

  const finishExam = async () => {
    clearInterval(timerRef.current);
    
    // Deduct 1 credit for submitting vocab exam
    const { success } = await deductCredit('vocab_exam');
    if (!success) {
      alert('⚡ เครดิต AI ของคุณไม่เพียงพอ (การส่งตรวจข้อสอบคำศัพท์ใช้ 1 เครดิต)\nกรุณากดเติมเครดิตเพื่อส่งตรวจคำตอบ');
      window.dispatchEvent(new CustomEvent('open_subscription_modal', { detail: { tab: 'topup' } }));
      return;
    }

    const preliminaryAnswers: Record<string, Answer> = {};
    let evaluatedAnswers: Record<string, Answer> = {};
    const apiPayload: any[] = [];
    
    examWords.forEach(word => {
      const userAns = answers[word.id] || { wordId: word.id, userWord: '', userTranslation: '' };
      const isWordCorrect = userAns.userWord.trim().toLowerCase() === word.word.trim().toLowerCase();
      
      preliminaryAnswers[word.id] = {
        ...userAns,
        isWordCorrect,
        isTranslationCorrect: false
      };

      if (userAns.userTranslation.trim() !== '') {
        apiPayload.push({
          wordId: word.id,
          targetWord: word.word,
          officialTranslations: word.translations,
          userTranslation: userAns.userTranslation.trim()
        });
      }
    });
    
    setAnswers(preliminaryAnswers);
    setIsAIGrading(true);

    try {
      if (apiPayload.length > 0) {
        const byokKey = getStoredByokKey();
        const response = await fetch('/api/grade-vocab', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(byokKey ? { 'x-byok-key': byokKey } : {})
          },
          body: JSON.stringify({ answers: apiPayload, lang, byokKey: byokKey || undefined })
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error("HTTP " + response.status + ": " + errText);
        }
        const aiResults = await response.json();
        
        const finalAnswers = { ...preliminaryAnswers };
        if (Array.isArray(aiResults)) {
          aiResults.forEach(res => {
            if (finalAnswers[res.wordId]) {
              finalAnswers[res.wordId].isTranslationCorrect = res.isTranslationCorrect;
            }
          });
        }
        setAnswers(finalAnswers);
        evaluatedAnswers = finalAnswers;
      }
    } catch (e) {
      console.error("AI grading failed", e);
      const fallbackAnswers = { ...preliminaryAnswers };
      examWords.forEach(w => {
         const userT = (fallbackAnswers[w.id]?.userTranslation || '').trim().toLowerCase();
         if (userT) {
           fallbackAnswers[w.id].isTranslationCorrect = w.translations.some(t => {
             const cleanT = t.trim().toLowerCase();
             if (cleanT.includes(userT) || userT.includes(cleanT)) return true;
             
             const prefixes = /^(การ|ความ|ที่|จะ|น่า|ให้|ถูก|โดน|ผู้|นัก|เครื่อง|ของ)/g;
             const suffixes = /(ๆ|แล้ว|เลย|มาก|ที่สุด|ขึ้น|ลง|ไป|มา|อย่าง)$/g;
             const userCore = userT.replace(prefixes, '').replace(suffixes, '').trim();
             const cleanCore = cleanT.replace(prefixes, '').replace(suffixes, '').trim();
             
             if (userCore.length >= 2 && cleanCore.includes(userCore)) return true;
             if (cleanCore.length >= 2 && userCore.includes(cleanCore)) return true;
             
             return false;
           });
         }
      });
      setAnswers(fallbackAnswers);
      evaluatedAnswers = fallbackAnswers;
    } finally {
      setIsAIGrading(false);
      setExamState('RESULT');
      
      let finalCorrectWords = 0;
      let finalCorrectTrans = 0;
      const items: any[] = [];
      examWords.forEach(w => {
        const ans = evaluatedAnswers[w.id];
        if (ans?.isWordCorrect) finalCorrectWords++;
        if (ans?.isTranslationCorrect) finalCorrectTrans++;
        items.push({
          wordId: w.id,
          targetWord: w.word,
          targetTranslation: w.translations[0] || '',
          userWord: ans?.userWord || '',
          userTranslation: ans?.userTranslation || '',
          isWordCorrect: !!ans?.isWordCorrect,
          isTranslationCorrect: !!ans?.isTranslationCorrect
        });
      });
      saveVocabTestResult({
        lang,
        levelFilter,
        scopeRange,
        correctWords: finalCorrectWords,
        correctTrans: finalCorrectTrans,
        totalQuestions: examWords.length,
        items,
        createdAt: Date.now()
      });
    }
  };

  const currentWordObj = examWords[currentIndex];
  const currentAnswer = currentWordObj ? (answers[currentWordObj.id] || { wordId: currentWordObj.id, userWord: '', userTranslation: '' }) : null;

  const handleAnswerChange = (field: 'userWord' | 'userTranslation', value: string) => {
    if (!currentWordObj) return;
    setAnswers({
      ...answers,
      [currentWordObj.id]: {
        ...(answers[currentWordObj.id] || { wordId: currentWordObj.id, userWord: '', userTranslation: '' }),
        [field]: value
      }
    });
  };

  // Calculate scores for Result page
  const totalQuestions = examWords.length;
  let correctWords = 0;
  let correctTrans = 0;
  
  if (examState === 'RESULT') {
    examWords.forEach(word => {
      if (answers[word.id]?.isWordCorrect) correctWords++;
      if (answers[word.id]?.isTranslationCorrect) correctTrans++;
    });
  }

  return (
    <div className="flex flex-col h-full w-full relative">
      
      <div className="fixed bottom-24 right-4 z-50 pointer-events-none flex flex-col items-end">
        <div className="pointer-events-auto">
          <AnnotationToolbar
            state={annotationState}
            onChange={setAnnotationState}
            onClear={() => setClearTrigger(prev => prev + 1)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-6 px-4 pb-32">
        {examState === 'SETUP' && (
          <div className="max-w-5xl mx-auto flex justify-end mb-4">
             <button
                onClick={async () => {
                  await fetchHistory();
                  setShowHistoryModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-2xl shadow-sm hover:bg-indigo-100 transition-all text-sm"
              >
                <History size={18} /> ประวัติการสอบศัพท์ล่าสุด (30 ครั้ง)
              </button>
          </div>
        )}
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-6 h-full min-h-[500px]">
          
          {/* Sidebar */}
          {examState === 'SETUP' && (
            <div className="w-full md:w-64 shrink-0 flex flex-col gap-4">
              <div className="bg-white/80 backdrop-blur-md p-5 rounded-2xl shadow-sm border border-white/50">
                <div className="flex items-center gap-2 mb-4 text-indigo-700 font-bold">
                  <Settings size={20} />
                  <h3>ตั้งค่าการสอบ</h3>
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-600 mb-2">ระดับคำศัพท์</label>
                  <select 
                    id="tutorial-exam-level-filter"
                    value={levelFilter}
                    onChange={(e) => setLevelFilter(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {levels.map(l => (
                      <option key={l} value={l}>{l === 'ALL' ? 'ทั้งหมด' : l}</option>
                    ))}
                  </select>
                </div>
                
                <div id="tutorial-exam-word-range" className="mb-4">
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    ช่วงคำที่สอบ (มีทั้งหมด {filteredWords.length} คำ)
                  </label>
                  <input 
                    type="text" 
                    value={scopeRange}
                    onChange={(e) => setScopeRange(e.target.value)}
                    placeholder={`1-${filteredWords.length}`}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">ระบุ เช่น 1-50 หรือ 1-{filteredWords.length}</p>
                </div>

                <div className="border-t border-gray-100 my-4 pt-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">ตั้งค่าเสียงออกเสียง</h4>
                  
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                      <Languages size={12} />
                      ผู้พูด & สำเนียง
                    </label>
                    <select 
                      id="tutorial-exam-voice-select"
                      value={selectedVoice}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {lang === 'CN' ? (
                        <>
                          <option value="zh-CN-XiaoxiaoNeural">👩 Xiaoxiao (หญิง - มาตรฐาน)</option>
                          <option value="zh-CN-YunyangNeural">👨 Yunyang (ชาย - คมชัด/เป็นธรรมชาติ)</option>
                        </>
                      ) : (
                        <>
                          <option value="en-US-JennyNeural">👩 Jenny (หญิง - คมชัดที่สุด)</option>
                          <option value="en-US-GuyNeural">👨 Guy (ชาย - นุ่มนวล)</option>
                          <option value="en-US-AriaNeural">👩 Aria (หญิง - สดใส)</option>
                          <option value="en-GB-SoniaNeural">👩 Sonia (หญิง - บริติช UK)</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                      <Sliders size={12} />
                      ความเร็วเริ่มต้น
                    </label>
                    <select 
                      id="tutorial-exam-speed-select"
                      value={speakingRate}
                      onChange={(e) => setSpeakingRate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="default">ปกติ (100%)</option>
                      <option value="-15%">ช้าเล็กน้อย (85%)</option>
                      <option value="-30%">ช้าลงมาก (70%)</option>
                    </select>
                  </div>

                  <div className="mb-1">
                    <label id="tutorial-exam-auto-repeat" className="flex items-center gap-2 cursor-pointer py-1 select-none">
                      <input 
                        type="checkbox"
                        checked={autoRepeat}
                        onChange={(e) => setAutoRepeat(e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <span className="text-xs font-medium text-gray-600">ออกเสียง 2 รอบอัตโนมัติ</span>
                    </label>
                    <p className="text-[10px] text-gray-400 ml-5.5">เว้นช่องไฟ 1.2 วินาทีระหว่างรอบ</p>
                  </div>
                </div>

                <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200/80 rounded-xl flex items-center justify-between text-xs text-amber-800">
                  <span className="flex items-center gap-1.5 font-medium">
                    ⚡ ค่าส่งตรวจข้อสอบ
                  </span>
                  <span className="font-bold bg-amber-200/80 px-2 py-0.5 rounded-md text-amber-900">
                    1 เครดิต / ครั้ง
                  </span>
                </div>

                <button 
                  id="tutorial-exam-start-btn"
                  onClick={startExam}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-sm hover:shadow active:scale-[0.99]"
                >
                  <Play size={18} /> เริ่มสอบ ({estimatedCount} คำ)
                </button>
              </div>
            </div>
          )}

          {/* Main Area */}
          <div className="flex-1 flex flex-col h-full min-h-[400px]">
            {isAIGrading && (
              <div className="w-full h-full flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-white/50 p-6 md:p-12 relative">
                 <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mb-4"></div>
                 <h2 className="text-2xl font-bold text-indigo-700">กำลังให้ AI ตรวจคำแปล...</h2>
                 <p className="text-gray-500 mt-2">โปรดรอสักครู่ ระบบกำลังพิจารณาความหมาย</p>
              </div>
            )}

            {!isAIGrading && examState === 'SETUP' && (
              <AnnotatableArea
                id={`vocab_exam_scratchpad_${lang}`}
                annotationState={annotationState}
                clearTrigger={clearTrigger}
                isActive={annotationState.activeTool !== 'none'}
                className="w-full h-full min-h-[500px] bg-white/60 backdrop-blur-sm rounded-2xl shadow-sm border border-white/50 flex flex-col"
              >
                <div className="p-8 h-full flex flex-col items-center justify-center text-center opacity-40 select-none">
                  <FileSignature size={64} className="text-gray-400 mb-4" />
                  <h2 className="text-2xl font-bold text-gray-500 mb-2">กระดานทด (Scratchpad)</h2>
                  <p className="max-w-md">พื้นที่นี้ให้คุณสามารถใช้แถบเครื่องมือด้านบนเพื่อวาดเขียน พิมพ์ หรือทดเลขได้อย่างอิสระ เมื่อพร้อมแล้ว กด "เริ่มสอบ" ที่เมนูด้านซ้ายได้เลยครับ</p>
                </div>
              </AnnotatableArea>
            )}

            {!isAIGrading && examState === 'TESTING' && currentWordObj && (
              <div className="w-full h-full flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-white/50 p-6 md:p-12 relative">
                
                {/* Timer & Progress */}
                <div className="absolute top-6 left-6 text-sm font-medium text-gray-500">
                  ข้อ {currentIndex + 1} / {examWords.length}
                </div>
                <div className={`absolute top-6 right-6 text-2xl font-bold ${timeLeft <= 5 ? 'text-red-500' : 'text-indigo-600'}`}>
                  00:{timeLeft.toString().padStart(2, '0')}
                </div>
                
                <div className="w-full max-w-lg">
                  <div className="flex flex-col items-center mb-8">
                    <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full mb-3">
                      เลือกวิธีฟังเพื่อช่วยสะกดคำศัพท์ให้ชัดเจนขึ้น 🔊
                    </span>
                    
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {/* Normal Speed */}
                      <button 
                        onClick={() => speakWord(currentWordObj.word, 'default')}
                        className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-4 py-2.5 rounded-xl border border-indigo-200 shadow-sm transition-all active:scale-95 text-xs"
                        title="ฟังความเร็วปกติ"
                      >
                        <Volume2 size={16} />
                        <span>ฟังปกติ</span>
                      </button>

                      {/* Slow Speed (Turtle 🐢) */}
                      <button 
                        onClick={() => speakWord(currentWordObj.word, '-25%')}
                        className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold px-4 py-2.5 rounded-xl border border-amber-200 shadow-sm transition-all active:scale-95 text-xs"
                        title="ฟังความเร็วช้าพิเศษ 🐢"
                      >
                        <span className="text-base leading-none">🐢</span>
                        <span>ฟังช้าๆ (Slow)</span>
                      </button>

                      {/* Repeat Twice */}
                      <button 
                        onClick={async () => {
                          speakWord(currentWordObj.word, 'default');
                          setTimeout(() => {
                            speakWord(currentWordObj.word, 'default');
                          }, 1500);
                        }}
                        className="flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold px-4 py-2.5 rounded-xl border border-sky-200 shadow-sm transition-all active:scale-95 text-xs"
                        title="ฟังซ้ำ 2 รอบติดกัน"
                      >
                        <RotateCcw size={14} />
                        <span>ฟังซ้ำ 2 รอบ</span>
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-yellow-50 text-yellow-800 text-xs p-3 rounded-lg border border-yellow-200 mb-6 text-center">
                    <b>หมายเหตุ:</b> หากคำศัพท์มีคำแปลหลายคำ ให้เขียนคำแปลอันไหนก็ได้มา 1 อันเท่านั้น
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">คำศัพท์</label>
                      <input 
                        type="text"
                        value={currentAnswer?.userWord || ''}
                        onChange={(e) => handleAnswerChange('userWord', e.target.value)}
                        placeholder={lang === 'CN' ? 'พิมพ์ตัวจีน...' : 'Type English word...'}
                        className="w-full text-xl p-4 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">คำแปล</label>
                      <input 
                        type="text"
                        value={currentAnswer?.userTranslation || ''}
                        onChange={(e) => handleAnswerChange('userTranslation', e.target.value)}
                        placeholder="พิมพ์คำแปลภาษาไทย..."
                        className="w-full text-xl p-4 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="mt-8 flex justify-end">
                    <button 
                      onClick={handleNextWord}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95"
                    >
                      {currentIndex === examWords.length - 1 ? (
                        <>
                          <span>ส่งคำตอบ (ใช้ 1 เครดิต ⚡)</span>
                          <ArrowRight size={20} />
                        </>
                      ) : (
                        <>
                          <span>ข้อถัดไป</span>
                          <ArrowRight size={20} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!isAIGrading && examState === 'RESULT' && (
              <div className="w-full bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-white/50 p-6 md:p-8">
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-gray-800 mb-2">สรุปผลการสอบ</h2>
                  <div className="flex justify-center gap-8 mt-6">
                    <div className="bg-green-50 text-green-700 px-6 py-4 rounded-2xl border border-green-200 flex flex-col items-center">
                      <span className="text-sm font-medium mb-1">ศัพท์ถูก</span>
                      <span className="text-4xl font-black">{correctWords}<span className="text-lg text-green-600/70">/{totalQuestions}</span></span>
                    </div>
                    <div className="bg-blue-50 text-blue-700 px-6 py-4 rounded-2xl border border-blue-200 flex flex-col items-center">
                      <span className="text-sm font-medium mb-1">แปลถูก</span>
                      <span className="text-4xl font-black">{correctTrans}<span className="text-lg text-blue-600/70">/{totalQuestions}</span></span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setExamState('SETUP')}
                    className="mt-8 mx-auto flex items-center gap-2 text-indigo-600 font-semibold hover:text-indigo-800"
                  >
                    <RotateCcw size={18} /> สอบใหม่อีกครั้ง
                  </button>
                </div>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                  {examWords.map((word, i) => {
                    const userAns = answers[word.id];
                    return (
                      <div key={word.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
                        <div className="flex items-center gap-4 min-w-[200px]">
                           <span className="text-gray-400 font-bold w-6 text-right">{i+1}.</span>
                           <div>
                             <div className="text-xl font-bold text-gray-800">{word.word}</div>
                             <div className="text-sm text-gray-500">{lang === 'CN' ? word.pinyin : word.phonetic}</div>
                           </div>
                        </div>
                        
                        <div className="flex-1 grid grid-cols-2 gap-4">
                           {/* Word checking */}
                           <div className={`p-3 rounded-lg border ${userAns?.isWordCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                              <div className="text-xs text-gray-500 mb-1">คำตอบ (ศัพท์)</div>
                              <div className="flex items-center justify-between">
                                 <span className={!userAns?.userWord ? 'text-gray-400 italic' : 'text-gray-800 font-medium'}>
                                   {userAns?.userWord || 'ไม่ได้ตอบ'}
                                 </span>
                                 {userAns?.isWordCorrect ? <CheckCircle size={18} className="text-green-500"/> : <XCircle size={18} className="text-red-500"/>}
                              </div>
                           </div>

                           {/* Translation checking */}
                           <div className={`p-3 rounded-lg border ${userAns?.isTranslationCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                              <div className="text-xs text-gray-500 mb-1">คำตอบ (แปล)</div>
                              <div className="flex items-center justify-between">
                                 <span className={!userAns?.userTranslation ? 'text-gray-400 italic' : 'text-gray-800 font-medium'}>
                                   {userAns?.userTranslation || 'ไม่ได้ตอบ'}
                                 </span>
                                 {userAns?.isTranslationCorrect ? <CheckCircle size={18} className="text-green-500"/> : <XCircle size={18} className="text-red-500"/>}
                              </div>
                              {!userAns?.isTranslationCorrect && (
                                <div className="mt-2 flex flex-col gap-2">
                                  <div className="text-xs text-green-600">
                                    เฉลย: {word.translations.join(', ')}
                                  </div>
                                  {userAns?.userTranslation && (
                                    <button
                                      onClick={() => toggleOverrideTranslation(word.id)}
                                      className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 py-1 px-2 rounded w-fit transition-colors pointer-events-auto"
                                    >
                                      ความหมายนี้ฉันถูก (Override)
                                    </button>
                                  )}
                                </div>
                              )}
                           </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-indigo-50/50">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-600 text-white rounded-2xl">
                  <Award size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900">ประวัติการสอบศัพท์</h3>
                  <p className="text-xs text-slate-500">เก็บสถิติสูงสุด 30 ครั้งล่าสุด</p>
                </div>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {history.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <History size={48} className="mx-auto mb-3 opacity-40" />
                  <p className="font-bold text-gray-600">ยังไม่มีประวัติการสอบ</p>
                  <p className="text-xs text-gray-400 mt-1">เมื่อทำสอบศัพท์เสร็จ ผลสอบจะถูกเก็บบันทึกทันที</p>
                </div>
              ) : (
                history.map((rec) => (
                  <details key={rec.id} className="bg-slate-50 rounded-2xl border border-slate-100 flex flex-col group overflow-hidden">
                    <summary className="p-4 flex flex-col gap-3 cursor-pointer select-none outline-none">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 text-xs font-black rounded-lg uppercase">
                            {rec.lang} : {rec.levelFilter} ({rec.scopeRange})
                          </span>
                          <span className="text-xs text-gray-400 font-medium">
                            {new Date(rec.createdAt).toLocaleString('th-TH')}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-gray-500">จำนวน {rec.totalQuestions} คำ</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-green-50 text-green-700 px-3 py-2 rounded-xl flex justify-between items-center">
                           <span className="text-sm font-medium">ศัพท์ถูก</span>
                           <span className="font-black">{rec.correctWords}</span>
                        </div>
                        <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded-xl flex justify-between items-center">
                           <span className="text-sm font-medium">แปลถูก</span>
                           <span className="font-black">{rec.correctTrans}</span>
                        </div>
                      </div>
                      <div className="text-center mt-2 text-xs text-indigo-500 font-medium group-open:hidden">
                        คลิกเพื่อดูรายละเอียด ▾
                      </div>
                      <div className="text-center mt-2 text-xs text-indigo-500 font-medium hidden group-open:block">
                        ซ่อนรายละเอียด ▴
                      </div>
                    </summary>
                    <div className="px-4 pb-4 border-t border-slate-100 bg-white space-y-2 pt-3">
                      {rec.items && rec.items.map((item, i) => (
                         <div key={item.wordId} className="flex justify-between items-center p-2 rounded-lg bg-slate-50/50 text-sm">
                            <div className="font-medium text-slate-800 w-1/3 truncate">{item.targetWord}</div>
                            <div className="w-1/3 flex items-center justify-center">
                               <span className={`px-2 py-0.5 rounded text-xs ${item.isWordCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  ศัพท์ {item.isWordCorrect ? '✔️' : '❌'}
                               </span>
                            </div>
                            <div className="w-1/3 flex items-center justify-end">
                               <span className={`px-2 py-0.5 rounded text-xs ${item.isTranslationCorrect ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                  แปล {item.isTranslationCorrect ? '✔️' : '❌'}
                               </span>
                            </div>
                         </div>
                      ))}
                    </div>
                  </details>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
