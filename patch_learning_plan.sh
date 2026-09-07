# 1. Update submitQuestionnaire to include new fields
sed -i 's/overallProgressPercent: 0,/targetLevel: qForm.level,\n      vocabPerDay: parseInt(qForm.timeframe) <= 3 ? 30 : 15,\n      lessonsPerDay: parseInt(qForm.timeframe) <= 3 ? 2 : 1,\n      currentVocabIndex: 1,\n      currentLessonIndex: 1,\n      overallProgressPercent: 0,/' src/components/LearningPlanModal.tsx

# 2. Fix progress viewer calculations
