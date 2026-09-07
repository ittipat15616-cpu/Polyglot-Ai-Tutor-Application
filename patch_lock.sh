sed -i '/<h4 className="font-bold text-gray-800">จำลองสอบ {plan.lang === '"'"'EN'"'"' ? '"'"'IELTS'"'"' : '"'"'HSK'"'"'} (Mock Test)<\/h4>/i\
                {plan.currentDay < plan.currentWeek * 7 && (\
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">\
                    <div className="bg-white px-4 py-2 rounded-xl shadow-sm text-sm font-bold text-gray-500 flex items-center gap-2">\
                      <Lock size={16} /> ต้องทำภารกิจรายวันถึงวันที่ {plan.currentWeek * 7} ก่อน\
                    </div>\
                  </div>\
                )}' src/components/LearningPlanModal.tsx
