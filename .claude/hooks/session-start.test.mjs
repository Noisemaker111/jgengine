// node --test .claude/hooks/session-start.test.mjs (test-shard skips `.claude/`, so `bun run test` does not run it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';

const source = readFileSync(new URL('./session-start.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');

/** Run the hook against a fake git: `rulesMoved` makes beta's AGENTS.md differ from the lane's fork point. */
function runHook({ sourceOnly = false, rulesMoved = false, warm = false, startFails = false } = {}) {
  const commands = [], launches = [], messages = [];
  const stopped = {};
  const sandbox = {
    join,
    execFileSync(command, args, options) {
      if (command === 'bun') {
        launches.push({ command, args, options });
        if (startFails) throw new Error('exit 1');
        return Buffer.from('task-7\n');
      }
      commands.push(args);
      const key = args.join(' ');
      if (key.startsWith('diff --quiet') && rulesMoved) throw new Error('exit 1');
      const answer = key.includes('--abbrev-ref') ? 'feature'
        : key.startsWith('merge-base') ? 'abc123'
        : key.includes('rev-list') ? '0' : '';
      return Buffer.from(answer);
    },
    existsSync: () => warm,
    process: { env: sourceOnly ? { JG_PARENT_SOURCE_ONLY: '1' } : {}, cwd: () => '/owned',
      stdout: { write: (message) => messages.push(JSON.parse(message)) }, exit: () => { throw stopped; } },
  };
  try { vm.runInNewContext(source, sandbox); } catch (error) { if (error !== stopped) throw error; }
  return { commands, launches, context: messages[0]?.hookSpecificOutput.additionalContext ?? '' };
}

test('a cold checkout starts the bootstrap as a background task outside the hook, and names it', () => {
  const result = runHook();
  assert.equal(result.launches.length, 1);
  assert.equal(result.launches[0].args.join(' '), 'scripts/bg-run.ts start bun scripts/agent-bootstrap.ts');
  assert.equal(result.launches[0].options.windowsHide, true);
  assert.match(result.context, /was started in the background as task task-7/);
});

test('a bootstrap that could not start says degraded', () => {
  assert.match(runHook({ startFails: true }).context, /^degraded: the bootstrap could not be started/);
});

test('a source-only session never starts the bootstrap', () => {
  assert.equal(runHook({ sourceOnly: true }).launches.length, 0);
});

test('a lane whose AGENTS.md changed on beta since it branched is told to read beta\'s rules', () => {
  const result = runHook({ rulesMoved: true, warm: true });
  assert.match(result.context, /AGENTS\.md changed on beta since "feature" branched/);
  assert.match(result.context, /git diff HEAD\.\.\.origin\/beta -- AGENTS\.md/);
  assert.ok(result.commands.some((args) => args.join(' ') === 'diff --quiet abc123 origin/beta -- AGENTS.md games/AGENTS.md'));
});

test('a warm lane with beta\'s current rules says nothing', () => {
  assert.equal(runHook({ warm: true }).context, '');
});
