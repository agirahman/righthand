const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const ticketsDir = path.join(root, '.righthand', 'tickets');

const validEvents = new Set(['claim', 'progress', 'blocked', 'done', 'verdict', 'abandoned']);

// Collect board files
const boardFiles = [];
if (fs.existsSync(ticketsDir)) {
  for (const ticket of fs.readdirSync(ticketsDir)) {
    const bp = path.join(ticketsDir, ticket, 'board.jsonl');
    if (fs.existsSync(bp) && fs.statSync(bp).isFile()) {
      boardFiles.push(bp);
    }
  }
}

if (boardFiles.length === 0) {
  console.log('No board files found. Nothing to validate.');
  process.exit(0);
}

console.log(`Checking ${boardFiles.length} board file(s)...`);

let failed = 0;
for (const bp of boardFiles) {
  const rel = path.relative(root, bp);
  const raw = fs.readFileSync(bp, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let obj;
    try {
      obj = JSON.parse(lines[i]);
    } catch (e) {
      console.error(`FAIL: [${rel}:${lineNo}] invalid JSON: ${e.message}`);
      failed++;
      continue;
    }
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      console.error(`FAIL: [${rel}:${lineNo}] line is not a JSON object`);
      failed++;
      continue;
    }
    for (const key of ['v', 'ts', 'ticket', 'persona', 'event']) {
      if (!(key in obj)) {
        console.error(`FAIL: [${rel}:${lineNo}] missing required field: ${key}`);
        failed++;
      }
    }
    // type checks
    if ('v' in obj && typeof obj.v !== 'number') {
      console.error(`FAIL: [${rel}:${lineNo}] v must be a number`);
      failed++;
    }
    if ('ticket' in obj && (typeof obj.ticket !== 'string' || obj.ticket.trim() === '')) {
      console.error(`FAIL: [${rel}:${lineNo}] ticket must be a non-empty string`);
      failed++;
    }
    if ('persona' in obj && (typeof obj.persona !== 'string' || obj.persona.trim() === '')) {
      console.error(`FAIL: [${rel}:${lineNo}] persona must be a non-empty string`);
      failed++;
    }
    // ts ISO 8601
    if (obj.ts !== undefined) {
      const d = new Date(obj.ts);
      if (Number.isNaN(d.getTime())) {
        console.error(`FAIL: [${rel}:${lineNo}] ts is not a valid ISO 8601 date: ${obj.ts}`);
        failed++;
      }
    }
    // event
    if (obj.event !== undefined && !validEvents.has(obj.event)) {
      console.error(`FAIL: [${rel}:${lineNo}] invalid event: ${obj.event}`);
      failed++;
    }
    // verdict events carry verdict field pass/fail
    if (obj.event === 'verdict') {
      if (!('verdict' in obj)) {
        console.error(`FAIL: [${rel}:${lineNo}] verdict event missing 'verdict' field`);
        failed++;
      } else if (obj.verdict !== 'pass' && obj.verdict !== 'fail') {
        console.error(`FAIL: [${rel}:${lineNo}] invalid verdict value: ${obj.verdict}`);
        failed++;
      }
    }
    // done events must carry a non-empty report string pointing at an existing file
    if (obj.event === 'done') {
      if (typeof obj.report !== 'string' || obj.report.trim() === '') {
        console.error(`FAIL: [${rel}:${lineNo}] done event must carry a non-empty report string`);
        failed++;
      } else {
        const reportPath = path.join(root, obj.report);
        if (!fs.existsSync(reportPath) || !fs.statSync(reportPath).isFile()) {
          console.error(`FAIL: [${rel}:${lineNo}] report file does not exist: ${obj.report}`);
          failed++;
        }
      }
    }
  }
  console.log(`OK: ${rel} (${lines.length} events)`);
}

if (failed > 0) {
  console.error(`\nBoard validation FAILED with ${failed} errors.`);
  process.exit(1);
}

console.log(`\nALL board files VALID!`);