import fs from 'fs';
let content = fs.readFileSync('src/components/games/MatchMasterGame.tsx', 'utf8');
const match = content.match(/  return \(\s*<div/g);
if (match && match.length > 1) {
  // We have duplicate return blocks. Find the first 'return (' and delete everything from there until the second 'return ('
  const firstIdx = content.indexOf('  return (');
  const secondIdx = content.indexOf('  return (', firstIdx + 1);
  if (secondIdx > -1) {
    // Wait, let's also preserve `const timeProgressPercentage = ...` which is right before `return (`.
    // Actually, I can just replace from `const timeProgressPercentage` to the end of the file with the correct render block.
  }
}

// Let's just do an exact string replace.
let correctRender = `  const timeProgressPercentage = totalTime > 0 ? (timeLeft / totalTime) * 100 : 0;
  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 bg-slate-900 text-white rounded-3xl shadow-2xl relative overflow-hidden border border-slate-800">`;

// I'll just find the first `const timeProgressPercentage` and delete everything after it, then append the block.
const firstIdx = content.indexOf('  const timeProgressPercentage');
if (firstIdx !== -1) {
  content = content.substring(0, firstIdx);
}
fs.writeFileSync('src/components/games/MatchMasterGame.tsx', content);
