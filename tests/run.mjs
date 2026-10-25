// Test runner: node tests/run.mjs [filter]. Zero dependencies.
// Runs every tests/*.test.mjs (export const tests = { name: fn }) and the Python self-tests.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || '';
let pass = 0, fail = 0, skip = 0;

for (const file of readdirSync(here).filter(f => f.endsWith('.test.mjs')).sort()) {
  const mod = await import(pathToFileURL(path.join(here, file)).href);
  for (const [name, fn] of Object.entries(mod.tests || {})) {
    const label = `${file.replace('.test.mjs', '')} › ${name}`;
    if (filter && !label.includes(filter)) continue;
    try {
      const r = await fn();
      if (r === 'skip') {
        skip++;
        console.log(`  - ${label} (skipped)`);
      } else {
        pass++;
        console.log(`  ✓ ${label}`);
      }
    } catch (e) {
      fail++;
      console.log(`  ✗ ${label}\n    ${String(e.stack || e).split('\n').slice(0, 6).join('\n    ')}`);
    }
  }
}

if (!filter || 'python'.includes(filter) || filter.startsWith('py')) {
  const py = process.env.STUDIO_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const r = spawnSync(py, ['-X', 'utf8', path.join(here, '..', 'tools', 'py', 'selftest.py')], { stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  if (r.error) {
    skip++;
    console.log(`  - python self-tests (skipped: ${r.error.message})`);
  } else if (r.status === 0) pass++;
  else fail++;
}

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
