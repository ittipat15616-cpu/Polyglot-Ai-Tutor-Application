import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Clock, Send, AlertTriangle } from 'lucide-react';
import { saveMockTestResult } from '../services/userPersistence';
import { deductCredit } from '../services/subscriptionService';
import DocumentGallery from './DocumentGallery';
import AnswerSheet from './AnswerSheet';
import MockTestResult, { TestResultData } from './MockTestResult';
import { hskStructures } from '../data/hskTestStructures';
import { gradeExam } from '../utils/gradeExam';

interface MockTestAreaProps {
  level: string; // e.g. HSK1
  examId: string; // e.g. H10901
  videoId?: string;
  onExit: () => void;
}

export default function MockTestArea({ level, examId, videoId, onExit }: MockTestAreaProps) {
  const structure = hskStructures[level];
  const [timeLeft, setTimeLeft] = useState(structure?.totalTimeMinutes * 60 || 0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<TestResultData | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const answersRef = useRef(answers);

  const hidePagesCount: Record<string, number> = {
    HSK1: 0,
    HSK2: 0,
    HSK3: 0,
    HSK4: 0,
    HSK5: 0,
    HSK6: 0,
  };
  const hideCount = hidePagesCount[level] ?? 4;

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Timer logic
  useEffect(() => {
    if (!structure || isSubmitting || result || !hasStarted) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit(); // Auto submit
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [structure, isSubmitting, result, hasStarted]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleAnswerChange = (qNum: string, ans: string) => {
    setAnswers(prev => ({ ...prev, [qNum]: ans }));
  };

  const handleSubmit = async () => {
    if (!structure) return;

    // Check & deduct credit (3 credits for exam grading)
    const { success } = await deductCredit('mock_test');
    if (!success) {
      alert('⚡ เครดิต AI ของคุณไม่เพียงพอ (ส่งตรวจข้อสอบใช้ 3 เครดิต) กรุณากดปุ่มแพ็กเกจสมาชิกด้านบนเพื่อเติมเครดิตหรืออัปเกรดแพ็กเกจ');
      return;
    }

    setIsSubmitting(true);

    try {
      // Use client-side grading instead of calling the server API
      const resultData = await gradeExam(level, examId, answersRef.current);
      setResult(resultData);
      await saveMockTestResult({
        examId,
        title: `ข้อสอบจำลอง ${level} (${examId})`,
        lang: 'CN',
        level,
        part: 'Full Exam',
        score: resultData.totalScore,
        maxScore: resultData.maxScore,
        isPass: resultData.isPass,
        resultsBreakdown: resultData.results,
        createdAt: Date.now()
      });
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการตรวจข้อสอบ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmSubmit = () => {
    if (window.confirm('คุณแน่ใจหรือไม่ว่าต้องการส่งข้อสอบ?')) {
      handleSubmit();
    }
  };

  if (!structure) {
    return <div className="p-8">ไม่พบโครงสร้างข้อสอบสำหรับระดับนี้</div>;
  }

  if (result) {
    return <MockTestResult structure={structure} resultData={result} onClose={onExit} />;
  }

  const isLowTime = timeLeft < 300; // less than 5 minutes

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col md:flex-row h-full w-full pb-[70px] md:pb-[70px]">
      {/* Loading Overlay */}
      {isSubmitting && (
        <div className="absolute inset-0 z-[60] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mb-4"></div>
          <h2 className="text-xl font-bold text-gray-800">กำลังให้ AI ตรวจข้อสอบ...</h2>
          <p className="text-gray-500 mt-2">อาจใช้เวลาสักครู่ กรุณารอสักนิดครับ</p>
        </div>
      )}

      {/* Start Exam Overlay */}
      {!hasStarted && !isSubmitting && !result && (
        <div className="absolute inset-0 z-[55] bg-white/60 backdrop-blur-md flex flex-col items-center justify-center">
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center border border-gray-100 flex flex-col items-center">
            <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-6">
              <Clock size={40} />
            </div>
            <h2 className="text-2xl font-black text-gray-800 mb-2">พร้อมทำข้อสอบหรือยัง?</h2>
            <p className="text-gray-500 mb-8">
              เมื่อกดเริ่มทำข้อสอบ ระบบจะเริ่มจับเวลาและแสดงเนื้อหาข้อสอบ คุณจะไม่สามารถหยุดเวลาได้จนกว่าจะส่งข้อสอบ
            </p>
            <button
              id="tutorial-cn-mock-start-btn"
              onClick={() => setHasStarted(true)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg transition-transform hover:scale-105"
            >
              เริ่มทำข้อสอบทันที
            </button>
            <button
              onClick={onExit}
              className="mt-4 text-gray-400 hover:text-gray-600 font-medium"
            >
              ย้อนกลับ
            </button>
          </div>
        </div>
      )}

      {/* Left side: Document Viewer */}
      <div className="flex-1 h-1/2 md:h-full border-b md:border-b-0 md:border-r border-gray-200 relative flex flex-col bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4">
          <button onClick={onExit} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors">
            <ChevronLeft size={24} />
          </button>
          <h2 className="font-bold text-gray-800">เอกสารข้อสอบ: {examId}</h2>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500">ซ่อนหน้าเฉลยแล้ว</span>
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
          {/* Use dynamic hideCount to not cut off Reading/Writing sections in lower level tests */}
          <DocumentGallery 
            type="hsk" 
            folder={level.replace('HSK', 'H')} 
            prefix={examId} 
            hideLastNPages={hideCount} 
            hideDownload={true} 
            prependNode={
              videoId ? (
                <div id="tutorial-cn-mock-yt-player" className="w-full aspect-video rounded-xl overflow-hidden bg-gray-900 shadow-md border border-gray-200 shrink-0">
                  <iframe 
                    width="100%" 
                    height="100%"
                    src={`https://www.youtube.com/embed/${videoId}`} 
                    title="YouTube video player" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                  ></iframe>
                </div>
              ) : undefined
            }
          />
        </div>
      </div>

      {/* Right side: Answer Sheet */}
      <div className="w-full md:w-[450px] lg:w-[500px] h-[55vh] md:h-full shrink-0 md:shrink flex flex-col bg-white pb-20 md:pb-0 z-10 border-t md:border-t-0 md:border-l border-gray-200">
        <div className="bg-white border-b border-gray-200 p-4 flex flex-col gap-2 shrink-0 shadow-sm z-10">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-xl text-gray-800">กระดาษคำตอบ</h2>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50">
          <AnswerSheet structure={structure} answers={answers} onAnswerChange={handleAnswerChange} />
        </div>

        <div className="p-4 bg-white border-t border-gray-200 shrink-0 flex items-center gap-3">
          <div className={`flex-1 flex flex-col justify-center items-center px-2 py-3 rounded-xl border-2 ${isLowTime ? 'border-red-200 bg-red-50 text-red-600 animate-pulse' : 'border-indigo-100 bg-indigo-50 text-indigo-700'}`}>
            <div className="flex items-center gap-1.5 font-black text-lg md:text-xl">
              <Clock size={20} />
              <span className="tracking-wide">{formatTime(timeLeft)}</span>
            </div>
          </div>
          <button 
            onClick={confirmSubmit}
            className="flex-[2] flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-md transition-all hover:shadow-lg active:scale-95"
          >
            <Send size={20} />
            ส่งข้อสอบ
          </button>
        </div>
      </div>
    </div>
  );
}
