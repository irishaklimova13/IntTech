import { build } from 'esbuild';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const project = fileURLToPath(new URL('../', import.meta.url));
const source = join(project, 'src/game');
const entries = (await readdir(source)).filter(name => name.endsWith('.test.ts')).map(name => join(source, name));
const temporary = await mkdtemp(join(tmpdir(), 'inttech-tests-'));
try {
  await build({ entryPoints: entries, bundle: true, platform: 'node', format: 'esm', outdir: temporary, outExtension: { '.js': '.mjs' } });
  const tests = (await readdir(temporary)).filter(name => name.endsWith('.mjs')).map(name => join(temporary, name));
  const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  if (dirname(resolve(temporary)) === resolve(tmpdir())) await rm(temporary, { recursive: true, force: true });
}
