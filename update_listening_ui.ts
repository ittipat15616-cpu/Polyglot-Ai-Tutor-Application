import fs from 'fs';

let content = fs.readFileSync('./src/components/ExercisesArea.tsx', 'utf-8');

// Replace Listening Detail View block in ExercisesArea.tsx
const oldBlockStart = `    const article = selectedListeningArticle;
    const folderName = \`listening/\${article.levelKey}/Lesson\${article.lessonNum}\`;`;

const newBlock = `    const article = selectedListeningArticle;
    const folderName = \`listening/\${article.levelKey}/Lesson\${article.lessonNum}\`;

    const audioPlayerNode = article.audioUrl ? (
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4 rounded-2xl shadow-md flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center shrink-0">
          <Headphones size={24} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-blue-100 uppercase tracking-wider mb-1">VOA Listening Audio (เจ้าของภาษา)</p>
          <audio controls src={article.audioUrl} className="w-full h-10 outline-none rounded-lg" />
        </div>
      </div>
    ) : null;

    if (isFullscreen) {
      return (
        <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
          <div className="absolute top-6 right-6 z-[60] flex items-center gap-3">
            <button onClick={() => setIsFullscreen(false)} title="Close Fullscreen"
              className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors border border-gray-200">
               <X size={24} />
            </button>
          </div>
          <div className="flex-1 w-full overflow-hidden relative p-4">
            <DocumentGallery type="courseware" folder={folderName} prefix="page" enableAnnotation={true} prependNode={audioPlayerNode} />
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full w-full max-w-4xl mx-auto pb-16">
        <button onClick={handleBack} className="flex items-center gap-2 text-indigo-600 font-medium hover:text-indigo-700 transition-colors mb-6 self-start">
          <ChevronLeft size={20} /> ย้อนกลับไปเลือกรอบบทเรียน
        </button>

        <div className="animate-in fade-in duration-300 flex flex-col gap-8">
          
          {/* 1. Header & Audio Player */}
          <div className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm">
            <div className="flex justify-between items-start flex-wrap gap-4 mb-6">
              <div>
                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg mb-2">
                  บทเรียนการฟัง • {selectedListeningLevel?.toUpperCase()}
                </span>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">{article.title}</h1>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setIsFullscreen(true)} className="flex items-center gap-2 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 px-4 py-2 rounded-xl font-medium transition-colors">
                  ดูแบบเต็มหน้าจอ
                </button>
              </div>
            </div>

            {/* Audio Player at Top */}
            {audioPlayerNode}
          </div>

          {/* 2. Existing Courseware Document Gallery */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden p-4 md:p-6" style={{ minHeight: '500px' }}>
            <h3 className="text-lg font-bold text-gray-900 mb-4 px-2">📄 เอกสารประกอบการฟัง (Courseware Document)</h3>
            <div className="rounded-2xl overflow-hidden border border-gray-200">
              <DocumentGallery type="courseware" folder={folderName} prefix="page" enableAnnotation={true} />
            </div>
          </div>

          {/* 3. Interactive Quiz & Answer Explanations */}
          {article.quiz && article.quiz.length > 0 && (
            <div className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  📝
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">แบบฝึกหัดการฟัง (Listening Exercises)</h3>
                  <p className="text-sm text-gray-500">เลือกคำตอบและดูเฉลยพร้อมคำอธิบายที่มาของคำตอบ</p>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                {article.quiz.map((q: any, qIdx: number) => {
                  const selectedOpt = (article as any)[\`ans_\${qIdx}\`];
                  const isAnswered = selectedOpt !== undefined;

                  return (
                    <div key={qIdx} className="bg-gray-50/70 rounded-2xl p-5 border border-gray-200/80">
                      <p className="font-bold text-gray-900 text-base mb-4">
                        ข้อที่ {qIdx + 1}. {q.question}
                      </p>
                      
                      <div className="grid grid-cols-1 gap-2.5 mb-4">
                        {q.options.map((opt: string, optIdx: number) => {
                          const isSelected = selectedOpt === optIdx;
                          const isCorrect = q.answer === optIdx;
                          let btnStyle = "bg-white text-gray-700 border-gray-200 hover:bg-gray-100";

                          if (isAnswered) {
                            if (isCorrect) btnStyle = "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold shadow-xs";
                            else if (isSelected) btnStyle = "bg-red-50 text-red-800 border-red-300 font-bold";
                          }

                          return (
                            <button
                              key={optIdx}
                              onClick={() => {
                                setSelectedListeningArticle((prev: any) => ({
                                  ...prev,
                                  [\`ans_\${qIdx}\`]: optIdx
                                }));
                              }}
                              className={\`w-full text-left p-3.5 rounded-xl border text-sm transition-all flex items-center justify-between \${btnStyle}\`}
                            >
                              <span>{String.fromCharCode(65 + optIdx)}. {opt}</span>
                              {isAnswered && isCorrect && <span className="text-emerald-600 text-xs font-bold px-2 py-0.5 bg-emerald-100 rounded-md">✓ ถูกต้อง</span>}
                              {isAnswered && isSelected && !isCorrect && <span className="text-red-600 text-xs font-bold px-2 py-0.5 bg-red-100 rounded-md">✕ ไม่ถูกต้อง</span>}
                            </button>
                          );
                        })}
                      </div>

                      {/* Explanation & Source Reference Box */}
                      {isAnswered && (
                        <div className="mt-4 p-4 rounded-xl bg-amber-50/80 border border-amber-200/80 text-sm text-amber-900 animate-in fade-in duration-200">
                          <p className="font-bold text-amber-900 mb-1 flex items-center gap-1.5">
                            <span>💡 เฉลยและคำอธิบายที่มาของคำตอบ:</span>
                          </p>
                          <p className="text-amber-800 leading-relaxed">{q.explanation || "คำตอบอ้างอิงจากบทสัมภาษณ์และช่วงข้อมูลสำคัญในไฟล์เสียง VOA"}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. VOCABULARY SECTION AT THE VERY BOTTOM */}
          {article.vocabList && article.vocabList.length > 0 && (
            <div className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                  📚
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">คำศัพท์ประจำบทเรียน (Vocabulary)</h3>
                  <p className="text-sm text-gray-500">รวบรวมไว้ที่ท้ายบทเรียนเพื่อความสะดวกในการทบทวน</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {article.vocabList.map((v: any, vIdx: number) => (
                  <div key={vIdx} className="bg-purple-50/50 p-4 rounded-2xl border border-purple-100 flex flex-col justify-between">
                    <div>
                      <h4 className="text-lg font-bold text-purple-900 mb-1">{v.word}</h4>
                      {v.phonetic && <p className="text-xs text-purple-600 font-mono mb-2">{v.phonetic}</p>}
                      <p className="text-sm text-gray-700 font-medium">{v.th || v.en}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }`;

// Find target section to replace in content
const targetRegex = /const article = selectedListeningArticle;[\s\S]*?return \([\s\S]*?\}\s*\}\s*if \(selectedSkill === 'VOA Learning English'\)/;

if (targetRegex.test(content)) {
  content = content.replace(targetRegex, newBlock + "\n\n  if (selectedSkill === 'VOA Learning English')");
  fs.writeFileSync('./src/components/ExercisesArea.tsx', content, 'utf-8');
  console.log('Successfully updated Listening Detail UI in ExercisesArea.tsx!');
} else {
  console.error('Target regex not matched in ExercisesArea.tsx');
}
