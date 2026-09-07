import fs from 'fs';
const buf = fs.readFileSync('src/data/hsk7to9Data.ts');
let rawString = buf.toString('utf-8');
const exportPrefix = 'export const hsk7to9Data = ';
if (rawString.startsWith(exportPrefix)) {
  rawString = rawString.slice(exportPrefix.length);
}
let validItems = [];
try {
    const regex = /\{\s*"word":\s*"[^"]+",[^}]+\}/g;
    let match;
    while ((match = regex.exec(rawString)) !== null) {
        try {
            const item = JSON.parse(match[0]);
            validItems.push(item);
        } catch (e) {
            // Reached corrupted part
        }
    }
} catch (e) {}
console.log('Successfully recovered items:', validItems.length);
