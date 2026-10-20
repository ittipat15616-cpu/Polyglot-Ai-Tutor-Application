import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Clock, CheckCircle, XCircle, FileText, Maximize2, Minimize2, X } from 'lucide-react';
import { getFirebaseStorageUrl } from '../utils/firebaseStorage';
import AnnotationToolbar, { AnnotationState } from './AnnotationToolbar';
import AnnotatableImage from './AnnotatableImage';
import { saveMockTestResult } from '../services/userPersistence';
import { deductCredit } from '../services/subscriptionService';
import { toeicReadingData } from '../data/toeicReadingData';
import { toeicListeningData } from '../data/toeicListeningData';

interface ToeicMockTestAreaProps {
  examId: string; // e.g. "toeic_reading_1"
  mode: 'practice' | 'mock';
  onBack: () => void;
}

export default function ToeicMockTestArea({ examId, mode, onBack }: ToeicMockTestAreaProps) {
  const [hasStarted, setHasStarted] = useState(mode === 'practice');
  const isListeningInitial = examId.includes('listening');
  const [timeLeft, setTimeLeft] = useState(isListeningInitial ? 45 * 60 : 75 * 60); // 45 mins for listening, 75 mins for reading
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Annotation state
  const [annotationState, setAnnotationState] = useState<AnnotationState>({
    activeTool: 'none',
    color: '#ef4444',
    size: 4
  });
  const [clearTrigger, setClearTrigger] = useState(0);

  const isListening = examId.includes('listening');
  const testData = isListening ? toeicListeningData.find(t => t.id === examId) : toeicReadingData.find(t => t.id === examId);
  let imagePaths = testData && (testData as any).imagePaths ? (testData as any).imagePaths as string[] : [];
  
  if (mode === 'mock' && testData && (testData as any).endPage) {
    imagePaths = imagePaths.slice(0, (testData as any).endPage);
  }

  useEffect(() => {
    let timer: any;
    if (mode === 'mock' && hasStarted && timeLeft > 0 && !isSubmitting && !result) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            handleSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [mode, hasStarted, timeLeft, isSubmitting, result]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleAnswerChange = (qNum: string, ans: string) => {
    setAnswers(prev => ({ ...prev, [qNum]: ans }));
  };

  const calculateScore = (rawScore: number) => {
    // TOEIC Reading Score approximation (0-100 raw -> 5-495 scaled)
    // Simplified mapping for mock test purposes:
    if (rawScore === 0) return 5;
    const scaled = Math.round(rawScore * 4.9);
    return Math.min(scaled, 495);
  };

  const handleSubmit = async () => {
    if (!testData) return;
    
    setIsSubmitting(true);
    // Note: Deducting credit is optional for TOEIC if it doesn't use AI grading, 
    // but we can do it to match the platform's mock test flow if desired.
    // For now we'll just grade it locally since we have the answers.

    let correctCount = 0;
    const detailedResults: any = {};
    const correctAnswers = testData.answers as Record<string, string>;

    const startQ = isListening ? 1 : 101;
    const endQ = isListening ? 100 : 200;

    for (let i = startQ; i <= endQ; i++) {
      const q = i.toString();
      const userAns = answers[q] || '';
      const correctAns = correctAnswers[q];
      const isCorrect = userAns === correctAns;
      if (isCorrect) correctCount++;
      detailedResults[q] = {
        userAnswer: userAns,
        correctAnswer: correctAns,
        isCorrect
      };
    }

    const scaledScore = calculateScore(correctCount);

    const finalResult = {
      rawScore: correctCount,
      scaledScore,
      totalQuestions: 100,
      details: detailedResults
    };

    setResult(finalResult);

    await saveMockTestResult({
      examId: examId,
      title: `จำลองสอบ TOEIC ${isListening ? 'Listening' : 'Reading'} (${testData.name})`,
      lang: 'EN',
      level: 'TOEIC',
      part: isListening ? 'Listening' : 'Reading',
      score: scaledScore,
      maxScore: 495,
      isPass: scaledScore >= 250, // Arbitrary pass mark
      aiFeedback: `คะแนนดิบ: ${correctCount}/100\nคะแนนสเกลโดยประมาณ: ${scaledScore}/495`,
      strengths: [],
      weaknesses: [],
      resultsBreakdown: detailedResults,
      createdAt: Date.now()
    });

    setIsSubmitting(false);
  };

  if (!testData) {
    return <div className="p-10 text-center">Exam data not found.</div>;
  }

  // Pre-start screen for mock mode
  if (mode === 'mock' && !hasStarted && !result) {
    return (
      <div className="flex flex-col h-full w-full max-w-5xl mx-auto pb-10 items-center justify-center min-h-[60vh]">
        <button onClick={onBack} className="absolute top-6 left-6 flex items-center gap-2 text-indigo-600 font-medium">
          <ChevronLeft size={20} /> ย้อนกลับ
        </button>
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-md w-full text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-6">
            <Clock size={40} />
          </div>
          <h2 className="text-2xl font-black text-gray-800 mb-2">พร้อมทำข้อสอบหรือยัง?</h2>
          <p className="text-gray-500 mb-8">
            เมื่อกดเริ่มทำข้อสอบ ระบบจะเริ่มจับเวลา 75 นาที คุณจะไม่สามารถหยุดเวลาได้จนกว่าจะส่งข้อสอบ
          </p>
          <button
            onClick={() => setHasStarted(true)}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg transition-transform hover:scale-105"
          >
            เริ่มทำข้อสอบทันที
          </button>
        </div>
      </div>
    );
  }

  // Result screen
  if (result) {
    return (
      <div className="flex flex-col h-full w-full max-w-5xl mx-auto pb-10 mt-6">
        <button onClick={onBack} className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700 transition-colors mb-6 self-start">
          <ChevronLeft size={20} /> กลับหน้ารวมข้อสอบ
        </button>
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full mb-4">
              <CheckCircle size={40} />
            </div>
            <h2 className="text-3xl font-black text-gray-900 mb-2">ผลการสอบ TOEIC {isListening ? 'Listening' : 'Reading'}</h2>
            <p className="text-gray-500">คะแนนโดยประมาณของคุณ</p>
            <div className="text-6xl font-black text-indigo-600 mt-4">{result.scaledScore} <span className="text-2xl text-gray-400">/ 495</span></div>
            <p className="text-gray-500 mt-2">คะแนนดิบ (ทำถูก): {result.rawScore} / 100 ข้อ</p>
          </div>
          
          <div className="mt-8 border-t border-gray-100 pt-8">
            <h3 className="text-xl font-bold text-gray-800 mb-4">เฉลยละเอียด</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-96 overflow-y-auto p-2">
              {Array.from({length: 100}, (_, i) => i + (isListening ? 1 : 101)).map(qNum => {
                const q = qNum.toString();
                const d = result.details[q];
                return (
                  <div key={q} className={`p-3 rounded-xl border ${d.isCorrect ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-gray-700">ข้อ {q}</span>
                      {d.isCorrect ? <CheckCircle size={16} className="text-emerald-500"/> : <XCircle size={16} className="text-rose-500"/>}
                    </div>
                    <div className="text-xs text-gray-600">
                      คุณตอบ: <span className={d.isCorrect ? "text-emerald-700 font-bold" : "text-rose-700 font-bold"}>{d.userAnswer || '-'}</span>
                    </div>
                    {!d.isCorrect && (
                      <div className="text-xs text-gray-600">
                        เฉลย: <span className="text-emerald-700 font-bold">{d.correctAnswer}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active Test Screen
  const mainContent = (
    <div className={`flex flex-col w-full ${isFullscreen ? 'fixed inset-0 z-[999999] bg-white h-screen overflow-hidden' : 'h-[calc(100vh-80px)]'}`}>
      {/* Header — locked at top */}
      <div className={`flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3.5 bg-white border-b border-gray-200 shrink-0 gap-2 z-[10] ${isFullscreen ? 'pt-[max(env(safe-area-inset-top),20px)] shadow-md' : ''}`}>
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button onClick={onBack} className="p-1 text-gray-400 hover:text-gray-600 shrink-0">
            <ChevronLeft size={22} />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-lg font-bold text-gray-800 truncate">{testData.name}</h2>
            <p className="text-[11px] text-gray-500">{mode === 'mock' ? 'Mock Test Mode' : (isFullscreen ? 'โหมดเต็มจอ' : 'Practice Mode')}</p>
          </div>
        </div>
        
        {(testData as any).audioPath && (
          <div className="flex items-center gap-3 bg-indigo-50 px-4 py-2 rounded-full shadow-inner flex-1 max-w-xl justify-center mx-2 hidden md:flex">
            <span className="text-xs sm:text-sm font-bold text-indigo-900 whitespace-nowrap">Listening Audio</span>
            <audio 
              controls 
              controlsList="nodownload noplaybackrate"
              className="w-full max-w-[280px] h-8 outline-none" 
              src={getFirebaseStorageUrl((testData as any).audioPath)}
            />
          </div>
        )}

        {mode === 'mock' ? (
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl font-bold font-mono text-xs sm:text-base ${timeLeft < 300 ? 'bg-rose-100 text-rose-700 animate-pulse' : 'bg-slate-100 text-slate-700'}`}>
              <Clock size={16} />
              <span>{formatTime(timeLeft)}</span>
            </div>
            <button
              onClick={() => { if(window.confirm('ต้องการส่งข้อสอบใช่หรือไม่?')) handleSubmit(); }}
              disabled={isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors shrink-0"
            >
              {isSubmitting ? 'กำลังตรวจ...' : 'ส่งข้อสอบ'}
            </button>
          </div>
        ) : isFullscreen ? (
          <button
            onClick={() => setIsFullscreen(false)}
            className="bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold border border-rose-200 shadow-xs transition-colors flex items-center gap-1.5 shrink-0"
            title="ออกเต็มจอ"
          >
            <X size={16} />
            <span>ออกเต็มจอ</span>
          </button>
        ) : (
          <button
            onClick={() => setIsFullscreen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors flex items-center gap-1.5 shrink-0"
          >
            <Maximize2 size={16} /> <span className="hidden sm:inline">ดูแบบเต็มจอ</span><span className="sm:hidden">เต็มจอ</span>
          </button>
        )}
      </div>

      {/* Mobile Audio Player */}
      {(testData as any).audioPath && (
        <div className="md:hidden bg-indigo-50/90 px-3 sm:px-4 py-2 border-b border-gray-200 shrink-0 flex items-center gap-2">
          <audio 
            controls 
            controlsList="nodownload noplaybackrate"
            className="w-full h-8 outline-none" 
            src={getFirebaseStorageUrl((testData as any).audioPath)}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden relative">
        {/* Images Viewer */}
        <div className={`w-full ${mode === 'mock' ? 'md:flex-1 md:border-r border-b md:border-b-0' : 'md:flex-1'} flex-1 md:h-full flex flex-col bg-slate-100 min-h-0 relative border-gray-200`}>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mx-auto max-w-4xl space-y-4 pb-20">
              {imagePaths.length > 0 ? (
                imagePaths.map((path, idx) => (
                  <div key={idx} className="relative group bg-white shadow-sm border border-gray-200">
                    <AnnotatableImage
                      src={getFirebaseStorageUrl(path)}
                      alt={`Page ${idx + 1}`}
                      className="w-full h-auto block"
                      annotationState={annotationState}
                      clearTrigger={clearTrigger}
                      isActive={annotationState.activeTool !== 'none'}
                    />
                    {/* Page Number indicator */}
                    <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-bold z-10">
                      หน้าที่ {idx + 1}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 bg-white min-h-[500px]">Loading images...</div>
              )}
            </div>
          </div>

          {/* Floating Annotation Toolbar */}
          {mode === 'practice' && (
            <div className="fixed bottom-24 right-4 z-[110] pointer-events-none flex flex-col items-end">
              <div className="pointer-events-auto shadow-lg rounded-full">
                <AnnotationToolbar 
                  state={annotationState} 
                  onChange={setAnnotationState} 
                  onClear={() => setClearTrigger(c => c + 1)} 
                />
              </div>
            </div>
          )}
        </div>

        {/* Answer Sheet (only in mock mode) */}
        {mode === 'mock' && (
          <div className="w-full md:w-[320px] lg:w-[350px] flex-none md:h-full bg-white flex flex-col min-h-0 shrink-0 border-t md:border-t-0 border-gray-200">
            <div className="p-4 border-b border-gray-100 bg-slate-50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <FileText size={18} className="text-indigo-600" /> Answer Sheet
              </h3>
              <p className="text-xs text-gray-500 mt-1">{isListening ? 'Part 1-4 (Questions 1-100)' : 'Part 5-7 (Questions 101-200)'}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-6">
                {(isListening ? [
                  { title: "Part 1: Photographs", range: [1, 6] },
                  { title: "Part 2: Question-Response", range: [7, 31], opts: ['A', 'B', 'C'] },
                  { title: "Part 3: Conversations", range: [32, 70] },
                  { title: "Part 4: Talks", range: [71, 100] }
                ] : [
                  { title: "Part 5: Incomplete Sentences", range: [101, 130] },
                  { title: "Part 6: Text Completion", range: [131, 146] },
                  { title: "Part 7: Reading Comprehension", range: [147, 200] }
                ]).map(section => (
                  <div key={section.title}>
                    <h4 className="font-bold text-sm text-indigo-700 mb-3 sticky top-0 bg-white py-1">{section.title}</h4>
                    <div className="space-y-3">
                      {Array.from({length: section.range[1] - section.range[0] + 1}, (_, i) => i + section.range[0]).map(qNum => (
                        <div key={qNum} className="flex items-center gap-4 group hover:bg-slate-50 p-1 rounded-lg">
                          <span className="w-8 font-medium text-gray-600">{qNum}.</span>
                          <div className="flex gap-2">
                            {(section.opts || ['A', 'B', 'C', 'D']).map(opt => (
                              <button
                                key={opt}
                                onClick={() => handleAnswerChange(qNum.toString(), opt)}
                                className={`w-8 h-8 rounded-full border text-sm font-medium transition-colors ${answers[qNum.toString()] === opt ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 text-gray-500 hover:border-indigo-400'}`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return isFullscreen ? createPortal(mainContent, document.body) : mainContent;
}
