sed -i 's/setAnswers(finalAnswers);/setAnswers(finalAnswers);\n        evaluatedAnswers = finalAnswers;/g' src/components/VocabExamArea.tsx
sed -i 's/setAnswers(fallbackAnswers);/setAnswers(fallbackAnswers);\n      evaluatedAnswers = fallbackAnswers;/g' src/components/VocabExamArea.tsx
sed -i 's/const preliminaryAnswers: Record<string, Answer> = {};/const preliminaryAnswers: Record<string, Answer> = {};\n    let evaluatedAnswers: Record<string, Answer> = {};/g' src/components/VocabExamArea.tsx
