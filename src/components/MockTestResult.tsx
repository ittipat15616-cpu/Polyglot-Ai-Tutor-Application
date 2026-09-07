import React, { useState } from 'react';
import { HskTestStructure, QuestionPart } from '../data/hskTestStructures';
import { CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

export interface TestResultData {
  totalScore: number;
  maxScore: number;
  isPass: boolean;
  parts: {
    listening?: { score: number; max: number };
    reading?: { score: number; max: number };
    writing?: { score: number; max: number };
  };
  results: {
    questionNumber: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    explanationThai: string;
  }[];
}

interface MockTestResultProps {
  structure: HskTestStructure;
  resultData: TestResultData;
  onClose: () => void;
}

export default function MockTestResult({ structure, resultData, onClose }: MockTestResultProps) {
  const [expandedQ, setExpandedQ] = useState<string | null>(null);

  const renderScoreBar = (label: string, score: number, max: number, colorClass: string) => {
    const percentage = Math.round((score / max) * 100);
    return (
      <div className="mb-4">
        <div className="flex justify-between text-sm font-bold mb-1">
          <span>{label}</span>
          <span>{score} / {max}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div className={`h-2.5 rounded-full ${colorClass}`} style={{ width: `${percentage}%` }}></div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-50 overflow-y-auto p-4 md:p-8">
      <div className="max-w-4xl mx-auto w-full">
        {/* Header / Score Card */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 mb-8 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-shrink-0 text-center">
            <div className={`w-32 h-32 rounded-full flex flex-col items-center justify-center border-4 ${resultData.isPass ? 'border-green-500 bg-green-50 text-green-600' : 'border-red-500 bg-red-50 text-red-600'}`}>
              <span className="text-3xl font-black">{resultData.totalScore}</span>
              <span className="text-sm font-medium">/ {resultData.maxScore}</span>
            </div>
            <div className={`mt-4 font-bold text-lg ${resultData.isPass ? 'text-green-600' : 'text-red-600'}`}>
              {resultData.isPass ? '🎉 สอบผ่าน!' : '😢 ยังไม่ผ่าน'}
            </div>
          </div>
          
          <div className="flex-1 w-full">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">สรุปผลคะแนน {structure.level}</h2>
            {resultData.parts.listening && renderScoreBar('พาร์ทการฟัง', resultData.parts.listening.score, resultData.parts.listening.max, 'bg-indigo-500')}
            {resultData.parts.reading && renderScoreBar('พาร์ทการอ่าน', resultData.parts.reading.score, resultData.parts.reading.max, 'bg-orange-500')}
            {resultData.parts.writing && renderScoreBar('พาร์ทการเขียน', resultData.parts.writing.score, resultData.parts.writing.max, 'bg-green-500')}
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
            <h3 className="text-xl font-bold text-gray-800">เฉลยและคำอธิบายโดย AI</h3>
            <span className="text-sm text-gray-500">คลิกที่ข้อเพื่อดูคำอธิบาย</span>
          </div>
          
          <div className="divide-y divide-gray-100">
            {resultData.results.map((res) => (
              <div key={res.questionNumber} className="flex flex-col">
                <div 
                  className={`px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors ${!res.isCorrect ? 'bg-red-50/30' : ''}`}
                  onClick={() => setExpandedQ(expandedQ === res.questionNumber ? null : res.questionNumber)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-xl font-bold text-gray-700">
                      {res.questionNumber}
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">คำตอบของคุณ</div>
                      <div className="font-bold text-lg">{res.userAnswer || '-'}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-sm text-gray-500">เฉลย</div>
                      <div className="font-bold text-lg text-green-600">{res.correctAnswer}</div>
                    </div>
                    <div className="w-8 h-8 flex items-center justify-center">
                      {res.isCorrect ? <CheckCircle className="text-green-500" /> : <XCircle className="text-red-500" />}
                    </div>
                    {expandedQ === res.questionNumber ? <ChevronUp className="text-gray-400" /> : <ChevronDown className="text-gray-400" />}
                  </div>
                </div>

                {expandedQ === res.questionNumber && (
                  <div className="px-6 py-4 bg-indigo-50/30 border-t border-indigo-100 text-gray-700 leading-relaxed">
                    <div className="flex gap-2">
                      <AlertCircle className="text-indigo-500 shrink-0 mt-0.5" size={20} />
                      <div>
                        <span className="font-bold text-indigo-800 mb-2 block">คำอธิบายจาก AI:</span>
                        <div dangerouslySetInnerHTML={{ __html: res.explanationThai.replace(/\n/g, '<br />') }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <button 
            onClick={onClose}
            className="px-8 py-3 bg-gray-900 text-white font-bold rounded-xl shadow-lg hover:bg-gray-800 transition-colors"
          >
            กลับสู่หน้าหลัก
          </button>
        </div>
      </div>
    </div>
  );
}
