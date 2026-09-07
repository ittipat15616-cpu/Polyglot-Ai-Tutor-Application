import React from 'react';

type Skill = 'listening' | 'reading' | 'writing' | 'speaking';

interface IeltsAnswerSheetProps {
  skill: Skill;
  answers: Record<string, string>;
  onAnswerChange: (qNum: string, ans: string) => void;
}

export default function IeltsAnswerSheet({ skill, answers, onAnswerChange }: IeltsAnswerSheetProps) {
  if (skill === 'writing') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Writing Task 1</h3>
          <p className="text-sm text-gray-500 mb-2">Write at least 150 words.</p>
          <textarea
            value={answers['task1'] || ''}
            onChange={(e) => onAnswerChange('task1', e.target.value)}
            className="w-full h-64 p-4 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
            placeholder="Type your answer here..."
          />
          <div className="text-right text-sm text-gray-500 mt-1">
            Word count: {(answers['task1'] || '').trim().split(/\s+/).filter(w => w.length > 0).length}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Writing Task 2</h3>
          <p className="text-sm text-gray-500 mb-2">Write at least 250 words.</p>
          <textarea
            value={answers['task2'] || ''}
            onChange={(e) => onAnswerChange('task2', e.target.value)}
            className="w-full h-96 p-4 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
            placeholder="Type your answer here..."
          />
          <div className="text-right text-sm text-gray-500 mt-1">
            Word count: {(answers['task2'] || '').trim().split(/\s+/).filter(w => w.length > 0).length}
          </div>
        </div>
      </div>
    );
  }

  if (skill === 'speaking') {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 italic">
        (Speaking test does not use a written answer sheet)
      </div>
    );
  }

  // Listening or Reading
  const totalQuestions = 40;
  
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500">
        Enter your answers below. Ensure correct spelling (e.g., singular/plural forms).
      </p>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {Array.from({ length: totalQuestions }, (_, i) => i + 1).map((qNum) => (
          <div key={qNum} className="flex items-center gap-3 bg-white p-2 rounded-lg border border-gray-100 shadow-sm focus-within:border-indigo-300 focus-within:ring-1 focus-within:ring-indigo-300 transition-all">
            <div className="w-8 h-8 shrink-0 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-700">
              {qNum}
            </div>
            <input
              type="text"
              value={answers[qNum.toString()] || ''}
              onChange={(e) => onAnswerChange(qNum.toString(), e.target.value)}
              className="flex-1 min-w-0 bg-transparent outline-none text-gray-800 font-medium placeholder-gray-300"
              placeholder={`Answer ${qNum}`}
              autoComplete="off"
              spellCheck="false"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
