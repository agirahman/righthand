const fs = require('fs');
let s = fs.readFileSync('package.json', 'utf8');
const start = s.indexOf('"test":');
const end = s.indexOf('"keywords":');
const prefix = s.slice(0, start);
const suffix = s.slice(end);
const newTest = '"test": "node test/validate-profiles.cjs && node test/validate-skills.cjs && node test/validate-artifacts.cjs && node test/validate-board.cjs && node test/validate-persona-config.cjs && node test/validate-skill-sync.cjs && node test/validate-launch.cjs && node test/validate-readonly.cjs",\n  ';
s = prefix + newTest + suffix;
fs.writeFileSync('package.json', s);