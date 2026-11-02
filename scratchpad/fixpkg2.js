const fs = require('fs');
const mainRaw = fs.readFileSync('scratchpad/mainpkg.json', 'utf8').replace(/^\uFEFF/, '');
const main = JSON.parse(mainRaw);
const oursRaw = fs.readFileSync('package.json', 'utf8').replace(/^\uFEFF/, '');
// parse ours if possible else use main base
let ours;
try { ours = JSON.parse(oursRaw); } catch (e) { ours = JSON.parse(JSON.stringify(main)); }
ours.scripts = ours.scripts || {};
ours.scripts.pretest = 'tsc';
ours.scripts.test = main.scripts.test + ' && node test/validate-readonly.cjs';
// ensure build etc
ours.scripts.build = ours.scripts.build || 'tsc';
ours.scripts.typecheck = ours.scripts.typecheck || 'tsc --noEmit';
fs.writeFileSync('package.json', JSON.stringify(ours, null, 2) + '\n');