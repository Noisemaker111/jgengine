import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';

const source = readFileSync(new URL('./session-start.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
function runHook(sourceOnly) {
  const commands = [], launches = [], messages = [];
  const stopped = {};
  const sandbox = {
    join,
    execFileSync(_command, args) {
      commands.push(args);
      const key = args.join(' ');
      const answer = key.includes('--absolute-git-dir') ? '/owned/.git'
        : key.includes('--is-shallow-repository') ? 'false'
        : key.includes('--abbrev-ref') ? 'feature'
        : key.includes('symbolic-ref') ? 'refs/remotes/origin/beta'
        : key.includes('status') ? ' M owned-source.ts'
        : key.includes('remote get-url') ? 'https://github.com/Noisemaker111/jgengine.git'
        : key.includes('rev-list') ? '0' : '';
      return Buffer.from(answer);
    },
    existsSync: () => false,
    openSync: () => 7,
    spawn(command, args, options) {
      launches.push({ command, args, options });
      return { pid: 42, unref() {} };
    },
    process: { env: sourceOnly ? { JG_PARENT_SOURCE_ONLY: '1' } : {}, cwd: () => '/owned',
      stdout: { write: (message) => messages.push(JSON.parse(message)) }, exit: () => { throw stopped; } },
  };
  try { vm.runInNewContext(source, sandbox); } catch (error) { if (error !== stopped) throw error; }
  return { commands, launches, context: messages[0].hookSpecificOutput.additionalContext };
}
test('source-only cold session preserves Git/context checks without spawning bootstrap', () => {
  const result = runHook(true);
  assert.equal(result.launches.length, 0);
  assert.ok(result.commands.some((args) => args[0] === 'fetch'));
  assert.ok(result.commands.some((args) => args[0] === 'status'));
  assert.match(result.context, /Parent-prepared source-only session/);
  assert.match(result.context, /MERGE POLICY/);
});
test('ordinary cold bootstrap starts hidden and retains readiness guidance', () => {
  const result = runHook(false);
  assert.equal(result.launches.length, 1);
  assert.equal(result.launches[0].options.windowsHide, true);
  assert.equal(result.launches[0].options.detached, true);
  assert.match(result.context, /auto-started/);
});
