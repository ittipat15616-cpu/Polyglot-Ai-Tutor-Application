sed -i '/<div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-6 h-full min-h-\[500px\]">/i\
        {examState === '"'"'SETUP'"'"' && (\
          <div className="max-w-5xl mx-auto flex justify-end mb-4">\
             <button\
                onClick={async () => {\
                  await fetchHistory();\
                  setShowHistoryModal(true);\
                }}\
                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-2xl shadow-sm hover:bg-indigo-100 transition-all text-sm"\
              >\
                <History size={18} /> ประวัติการสอบศัพท์ล่าสุด (30 ครั้ง)\
              </button>\
          </div>\
        )}' src/components/VocabExamArea.tsx
