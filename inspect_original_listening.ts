import fs from 'fs';

const data = JSON.parse(fs.readFileSync('./original_listening_lessons.json', 'utf-8'));

console.log('--- ORIGINAL LISTENING LESSONS FILE ANALYSIS ---');
console.log('Keys in original file:', Object.keys(data));

if (data.intermediate) {
  console.log('\nIntermediate label:', data.intermediate.label);
  console.log('Intermediate articles count:', data.intermediate.articles?.length);
  if (data.intermediate.articles) {
    console.log('First 5 Intermediate titles:');
    data.intermediate.articles.slice(0, 5).forEach((a: any, i: number) => {
      console.log(` [${i+1}] ${a.title} | Audio: ${a.audioUrl ? 'YES' : 'NO'}`);
    });
    console.log('\nLast 5 Intermediate titles:');
    data.intermediate.articles.slice(-5).forEach((a: any, i: number) => {
      console.log(` [${data.intermediate.articles.length - 4 + i}] ${a.title} | Audio: ${a.audioUrl ? 'YES' : 'NO'}`);
    });
  }
}

if (data.advanced) {
  console.log('\nAdvanced label:', data.advanced.label);
  console.log('Advanced articles count:', data.advanced.articles?.length);
  if (data.advanced.articles) {
    console.log('First 5 Advanced titles:');
    data.advanced.articles.slice(0, 5).forEach((a: any, i: number) => {
      console.log(` [${i+1}] ${a.title} | Audio: ${a.audioUrl ? 'YES' : 'NO'}`);
    });
  }
}
