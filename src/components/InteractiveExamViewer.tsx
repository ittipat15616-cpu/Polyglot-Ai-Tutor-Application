import React, { useState } from 'react';
import { ChevronLeft, FileText, Bot, CheckCircle2, XCircle } from 'lucide-react';

interface Question {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

interface MockExam {
  id: string;
  title: string;
  type: string;
  skill: string;
  content: string;
  questions: Question[];
}

interface Props {
  exam: MockExam;
  onBack: () => void;
  onAskAI?: (prompt: string) => void;
}

export default function InteractiveExamViewer({ exam, onBack, onAskAI }: Props) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [showExplanation, setShowExplanation] = useState<Record<string, boolean>>({});

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    // Prevent changing answer once selected in Study Mode (instant feedback)
    if (selectedAnswers[questionId] !== undefined) return;
    
    setSelectedAnswers(prev => ({ ...prev, [questionId]: optionIndex }));
    setShowExplanation(prev => ({ ...prev, [questionId]: true }));
  };

  return (
    <div className="flex flex-col h-full w-full mx-auto pb-24">
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700 transition-colors"
        >
          <ChevronLeft size={20} /> กลับไปเลือกชุดข้อสอบ
        </button>
        <h2 className="text-xl font-bold text-gray-900">{exam.title}</h2>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-[800px]">
        {/* Left Panel: Content / Passage */}
        <div className="w-full lg:w-1/2 bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-100">
            <FileText size={22} className="text-indigo-500" />
            <h3 className="text-lg font-semibold text-gray-800">Reading Passage</h3>
          </div>
          <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
            {exam.content.split('\n\n').map((paragraph, idx) => (
              <p key={idx} className="text-gray-700 mb-4 leading-relaxed text-lg">
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        {/* Right Panel: Questions */}
        <div className="w-full lg:w-1/2 bg-gray-50 rounded-2xl border border-gray-200 p-6 flex flex-col h-full">
          <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-200">
            <Bot size={22} className="text-emerald-500" />
            <h3 className="text-lg font-semibold text-gray-800">Questions & Practice</h3>
          </div>
          <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-6">
            {exam.questions.map((q, qIndex) => {
              const isAnswered = selectedAnswers[q.id] !== undefined;
              const selectedIdx = selectedAnswers[q.id];
              const isCorrect = selectedIdx === q.answer;

              return (
                <div key={q.id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                  <h4 className="text-gray-900 font-medium mb-4">
                    <span className="text-indigo-600 font-bold mr-2">{qIndex + 1}.</span>
                    {q.question}
                  </h4>
                  <div className="space-y-3">
                    {q.options.map((opt, optIndex) => {
                      let btnClass = "w-full text-left px-4 py-3 rounded-lg border transition-all ";
                      
                      if (!isAnswered) {
                        btnClass += "border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 text-gray-700";
                      } else {
                        if (optIndex === q.answer) {
                          btnClass += "border-green-500 bg-green-50 text-green-800 font-medium";
                        } else if (optIndex === selectedIdx && !isCorrect) {
                          btnClass += "border-red-500 bg-red-50 text-red-800";
                        } else {
                          btnClass += "border-gray-200 opacity-50 text-gray-500 cursor-not-allowed";
                        }
                      }

                      return (
                        <button
                          key={optIndex}
                          onClick={() => handleSelectOption(q.id, optIndex)}
                          disabled={isAnswered}
                          className={btnClass}
                        >
                          <div className="flex items-center justify-between">
                            <span>{opt}</span>
                            {isAnswered && optIndex === q.answer && <CheckCircle2 size={18} className="text-green-600 shrink-0" />}
                            {isAnswered && optIndex === selectedIdx && !isCorrect && <XCircle size={18} className="text-red-600 shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {showExplanation[q.id] && (
                    <div className={`mt-4 p-4 rounded-lg text-sm ${isCorrect ? 'bg-green-50 border border-green-100' : 'bg-orange-50 border border-orange-100'}`}>
                      <div className="flex items-start gap-2">
                        <Bot size={18} className={isCorrect ? "text-green-600 mt-0.5" : "text-orange-600 mt-0.5"} />
                        <div>
                          <p className={`font-bold mb-1 ${isCorrect ? 'text-green-800' : 'text-orange-800'}`}>
                            {isCorrect ? 'Correct! 🎉' : 'Incorrect'}
                          </p>
                          <p className="text-gray-700 leading-relaxed">{q.explanation}</p>
                          
                          {onAskAI && (
                            <button 
                              onClick={() => onAskAI(`ฉันสงสัยข้อนี้ในข้อสอบ ${exam.title}: "${q.question}" ทำไมคำตอบที่ถูกคือ "${q.options[q.answer]}" ช่วยอธิบายเพิ่มเติมให้หน่อยได้ไหม?`)}
                              className="mt-3 text-indigo-600 hover:text-indigo-800 font-medium text-xs flex items-center gap-1 underline"
                            >
                              ถาม AI Tutor เพิ่มเติม
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Floating Ask AI Button */}
      {onAskAI && (
        <button
          onClick={() => onAskAI?.(`ฉันกำลังทำแบบฝึกหัดเรื่อง ${exam.title} ช่วยสอนเทคนิคการทำข้อสอบแนวนี้หน่อยได้ไหม?`)}
          className="fab-ai fixed bottom-6 right-6"
        >
          <Bot size={22} />
          <span className="hidden sm:inline">ถาม AI Tutor</span>
        </button>
      )}
    </div>
  );
}
