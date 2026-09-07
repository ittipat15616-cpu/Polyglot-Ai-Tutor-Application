sed -i 's/weeklyMissionCompleted: false,/currentWeek: plan.currentWeek < 4 ? plan.currentWeek + 1 : plan.currentWeek,\n      weeklyMissionCompleted: false,/' src/components/LearningPlanModal.tsx
