import fs from 'fs';
import { hsk7to9Data } from './src/data/hsk7to9Data';

const hasEng = hsk7to9Data.filter(x => /[a-zA-Z]/.test(x.th));
console.log(hasEng.slice(0, 5).map(x => x.th));
