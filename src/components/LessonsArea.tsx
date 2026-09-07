import React, { useState, useCallback } from 'react';
import { getFirebaseStorageUrl } from '../utils/firebaseStorage';
import { 
  ChevronLeft, BookOpen, GraduationCap, ArrowRight, Volume2, Bot, CheckCircle2, XCircle, Bookmark, BookmarkCheck, Play
} from 'lucide-react';
import { getVocabData } from '../data/mockContent';
import voaLessons from '../data/voa_lessons.json';
import AnnotatableImage from './AnnotatableImage';
import AnnotationToolbar, { AnnotationState } from './AnnotationToolbar';
import FirebaseMaterialsViewer from './FirebaseMaterialsViewer';
import DocumentGallery from './DocumentGallery';
import { saveModuleBookmark, loadModuleBookmark, ModuleBookmark } from '../services/userPersistence';

interface NavNode {
  id: string;
  title: string;
  data?: any;
}

export default function LessonsArea({ activeLang, onAskAI }: { activeLang: 'EN' | 'CN' | 'TH', onAskAI?: (word: string) => void }) {
  const getInitialStack = (lang: 'EN' | 'CN' | 'TH'): NavNode[] => {
    if (lang === 'EN') return [{ id: 'EN_OPTIONS', title: 'English' }];
    if (lang === 'CN') return [{ id: 'CN', title: '中文' }];
    return [{ id: 'TH', title: 'ภาษาไทย' }];
  };

  const [stack, setStack] = useState<NavNode[]>(getInitialStack(activeLang));
  const current = stack[stack.length - 1];
  const [bookmark, setBookmark] = useState<ModuleBookmark | null>(null);

  React.useEffect(() => {
    setStack(getInitialStack(activeLang));
    loadModuleBookmark('vocab', activeLang).then(b => setBookmark(b));
  }, [activeLang]);

  const push = (node: NavNode) => setStack((prev) => [...prev, node]);
  const pop = () => setStack((prev) => prev.length > 1 ? prev.slice(0, -1) : prev);
  const goToStart = () => setStack(getInitialStack(activeLang));

  // Determine current language from stack
  const langNode = stack.find(n => n.id === 'EN' || n.id === 'EN_CEFR' || n.id === 'EN_VOA' || n.id === 'CN' || n.id === 'TH' || n.id === 'EN_GRAMMAR');
  const langKey = langNode ? langNode.id : activeLang; // fallback to activeLang

  const [isPlayingAI, setIsPlayingAI] = useState(false);
  const [annotationState, setAnnotationState] = useState<AnnotationState>({ activeTool: 'none', color: '#ef4444', size: 4 });
  const [clearTrigger, setClearTrigger] = useState(0);

  const playAudio = useCallback(async (text: string, forceLang?: string) => {
    if (!text) return;
    const langToUse = forceLang || langKey;
    
    if (langToUse === 'EN' || langToUse === 'EN_CEFR' || langToUse === 'EN_GRAMMAR' || langToUse === 'CN' || langToUse === 'TH') {
      setIsPlayingAI(true);
      
      // Stop any existing SpeechSynthesis and custom audio first
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch (e) {}
      }
      if ((window as any).currentEdgeAudio) {
        try {
          (window as any).currentEdgeAudio.pause();
          (window as any).currentEdgeAudio.currentTime = 0;
        } catch (e) {}
      }

      try {
        const actualTTSLang = langToUse === 'EN_GRAMMAR' ? 'EN' : langToUse;
        const reqBody: any = { text, lang: actualTTSLang };
        if (actualTTSLang === 'EN' || actualTTSLang === 'EN_CEFR') {
          reqBody.voice = 'en-US-ChristopherNeural';
        }
        const res = await fetch('/api/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody)
        });
        const data = await res.json();
        
        if (data.audio) {
          const audio = new Audio("data:audio/mp3;base64," + data.audio);
          (window as any).currentEdgeAudio = audio;
          audio.onended = () => setIsPlayingAI(false);
          audio.onerror = () => setIsPlayingAI(false);
          audio.play().catch(() => setIsPlayingAI(false));
          return;
        }
      } catch (err) {
        console.error('TTS server error, falling back to Speech Synthesis', err);
      }

      // Fallback only when API fails
      if ('speechSynthesis' in window) {
        const fallbackUtterance = new SpeechSynthesisUtterance(text);
        if (langToUse === 'CN') { fallbackUtterance.lang = 'zh-CN'; fallbackUtterance.rate = 0.85; }
        else if (langToUse === 'TH') { fallbackUtterance.lang = 'th-TH'; fallbackUtterance.rate = 0.9; }
        else { fallbackUtterance.lang = 'en-US'; fallbackUtterance.rate = 0.9; }
        fallbackUtterance.onend = () => setIsPlayingAI(false);
        fallbackUtterance.onerror = () => setIsPlayingAI(false);
        window.speechSynthesis.speak(fallbackUtterance);
        return;
      }
      
      setIsPlayingAI(false);
      return;
    }


    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (langToUse === 'EN' || langToUse === 'EN_CEFR' || langToUse === 'EN_GRAMMAR') {
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        utterance.pitch = 0.95;
        const voices = window.speechSynthesis.getVoices();
        const maleVoice = voices.find(v => 
          v.lang.startsWith('en') && !v.name.toLowerCase().includes('female') && !v.name.toLowerCase().includes('zira') && (
            v.name.toLowerCase().includes('christopher') ||
            v.name.toLowerCase().includes('guy') || 
            v.name.toLowerCase().includes('david') || 
            v.name.toLowerCase().includes('mark') || 
            v.name.toLowerCase().includes('ryan') ||
            v.name.toLowerCase().includes('george') || 
            v.name.toLowerCase().includes('james') || 
            v.name.toLowerCase().includes('alex') || 
            v.name.toLowerCase().includes('daniel') ||
            v.name.toLowerCase().includes('male')
          )
        );
        if (maleVoice) utterance.voice = maleVoice;
    } else if (langToUse === 'CN') {
        utterance.lang = 'zh-CN';
    } else {
        utterance.lang = 'th-TH';
    }
    
    window.speechSynthesis.speak(utterance);
  }, [langKey]);

  // --- Views ---

  const renderEnglishOptions = () => (
    <div className="animate-in fade-in duration-300">
      <div className="text-center py-6">
        <h2 className="text-3xl font-bold mb-3">เลือกหลักสูตรที่ต้องการ</h2>
        <p className="text-gray-500 mb-10">เลือกมาตรฐาน หรือระดับทักษะภาษาอังกฤษที่คุณสนใจ</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <button id="tutorial-ielts-card" onClick={() => push({ id: 'EN', title: 'English IELTS' })} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:border-indigo-200 hover:shadow-md transition-all group text-left">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-2xl">🇬🇧</div>
            <h3 className="text-2xl font-bold mb-2">English (IELTS)</h3>
            <p className="text-gray-500 text-sm">บทเรียนคำศัพท์ IELTS 1000 คำ (บทละ 50 คำ)</p>
          </button>

          <button onClick={() => push({ id: 'EN_CEFR', title: 'English CEFR' })} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:border-purple-200 hover:shadow-md transition-all group text-left">
            <div className="w-14 h-14 bg-purple-50 text-purple-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-2xl">🌍</div>
            <h3 className="text-2xl font-bold mb-2">English (CEFR)</h3>
            <p className="text-gray-500 text-sm">อิงตามมาตรฐานยุโรป (A1 - C2)</p>
          </button>
        </div>
      </div>
    </div>
  );

  const renderCourseLevels = () => {
    let levels: string[] = [];

    if (langKey === 'EN') {
      levels = Array.from({ length: 20 }, (_, i) => `IELTS Lesson ${i + 1}`);
    } else if (langKey === 'EN_CEFR') {
      levels = ['CEFR Level A1', 'CEFR Level A2', 'CEFR Level B1', 'CEFR Level B2', 'CEFR Level C1', 'CEFR Level C2'];
    } else if (langKey === 'EN_VOA') {
      levels = ['As It Is (Intermediate)'];
    } else if (langKey === 'EN_GRAMMAR') {
      levels = ['Beginner Grammar', 'Intermediate Grammar', 'Advanced Grammar'];
    } else if (langKey === 'CN') {
      levels = Array.from({ length: 6 }, (_, i) => `HSK Level ${i + 1}`);
      levels.push('HSK Level 7-9');
    } else {
      levels = Array.from({ length: 5 }, (_, i) => `ศัพท์ระดับ ${i + 1}`);
    }

    return (
      <div className="animate-in fade-in duration-300">
         <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div>
              <h2 className="text-2xl font-bold mb-2">เลือกระดับความยาก</h2>
              <p className="text-gray-500 text-sm">อิงตามมาตรฐานการวัดระดับทางภาษา</p>
            </div>
            <span className="text-sm bg-indigo-50 text-indigo-700 border border-indigo-100 px-4 py-2 rounded-full font-medium shadow-sm inline-flex items-center justify-center">
              สลับระดับได้ตลอดเวลา 🔄
            </span>
         </div>
         <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {levels.map((l) => (
              <button 
                key={l} 
                id={l.includes('Beginner') || l.includes('Basic') ? 'tutorial-lesson-beginner' : (l.includes('1') ? (langKey === 'CN' ? 'tutorial-hsk1-card' : 'tutorial-lesson-1') : undefined)}
                onClick={() => {
                  if (langKey === 'EN_GRAMMAR') {
                    push({ id: 'grammar_topics', title: l, data: { level: l } });
                  } else if (langKey === 'EN') {
                    push({ id: 'vocab_list', title: l, data: { level: l, lesson: 1 } });
                  } else if (langKey === 'EN_VOA') {
                    push({ id: 'voa_article_list', title: l, data: { level: l } });
                  } else {
                    push({ id: 'course_lessons', title: l, data: { level: l } });
                  }
                }} 
                className="bg-white px-6 py-8 rounded-xl border border-gray-100 shadow-sm hover:border-indigo-400 hover:ring-2 hover:ring-indigo-100 hover:shadow-md transition-all font-semibold text-lg text-center text-gray-800"
              >
                {l}
              </button>
            ))}
         </div>
      </div>
    );
  };

  const renderCourseLessons = () => {
    const levelName = current.data?.level || '';
    
    let isC2 = levelName === 'CEFR Level C2';
    
    const c2Categories = [
      'โลกธุรกิจ',
      'โลกแห่งการเมือง',
      'การจ้างงาน',
      'อาชญากรรมและการลงโทษ',
      'ลักษณะของผู้คน',
      'ความยากจนและปัญหาสังคม',
      'อาหาร การเดินทาง และวันหยุด',
      'ปัญหาที่คนหนุ่มสาวต้องเผชิญ',
      'วงการบันเทิงและสื่อมวลชน',
      'ปัญหาสิ่งแวดล้อมและธรรมชาติ'
    ];
    
    let numLessons = 10;
    if (levelName === 'HSK Level 7-9') {
      numLessons = 57;
    }
    const lessons = isC2 ? c2Categories : Array.from({ length: numLessons }, (_, i) => String(i + 1));
    const queryLang = langKey === 'EN_CEFR' ? 'EN' : (langKey || 'EN');

    return (
      <div className="animate-in fade-in duration-300">
        <h2 className="text-2xl font-bold mb-2">บทย่อยสำหรับ {levelName}</h2>
        <p className="text-gray-500 mb-8">{isC2 ? 'คลิกเข้าหมวดหมู่พื่อศึกษาคำศัพท์เฉพาะทาง' : 'คลิกเข้าบทย่อยเพื่อศึกษาคำศัพท์'}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lessons.map((item, index) => {
            const displayNum = index + 1;
            const title = isC2 ? `${item}` : `บทที่ ${item}`;
            const vocabCount = getVocabData(queryLang, levelName, item).length;
            
            return (
              <button 
                key={index} 
                id={index === 0 ? 'tutorial-cn-lesson-1' : undefined}
                onClick={() => push({ id: 'vocab_list', title: title, data: { ...current.data, lesson: item, isC2 } })} 
                className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:-translate-y-1 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between group gap-3"
              >
                <div className="flex items-center gap-4 w-full">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center shrink-0 text-xl border border-indigo-100">
                    {displayNum}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <h4 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors truncate w-full pr-2" title={title}>{title}</h4>
                    <p className="text-sm text-gray-500 mt-0.5">รวมคำศัพท์ {vocabCount} คำ</p>
                  </div>
                </div>
                <ArrowRight className="text-gray-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all hidden lg:block" />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderVocabList = () => {
    const isEn = langKey === 'EN' || langKey === 'EN_CEFR' || langKey === 'EN_GRAMMAR';
    const isCn = langKey === 'CN';
    
    let listTitle = current.title;
    let listCategory = current.title;
    let lessonNum = 1;
    
    if (current.data?.level) {
        listCategory = `${current.data.level}`;
        lessonNum = current.data.lesson || 1;
    }

    let queryLang = langKey === 'EN_CEFR' ? 'EN' : (langKey || 'EN');
    const items = getVocabData(queryLang, listCategory, lessonNum);

    return (
        <div className="animate-in fade-in duration-300">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold">{listCategory === listTitle ? listCategory : `${listCategory} - ${listTitle}`}</h2>
              <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-bold shadow-sm border border-indigo-100">
                {items.length} คำ
              </div>
            </div>
            <p className="text-gray-500 mb-8">เรียนรู้คำศัพท์ จำความหมาย และตัวอย่างการนำไปใช้</p>
            
            {items.length === 0 ? (
              <div className="bg-white flex flex-col items-center justify-center py-20 rounded-2xl border border-gray-100 shadow-sm text-center">
                <div className="text-6xl mb-4">📝</div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">กำลังรอข้อมูลคำศัพท์</h3>
                <p className="text-gray-500 max-w-sm">โปรดอัปโหลดหรือเพิ่มไฟล์คำศัพท์ผ่านแชท ข้อมูลจะแสดงที่นี่เมื่อพร้อม</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                  {items.map((item: any, idx: number) => {
                      const isPinned = bookmark?.data?.wordText === item.word;
                      return (
                        <div id={`word-card-${idx}`} key={idx} className={`bg-white p-6 rounded-2xl border transition-all flex flex-col gap-4 ${isPinned ? 'border-amber-400 ring-2 ring-amber-100 shadow-md' : 'border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-200'}`}>
                          <div>
                              <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                                  <div className="flex items-center gap-3 flex-wrap">
                                      <span className={`text-3xl font-bold text-gray-900 ${isCn ? 'font-serif' : ''}`}>{item.word}</span>
                                      <button 
                                        id={idx === 0 ? 'tutorial-word-audio-1' : undefined}
                                        onClick={() => playAudio(item.word)}
                                        className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shrink-0 hover:bg-indigo-600 hover:text-white transition-colors"
                                        title="ฟังเสียงคำศัพท์"
                                      >
                                          <Volume2 size={16} />
                                      </button>
                                      <button 
                                        id={idx === 0 ? 'tutorial-ask-ai-1' : undefined}
                                        onClick={() => onAskAI?.(item.word)}
                                        className="w-8 h-8 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center shrink-0 hover:bg-purple-600 hover:text-white transition-colors"
                                        title="ถามติวเตอร์ AI"
                                      >
                                          <Bot size={16} />
                                      </button>
                                      {isEn && item.type && <span className="text-indigo-500 font-medium">{item.type}</span>}
                                      {isEn && item.phonetic && <span className="text-gray-400 font-mono text-sm">{item.phonetic}</span>}
                                      {isCn && item.pinyin && <span className="text-gray-400 font-mono text-sm">{item.pinyin}</span>}
                                  </div>

                                  <button
                                    onClick={() => {
                                      const bookmarkData = { stack, wordIndex: idx, wordText: item.word };
                                      const bTitle = `${listCategory} (${listTitle}) - คำว่า "${item.word}"`;
                                      saveModuleBookmark('vocab', activeLang, bTitle, bookmarkData);
                                      setBookmark({
                                        module: 'vocab',
                                        lang: activeLang,
                                        title: bTitle,
                                        data: bookmarkData,
                                        updatedAt: Date.now()
                                      });
                                    }}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${
                                      isPinned 
                                        ? 'bg-amber-400 text-amber-950 shadow-sm' 
                                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                                    }`}
                                    title="ปักหมุดคำนี้ไว้เป็นจุดเรียนล่าสุดของวันนี้"
                                  >
                                    <Bookmark size={14} className={isPinned ? 'fill-amber-950' : ''} />
                                    <span>{isPinned ? 'ปักหมุดแล้ว 📌' : 'ปักหมุดคำนี้ 📌'}</span>
                                  </button>
                              </div>
                              <div className="flex flex-wrap gap-2 mb-3">
                                  <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-sm font-bold">🇹🇭 {item.th}</span>
                                  {isEn && item.cn && <span className="bg-orange-50 text-orange-700 px-3 py-1 rounded-lg text-sm font-medium">🇨🇳 {item.cn}</span>}
                              </div>
                              {item.example && (
                                  <div className="mt-4 pt-4 border-t border-gray-100">
                                      <div className="flex gap-4 items-start justify-between">
                                          <div className="flex-1">
                                              <div className="text-gray-800 text-lg mb-1 leading-relaxed">
                                                  {item.example}
                                              </div>
                                              {(item.exampleTh || item.example_th) && (
                                                  <div className="text-gray-500 text-sm">
                                                      แปล: {item.exampleTh || item.example_th}
                                                  </div>
                                              )}
                                          </div>
                                          <button 
                                            id={idx === 0 ? 'tutorial-example-audio-1' : undefined}
                                            onClick={() => playAudio(item.example)}
                                            className="shrink-0 inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-indigo-600 hover:text-white transition-colors"
                                            title="ฟังเสียงประโยค"
                                          >
                                              <Volume2 size={16} />
                                          </button>
                                      </div>
                                  </div>
                              )}
                          </div>
                        </div>
                      );
                  })}
              </div>
            )}
        </div>
    );
  };

  const renderVOAArticleList = () => {
    const levelStr = current.data?.level || 'Intermediate';
    const levelKey = levelStr === 'Advanced' ? 'advanced' : 'intermediate';
    const articles = (voaLessons as any)[levelKey]?.articles || [];

    return (
      <div className="animate-in fade-in duration-300">
        <h2 className="text-2xl font-bold mb-2">บทความข่าว (VOA News) - {levelStr}</h2>
        <p className="text-gray-500 mb-8">เลือกบทความที่สนใจเพื่อฝึกทักษะการอ่านและการฟังไปพร้อมๆ กัน (รูปแบบ PDF)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((article: any, index: number) => {
            const lessonNum = index + 1;
            const imgUrl = getFirebaseStorageUrl(`voa/${levelKey}/Lesson${lessonNum}.jpg`);

            return (
              <button 
                key={index}
                onClick={() => push({ id: 'voa_article_detail', title: `Lesson ${lessonNum}`, data: { article, imgUrl, lessonNum, levelKey } })}
                className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:-translate-y-1 hover:border-blue-300 hover:shadow-md transition-all flex flex-col items-start justify-between group gap-3"
              >
                <div className="flex items-center gap-4 w-full">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 font-bold flex items-center justify-center shrink-0 text-xl border border-blue-100">
                    {lessonNum}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors truncate w-full pr-2" title={article.title}>{article.title}</h4>
                    <p className="text-sm text-gray-500 mt-0.5">รวมคำศัพท์และควิซท้ายบท</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderVOAArticleDetail = () => {
    const { article, lessonNum, levelKey } = current.data || {};
    if (!article) return null;

    const folderName = `voa/${levelKey}/Lesson${lessonNum}`;

    return (
      <div className="animate-in fade-in duration-300 h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={pop}
            className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700 transition-colors"
          >
            <ChevronLeft size={20} /> กลับไปหน้าเลือกบทความ
          </button>
          <h2 className="text-xl font-bold text-gray-900">{article.title}</h2>
        </div>

        {article.audioUrl && (
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4 mb-6">
             <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shrink-0">
                <Volume2 size={20} />
             </div>
             <div className="flex-1">
                <p className="text-sm font-bold text-gray-800 mb-1">ฝึกฟังเสียงอ่านข่าว (Listen)</p>
                <audio controls src={article.audioUrl} className="w-full h-10 outline-none" />
             </div>
          </div>
        )}

        <div className="flex-1 w-full bg-gray-100 rounded-3xl overflow-hidden relative border border-gray-200 shadow-sm" style={{ minHeight: '800px' }}>
          <DocumentGallery type="courseware" folder={folderName} prefix="page" enableAnnotation={true} />
        </div>
      </div>
    );
  };


  const [expandedTopic, setExpandedTopic] = useState<string | null>('topic-1');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const renderGrammarTopics = () => {
    const levelName = current.data?.level || 'Beginner Grammar';
    
    return (
      <div className="animate-in fade-in duration-300">
        <h2 className="text-2xl font-bold mb-2">หัวข้อหลักบทเรียนไวยากรณ์ - {levelName}</h2>
        <p className="text-gray-500 mb-8">เลือกหัวข้อหลักและหัวข้อย่อยเพื่อเข้าศึกษาเนื้อหาไวยากรณ์</p>
        
        <div className="flex flex-col gap-4 max-w-4xl mx-auto">
          {/* Topic 1 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button 
              id="tutorial-lesson-topic-1"
              onClick={() => setExpandedTopic(expandedTopic === 'topic-1' ? null : 'topic-1')}
              className="w-full p-6 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 font-bold flex items-center justify-center text-lg border border-emerald-100">
                  1
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">หัวข้อที่ 1: Nouns & Pronouns (คำนามและคำสรรพนาม)</h3>
                  <p className="text-sm text-gray-500 mt-0.5">ชนิดของคำนาม โครงสร้างประโยค และสรรพนามพื้นฐาน</p>
                </div>
              </div>
              <span className="text-sm font-semibold text-emerald-600">
                {expandedTopic === 'topic-1' ? 'ย่อ 🔼' : 'ขยาย 🔽'}
              </span>
            </button>

            {expandedTopic === 'topic-1' && (
              <div className="p-4 bg-slate-50/50 border-t border-gray-100 flex flex-col gap-2 pl-12">
                <button
                  id="tutorial-lesson-subtopic-1-1"
                  onClick={() => push({ id: 'grammar_detail', title: 'หัวข้อที่ 1.1', data: { subtopic: '1.1 Singular & Plural Nouns' } })}
                  className="w-full p-4 rounded-xl bg-white border border-gray-200 hover:border-emerald-400 hover:shadow-sm text-left flex items-center justify-between transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">1.1</span>
                    <span className="font-bold text-gray-800 group-hover:text-emerald-600">หัวข้อที่ 1.1: Singular & Plural Nouns (คำนามเอกพจน์และพหูพจน์)</span>
                  </div>
                  <ArrowRight size={18} className="text-gray-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
                </button>

                <button
                  onClick={() => push({ id: 'grammar_detail', title: 'หัวข้อที่ 1.2', data: { subtopic: '1.2 Personal Pronouns' } })}
                  className="w-full p-4 rounded-xl bg-white border border-gray-200 hover:border-emerald-400 hover:shadow-sm text-left flex items-center justify-between transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">1.2</span>
                    <span className="font-bold text-gray-800 group-hover:text-emerald-600">หัวข้อที่ 1.2: Personal & Possessive Pronouns (สรรพนามและแสดงความเป็นเจ้าของ)</span>
                  </div>
                  <ArrowRight size={18} className="text-gray-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
                </button>
              </div>
            )}
          </div>

          {/* Topic 2 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button 
              onClick={() => setExpandedTopic(expandedTopic === 'topic-2' ? null : 'topic-2')}
              className="w-full p-6 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 font-bold flex items-center justify-center text-lg border border-blue-100">
                  2
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">หัวข้อที่ 2: Verbs & Present Tenses (กริยาและปัจจุบันกาล)</h3>
                  <p className="text-sm text-gray-500 mt-0.5">หลักการใช้ Present Simple และ Continuous</p>
                </div>
              </div>
              <span className="text-sm font-semibold text-blue-600">
                {expandedTopic === 'topic-2' ? 'ย่อ 🔼' : 'ขยาย 🔽'}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderGrammarDetail = () => {
    const subtopicTitle = current.data?.subtopic || 'หัวข้อที่ 1.1: Singular & Plural Nouns';

    return (
      <div className={`animate-in fade-in duration-300 flex flex-col ${isFullscreen ? 'fixed inset-0 z-[200] bg-white p-6 overflow-y-auto' : ''}`}>
        <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{subtopicTitle}</h2>
            <p className="text-sm text-gray-500">เอกสารการสอนฉบับสมบูรณ์ พร้อมตัวอย่างประโยคและข้อควรระวัง</p>
          </div>

          <button
            id="tutorial-lesson-fullscreen"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-md transition-all hover:scale-105"
            title="ดูแบบเต็มจอ"
          >
            <BookOpen size={18} />
            <span>{isFullscreen ? 'ออกจากเต็มจอ ❎' : 'ดูแบบเต็มจอ 🖥️'}</span>
          </button>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-inner flex flex-col gap-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-lg font-bold text-indigo-700 mb-3">📌 สรุปกฎไวยากรณ์ Singular & Plural Nouns</h3>
            <ul className="list-disc pl-5 text-gray-700 space-y-2 text-sm">
              <li><b>Singular Noun (คำนามเอกพจน์)</b>: ใช้แทนสิ่งเดียว คนเดียว เช่น <i>a book, a cat, an apple</i></li>
              <li><b>Plural Noun (คำนามพหูพจน์)</b>: เติม <i>-s</i> หรือ <i>-es</i> ท้ายคำนามเมื่อมีมากกว่าหนึ่ง เช่น <i>books, cats, apples, buses</i></li>
              <li><b>Irregular Plural Nouns</b>: เปลี่ยนรูปพิเศษ เช่น <i>child → children, man → men, tooth → teeth</i></li>
            </ul>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200 p-6 rounded-xl">
            <h4 className="font-bold text-emerald-800 mb-2">💡 ตัวอย่างประโยคใช้งานจริง</h4>
            <p className="text-sm text-emerald-900 leading-relaxed">
              "There are three <b>cats</b> sitting on the roof." (มีแมวสามตัวนั่งอยู่บนหลังคา)
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full relative">
      {/* Resume Progress Banner */}
      {stack.length === 1 && bookmark && bookmark.data && (
        <div className="mb-6 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white p-4 sm:p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center shrink-0">
              <Bookmark className="text-amber-300" size={22} />
            </div>
            <div>
              <span className="text-xs text-indigo-200 font-bold uppercase tracking-wider">เรียนต่อจากจุดเดิม ({activeLang === 'CN' ? 'ภาษาจีน' : 'ภาษาอังกฤษ'})</span>
              <h4 className="text-base sm:text-lg font-bold text-white leading-tight">
                {bookmark.title || 'คำศัพท์ล่าสุด'}
              </h4>
            </div>
          </div>
          <button
            onClick={() => {
              if (Array.isArray(bookmark.data)) {
                setStack(bookmark.data);
              } else if (bookmark.data.stack) {
                setStack(bookmark.data.stack);
                if (typeof bookmark.data.wordIndex === 'number') {
                  setTimeout(() => {
                    const el = document.getElementById(`word-card-${bookmark.data.wordIndex}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 400);
                }
              }
            }}
            className="w-full sm:w-auto bg-amber-400 hover:bg-amber-300 text-indigo-950 font-bold px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm shrink-0 hover:scale-105"
          >
            <Play size={16} fill="currentColor" />
            <span>เรียนต่อคำนี้ทันที 📌</span>
          </button>
        </div>
      )}

      {/* Dynamic Breadcrumbs & Controls */}
      {stack.length > 1 && (
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm sticky top-0 bg-gray-50/90 backdrop-blur-sm z-10 py-2 border-b border-gray-200/50">
          <button onClick={goToStart} className="text-gray-500 hover:text-indigo-600 font-medium transition-colors">
            หน้าแรก
          </button>
          
          {stack.slice(1).map((node, i, arr) => {
            const isLast = i === arr.length - 1;
            return (
              <React.Fragment key={node.id + i}>
                <ChevronLeft size={14} className="text-gray-400 rotate-180 shrink-0" />
                <button 
                  onClick={() => isLast ? null : setStack(stack.slice(0, i + 2))}
                  className={`font-medium transition-colors truncate max-w-[150px] sm:max-w-[200px] ${isLast ? 'text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md' : 'text-gray-500 hover:text-indigo-600'}`}
                  disabled={isLast}
                >
                  {node.title}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* View Router */}
      <div className="pb-10">
        {current.id === 'EN_OPTIONS' && renderEnglishOptions()}
        {(current.id === 'EN' || current.id === 'EN_CEFR' || current.id === 'EN_VOA' || current.id === 'CN' || current.id === 'TH') && renderCourseLevels()}
        {current.id === 'EN_SPEAKING_CONV' && <FirebaseMaterialsViewer prefix="en_speaking_conv/" title="Speaking & Conversation" />}
        {current.id === 'EN_WRITING' && <FirebaseMaterialsViewer prefix="en_writing/" title="English Writing" />}
        {current.id === 'EN_IELTS_EXAMS' && <FirebaseMaterialsViewer prefix="ielts_exams/" title="IELTS Mock Exams" />}
        {current.id === 'EN_SPEAKING_AUDIO' && <FirebaseMaterialsViewer prefix="en_speaking_ielts_audio/" title="IELTS Speaking Audio" />}
        {current.id === 'course_lessons' && renderCourseLessons()}
        {current.id === 'vocab_list' && renderVocabList()}
        {current.id === 'voa_article_list' && renderVOAArticleList()}
        {current.id === 'voa_article_detail' && renderVOAArticleDetail()}
        {current.id === 'grammar_topics' && renderGrammarTopics()}
        {current.id === 'grammar_detail' && renderGrammarDetail()}
      </div>
    </div>
  );
}


