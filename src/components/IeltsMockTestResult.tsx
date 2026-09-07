import React from 'react';
import { CheckCircle, XCircle, Award, RefreshCw, ChevronLeft } from 'lucide-react';
import { IeltsGradeResult } from '../utils/ieltsGrading';
import { AiGradingResult } from '../utils/AiGradingService';

type Skill = 'listening' | 'reading' | 'writing' | 'speaking';

interface IeltsMockTestResultProps {
  examId: string;
  skill: Skill;
  resultData: IeltsGradeResult | AiGradingResult;
  onClose: () => void;
}

export default function IeltsMockTestResult({ examId, skill, resultData, onClose }: IeltsMockTestResultProps) {
  const isAiGraded = skill === 'writing' || skill === 'speaking';

  if (isAiGraded) {
    const aiResult = resultData as AiGradingResult;
    return (
      <div className="flex flex-col h-full w-full max-w-4xl mx-auto pb-20 pt-8 px-4">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 mb-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
          
          <div className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Award size={48} />
          </div>
          
          <h2 className="text-3xl font-black text-gray-800 mb-2">สอบเสร็จสมบูรณ์!</h2>
          <p className="text-lg text-gray-500 mb-8">นี่คือผลประเมินจาก AI สำหรับทักษะ {skill.toUpperCase()}</p>
          
          <div className="flex justify-center mb-10">
            <div className="bg-gradient-to-br from-indigo-50 to-white border-2 border-indigo-100 rounded-2xl p-8 shadow-sm">
              <div className="text-gray-500 font-bold mb-2 uppercase tracking-wide">Estimated Band Score</div>
              <div className="text-6xl font-black text-indigo-600">{aiResult.bandScore.toFixed(1)}</div>
            </div>
          </div>

          
          {aiResult.transcript && (
            <div className="text-left bg-blue-50 p-6 rounded-2xl border border-blue-100 mb-6">
              <h3 className="font-bold text-blue-800 text-lg mb-4">Transcript & Question Analysis:</h3>
              <p className="text-blue-900 whitespace-pre-wrap font-medium">{aiResult.transcript}</p>
            </div>
          )}

<div className="text-left bg-gray-50 p-6 rounded-2xl border border-gray-100 mb-6">
            <h3 className="font-bold text-gray-800 text-lg mb-4">Feedback:</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{aiResult.feedback}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
              <h3 className="font-bold text-emerald-800 text-lg mb-4 flex items-center gap-2">
                <CheckCircle size={20} /> Strengths
              </h3>
              <ul className="list-disc pl-5 text-emerald-700 space-y-2">
                {aiResult.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            
            <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100">
              <h3 className="font-bold text-rose-800 text-lg mb-4 flex items-center gap-2">
                <XCircle size={20} /> Areas to Improve
              </h3>
              <ul className="list-disc pl-5 text-rose-700 space-y-2">
                {aiResult.weaknesses.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <button 
            onClick={onClose}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-12 rounded-xl shadow-lg transition-transform hover:scale-105"
          >
            <ChevronLeft size={20} /> กลับสู่หน้ารวมข้อสอบ
          </button>
        </div>
      </div>
    );
  }

  // Objective Test (Listening/Reading)
  const objResult = resultData as IeltsGradeResult;
  const totalQuestions = objResult.correctAnswers + objResult.incorrectAnswers;
  
  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto pb-20 pt-8 px-4">
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 mb-8 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
        
        <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Award size={40} />
        </div>
        
        <h2 className="text-3xl font-black text-gray-800 mb-2">สอบเสร็จสมบูรณ์!</h2>
        <p className="text-gray-500 mb-8">{examId.replace(/_/g, ' ')} - {skill.toUpperCase()}</p>
        
        <div className="flex flex-wrap justify-center gap-6 mb-10">
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 min-w-[160px]">
            <div className="text-gray-500 font-bold mb-1">คะแนนดิบ (Raw Score)</div>
            <div className="text-4xl font-black text-gray-800">{objResult.rawScore} <span className="text-2xl text-gray-400">/ {totalQuestions}</span></div>
          </div>
          
          <div className="bg-gradient-to-br from-emerald-50 to-white border-2 border-emerald-200 rounded-2xl p-6 min-w-[160px] shadow-sm transform hover:scale-105 transition-transform">
            <div className="text-emerald-600 font-bold mb-1 uppercase tracking-wider">Band Score</div>
            <div className="text-5xl font-black text-emerald-600">{objResult.bandScore.toFixed(1)}</div>
          </div>
        </div>

        <div className="flex justify-center gap-8 mb-8 border-t border-gray-100 pt-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
              <CheckCircle size={24} />
            </div>
            <div className="text-left">
              <div className="text-sm text-gray-500 font-bold">ตอบถูก</div>
              <div className="text-2xl font-black text-green-600">{objResult.correctAnswers}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
              <XCircle size={24} />
            </div>
            <div className="text-left">
              <div className="text-sm text-gray-500 font-bold">ตอบผิด</div>
              <div className="text-2xl font-black text-red-600">{objResult.incorrectAnswers}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 mb-8">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <CheckCircle className="text-indigo-600" /> ตรวจสอบคำตอบ
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(objResult.details).map(([qNum, detail]) => (
            <div key={qNum} className={`p-4 rounded-xl border ${detail.isCorrect ? 'bg-green-50/50 border-green-200' : 'bg-red-50/50 border-red-200'}`}>
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-gray-700">ข้อ {qNum}</span>
                {detail.isCorrect ? (
                  <CheckCircle size={20} className="text-green-500" />
                ) : (
                  <XCircle size={20} className="text-red-500" />
                )}
              </div>
              
              <div className="text-sm mb-1">
                <span className="text-gray-500 block">คำตอบของคุณ:</span>
                <span className={`font-semibold ${detail.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                  {detail.userAnswer || '-'}
                </span>
              </div>
              
              {!detail.isCorrect && (
                <div className="text-sm border-t border-red-100 pt-2 mt-2">
                  <span className="text-gray-500 block">เฉลย:</span>
                  <span className="font-semibold text-green-600">{detail.correctAnswer}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex justify-center mb-10">
        <button 
          onClick={onClose}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-12 rounded-xl shadow-lg transition-transform hover:scale-105"
        >
          <ChevronLeft size={20} /> กลับสู่หน้ารวมข้อสอบ
        </button>
      </div>
    </div>
  );
}
