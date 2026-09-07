const fs = require('fs');
const readline = require('readline');
const path = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\d1f70f90-a05d-4830-96ad-402166ce0e0f\\.system_generated\\logs\\transcript_full.jsonl';
const outPath = './ielts_transcript_dump.md';

async function processLineByLine() {
  const fileStream = fs.createReadStream(path);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let output = '';
  for await (const line of rl) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'USER_INPUT' || parsed.type === 'PLANNER_RESPONSE' || parsed.type === 'MODEL_RESPONSE') {
        const content = parsed.content || '';
        if (content.toLowerCase().includes('ielts') || content.toLowerCase().includes('reading') || content.toLowerCase().includes('listening') || content.toLowerCase().includes('ชุดที่')) {
          output += '\n\n### Step ' + parsed.step_index + ' (' + parsed.type + ')\n' + content + '\n';
        }
      }
    } catch(e) {}
  }
  fs.writeFileSync(outPath, output, 'utf-8');
  console.log('Dumped transcript to', outPath);
}
processLineByLine();
