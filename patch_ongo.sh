sed -i "s/onGo={() => onNavigate('vocab')}/onGo={() => onNavigate('lessons')}/" src/components/LearningPlanModal.tsx
sed -i "s/onGo={() => onNavigate('write')}/onGo={() => onNavigate('vocab')}/" src/components/LearningPlanModal.tsx
sed -i "s/onGo={() => onNavigate('games')}/onGo={() => onNavigate('vocab_games')}/" src/components/LearningPlanModal.tsx
sed -i "s/onGo={() => onNavigate('exam')}/onGo={() => onNavigate('vocab_exam')}/" src/components/LearningPlanModal.tsx
sed -i "s/onGo={() => onNavigate('lessons')}/onGo={() => onNavigate('exercises')}/" src/components/LearningPlanModal.tsx
sed -i "s/onClick={() => onNavigate('mock')}/onClick={() => onNavigate('mocktests')}/" src/components/LearningPlanModal.tsx
