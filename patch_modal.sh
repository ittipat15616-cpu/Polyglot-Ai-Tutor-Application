sed -i '741c\
      {/* History Modal */}\
      {showHistoryModal && (\
        <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4">\
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">\
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-indigo-50/50">\
              <div className="flex items-center gap-3">\
                <div className="p-3 bg-indigo-600 text-white rounded-2xl">\
                  <Award size={24} />\
                </div>\
                <div>\
                  <h3 className="text-xl font-extrabold text-slate-900">ประวัติการสอบศัพท์</h3>\
                  <p className="text-xs text-slate-500">เก็บสถิติสูงสุด 30 ครั้งล่าสุด</p>\
                </div>\
              </div>\
              <button onClick={() => setShowHistoryModal(false)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-all">\
                <X size={20} />\
              </button>\
            </div>\
            <div className="p-6 overflow-y-auto flex-1 space-y-4">\
              {history.length === 0 ? (\
                <div className="text-center py-12 text-gray-400">\
                  <History size={48} className="mx-auto mb-3 opacity-40" />\
                  <p className="font-bold text-gray-600">ยังไม่มีประวัติการสอบ</p>\
                  <p className="text-xs text-gray-400 mt-1">เมื่อทำสอบศัพท์เสร็จ ผลสอบจะถูกเก็บบันทึกทันที</p>\
                </div>\
              ) : (\
                history.map((rec) => (\
                  <details key={rec.id} className="bg-slate-50 rounded-2xl border border-slate-100 flex flex-col group overflow-hidden">\
                    <summary className="p-4 flex flex-col gap-3 cursor-pointer select-none outline-none">\
                      <div className="flex items-center justify-between">\
                        <div className="flex items-center gap-2">\
                          <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 text-xs font-black rounded-lg uppercase">\
                            {rec.lang} : {rec.levelFilter} ({rec.scopeRange})\
                          </span>\
                          <span className="text-xs text-gray-400 font-medium">\
                            {new Date(rec.createdAt).toLocaleString('"'"'th-TH'"'"')}\
                          </span>\
                        </div>\
                        <span className="text-xs font-bold text-gray-500">จำนวน {rec.totalQuestions} คำ</span>\
                      </div>\
                      <div className="grid grid-cols-2 gap-4">\
                        <div className="bg-green-50 text-green-700 px-3 py-2 rounded-xl flex justify-between items-center">\
                           <span className="text-sm font-medium">ศัพท์ถูก</span>\
                           <span className="font-black">{rec.correctWords}</span>\
                        </div>\
                        <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded-xl flex justify-between items-center">\
                           <span className="text-sm font-medium">แปลถูก</span>\
                           <span className="font-black">{rec.correctTrans}</span>\
                        </div>\
                      </div>\
                      <div className="text-center mt-2 text-xs text-indigo-500 font-medium group-open:hidden">\
                        คลิกเพื่อดูรายละเอียด ▾\
                      </div>\
                      <div className="text-center mt-2 text-xs text-indigo-500 font-medium hidden group-open:block">\
                        ซ่อนรายละเอียด ▴\
                      </div>\
                    </summary>\
                    <div className="px-4 pb-4 border-t border-slate-100 bg-white space-y-2 pt-3">\
                      {rec.items && rec.items.map((item, i) => (\
                         <div key={item.wordId} className="flex justify-between items-center p-2 rounded-lg bg-slate-50/50 text-sm">\
                            <div className="font-medium text-slate-800 w-1/3 truncate">{item.targetWord}</div>\
                            <div className="w-1/3 flex items-center justify-center">\
                               <span className={`px-2 py-0.5 rounded text-xs ${item.isWordCorrect ? '"'"'bg-green-100 text-green-700'"'"' : '"'"'bg-red-100 text-red-700'"'"'}`}>\
                                  ศัพท์ {item.isWordCorrect ? '"'"'✔️'"'"' : '"'"'❌'"'"'}\
                               </span>\
                            </div>\
                            <div className="w-1/3 flex items-center justify-end">\
                               <span className={`px-2 py-0.5 rounded text-xs ${item.isTranslationCorrect ? '"'"'bg-blue-100 text-blue-700'"'"' : '"'"'bg-red-100 text-red-700'"'"'}`}>\
                                  แปล {item.isTranslationCorrect ? '"'"'✔️'"'"' : '"'"'❌'"'"'}\
                               </span>\
                            </div>\
                         </div>\
                      ))}\
                    </div>\
                  </details>\
                ))\
              )}\
            </div>\
          </div>\
        </div>\
      )}\
    </div>' src/components/VocabExamArea.tsx
