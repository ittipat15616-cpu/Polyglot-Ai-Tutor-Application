import React, { useState } from 'react';
import { HskTestStructure, QuestionPart } from '../data/hskTestStructures';

interface AnswerSheetProps {
  structure: HskTestStructure;
  answers: Record<string, string>;
  onAnswerChange: (qNum: string, ans: string) => void;
}

export default function AnswerSheet({ structure, answers, onAnswerChange }: AnswerSheetProps) {
  // Drag and Drop / Touch Selection state for matching
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  const renderChoiceQuestion = (qNum: number, options: string[]) => (
    <div key={qNum} className="flex items-center gap-2 sm:gap-4 py-2 border-b border-gray-100">
      <div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full font-bold text-gray-700 shrink-0">
        {qNum}
      </div>
      <div className="flex gap-2">
        {options.map((opt) => (
          <label key={opt} className="cursor-pointer">
            <input
              type="radio"
              name={`q${qNum}`}
              value={opt}
              checked={answers[qNum] === opt}
              onChange={() => onAnswerChange(qNum.toString(), opt)}
              className="sr-only"
            />
            <div className={`w-10 h-10 flex items-center justify-center rounded-full border-2 transition-all ${
              answers[qNum] === opt
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                : 'border-gray-300 text-gray-600 hover:border-indigo-400 hover:bg-indigo-50'
            }`}>
              {opt}
            </div>
          </label>
        ))}
      </div>
    </div>
  );

  const renderTrueFalseQuestion = (qNum: number, options: string[]) => (
    <div key={qNum} className="flex items-center gap-2 sm:gap-4 py-2 border-b border-gray-100">
      <div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full font-bold text-gray-700 shrink-0">
        {qNum}
      </div>
      <div className="flex gap-2 sm:gap-4">
        {options.map((opt) => (
          <label key={opt} className="cursor-pointer">
            <input
              type="radio"
              name={`q${qNum}`}
              value={opt}
              checked={answers[qNum] === opt}
              onChange={() => onAnswerChange(qNum.toString(), opt)}
              className="sr-only"
            />
            <div className={`px-3 py-1.5 sm:px-4 sm:py-2 flex items-center justify-center rounded-xl border-2 transition-all text-lg font-bold ${
              answers[qNum] === opt
                ? (opt === '✓' ? 'bg-green-500 border-green-500 text-white shadow-md' : 'bg-red-500 border-red-500 text-white shadow-md')
                : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
            }`}>
              {opt}
            </div>
          </label>
        ))}
      </div>
    </div>
  );

  const renderMatchingDragDrop = (part: QuestionPart) => {
    const choices = part.choicesPool || [];
    // Calculate which choices are already used in this part
    const usedChoices = new Set<string>();
    for (let q = part.startQ; q <= part.endQ; q++) {
      if (answers[q]) usedChoices.add(answers[q]);
    }

    return (
      <div key={part.name} className="mb-8">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{part.name}</h3>
        <p className="text-sm text-gray-500 mb-4">แตะตัวเลือก (A, B, C...) แล้วแตะช่องว่างที่ต้องการตอบ (หรือลากไปวางก็ได้)</p>
        
        {/* Draggable Items Pool */}
        <div className="flex flex-wrap gap-2 mb-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
          {choices.map((choice) => {
            const isUsed = usedChoices.has(choice);
            const isSelected = selectedItem === choice;
            return (
              <div
                key={choice}
                draggable={!isUsed}
                onDragStart={(e) => {
                  setSelectedItem(choice);
                  e.dataTransfer.setData('text/plain', choice);
                }}
                onDragEnd={() => setSelectedItem(null)}
                onClick={() => {
                  if (!isUsed) {
                    setSelectedItem(isSelected ? null : choice);
                  }
                }}
                className={`w-12 h-12 flex items-center justify-center rounded-xl font-bold text-xl shadow-sm border-2 transition-all ${
                  isUsed 
                    ? 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed opacity-50' 
                    : isSelected
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg transform scale-110'
                      : 'bg-white border-indigo-400 text-indigo-700 cursor-pointer hover:shadow-md hover:bg-indigo-50'
                }`}
              >
                {choice}
              </div>
            );
          })}
        </div>

        {/* Drop Zones */}
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: part.endQ - part.startQ + 1 }, (_, i) => part.startQ + i).map(qNum => (
            <div key={qNum} className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full font-bold text-gray-700">
                {qNum}
              </div>
              <div 
                className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl border-2 transition-all ${
                  answers[qNum] 
                    ? 'bg-indigo-100 border-indigo-500 text-indigo-800' 
                    : selectedItem
                      ? 'bg-white border-indigo-300 border-dashed text-gray-400 cursor-pointer hover:bg-indigo-50'
                      : 'bg-white border-gray-300 border-dashed text-gray-400 hover:border-indigo-400'
                }`}
                onDragOver={(e) => {
                  e.preventDefault(); // Allow drop
                  e.currentTarget.classList.add('bg-indigo-50', 'border-indigo-400');
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('bg-indigo-50', 'border-indigo-400');
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('bg-indigo-50', 'border-indigo-400');
                  const data = e.dataTransfer.getData('text/plain');
                  if (data) {
                    onAnswerChange(qNum.toString(), data);
                    setSelectedItem(null);
                  }
                }}
                onClick={() => {
                  if (selectedItem) {
                    // Tap to place
                    onAnswerChange(qNum.toString(), selectedItem);
                    setSelectedItem(null);
                  } else if (answers[qNum]) {
                    // Tap to clear
                    onAnswerChange(qNum.toString(), '');
                  }
                }}
                title={answers[qNum] ? "คลิกเพื่อยกเลิก" : "ลาก/คลิก เพื่อวางคำตอบ"}
              >
                {answers[qNum] || '?'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPart = (part: QuestionPart) => {
    if (part.type === 'matching_drag_drop') {
      return renderMatchingDragDrop(part);
    }

    return (
      <div key={part.name} className="mb-8">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{part.name}</h3>
        <div className="flex flex-col gap-2">
          {Array.from({ length: part.endQ - part.startQ + 1 }, (_, i) => part.startQ + i).map(qNum => {
            if (part.type === 'choice') {
              return renderChoiceQuestion(qNum, part.options || []);
            }
            if (part.type === 'true_false') {
              return renderTrueFalseQuestion(qNum, part.options || []);
            }
            if (part.type === 'ordering_input') {
              return (
                <div key={qNum} className="flex flex-col gap-2 py-2 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full font-bold text-gray-700">
                      {qNum}
                    </div>
                    <span className="text-sm text-gray-500">เรียงประโยค (พิมพ์ A, B, C ติดกัน)</span>
                  </div>
                  <input 
                    type="text" 
                    placeholder="เช่น BAC"
                    value={answers[qNum] || ''}
                    onChange={(e) => onAnswerChange(qNum.toString(), e.target.value.toUpperCase())}
                    className="ml-11 border-2 border-gray-200 rounded-lg px-4 py-2 uppercase font-bold text-lg tracking-widest focus:border-indigo-500 focus:ring-0 w-32"
                    maxLength={5}
                  />
                </div>
              );
            }
            if (part.type === 'writing_textarea') {
              return (
                <div key={qNum} className="flex flex-col gap-2 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full font-bold text-gray-700">
                      {qNum}
                    </div>
                    <span className="text-sm text-gray-500">พิมพ์คำตอบของคุณ</span>
                  </div>
                  <textarea 
                    placeholder="พิมพ์ภาษาจีน หรือ พินอิน..."
                    value={answers[qNum] || ''}
                    onChange={(e) => onAnswerChange(qNum.toString(), e.target.value)}
                    className="ml-11 border border-gray-200 rounded-xl px-4 py-3 focus:border-indigo-500 focus:ring-0 h-24 resize-none"
                  />
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full">
      {structure.parts.listening.length > 0 && (
        <div className="mb-10">
          <div className="bg-indigo-600 text-white py-2 px-4 rounded-xl font-bold mb-6 flex items-center justify-between">
            <span>🎧 พาร์ทการฟัง (Listening)</span>
          </div>
          {structure.parts.listening.map(renderPart)}
        </div>
      )}

      {structure.parts.reading.length > 0 && (
        <div className="mb-10">
          <div className="bg-orange-500 text-white py-2 px-4 rounded-xl font-bold mb-6 flex items-center justify-between">
            <span>📖 พาร์ทการอ่าน (Reading)</span>
          </div>
          {structure.parts.reading.map(renderPart)}
        </div>
      )}

      {structure.parts.writing.length > 0 && (
        <div className="mb-10">
          <div className="bg-green-600 text-white py-2 px-4 rounded-xl font-bold mb-6 flex items-center justify-between">
            <span>✍️ พาร์ทการเขียน (Writing)</span>
          </div>
          {structure.parts.writing.map(renderPart)}
        </div>
      )}
    </div>
  );
}
