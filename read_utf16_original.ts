import fs from 'fs';

let content = fs.readFileSync('./original_listening_lessons.json', 'utf-8');
if (content.charCodeAt(0) === 0xFEFF || content.charCodeAt(0) === 65533) {
  content = fs.readFileSync('./original_listening_lessons.json', 'utf-16le');
}

const data = JSON.parse(content.trim());

console.log('--- ORIGINAL LISTENING LESSONS FILE ANALYSIS ---');
console.log('Keys in original file:', Object.keys(data));

if (data.intermediate) {
  console.log('\nIntermediate label:', data.intermediate.label);
  console.log('Intermediate articles count:', data.intermediate.articles?.length);
  if (data.intermediate.articles) {
    console.log('\nAll Intermediate titles:');
    data.intermediate.articles.forEach((a: any, i: number) => {
      console.log(` [${i+1}] ${a.title} | Audio: ${a.audioUrl || 'NO AUDIO'}`);
    });
  }
}

if (data.advanced) {
  console.log('\nAdvanced label:', data.advanced.label);
  console.log('Advanced articles count:', data.advanced.articles?.length);
  if (data.advanced.articles) {
    console.log('\nAll Advanced titles:');
    data.advanced.articles.forEach((a: any, i: number) => {
      console.log(` [${i+1}] ${a.title} | Audio: ${a.audioUrl || 'NO AUDIO'}`);
    });
  }
}

fs.writeFileSync('./clean_original_listening_lessons.json', JSON.stringify(data, null, 2), 'utf-8');
