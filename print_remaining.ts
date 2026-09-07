import { hsk7to9Data } from './src/data/hsk7to9Data';
const untranslated = hsk7to9Data.filter(w => w.th === w.en || /^[a-zA-Z\s,;\.\-()'"\d]+$/.test(w.th));
console.log(JSON.stringify(untranslated, null, 2));
