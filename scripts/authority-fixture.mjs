import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true }).trim()
const home = resolve(git(process.cwd(), 'rev-parse', '--git-common-dir'), '..')
const state = join(home, '.scratch', 'authority-fixture')
mkdirSync(state, { recursive: true })
const sourceFile = join(state, 'source.json')
const source = process.env.JG_FIXTURE_SOURCE ?? (existsSync(sourceFile) ? JSON.parse(readFileSync(sourceFile, 'utf8')).source : process.cwd())
const head = git(source, 'rev-parse', 'HEAD')
const expected = process.env.JG_FIXTURE_REVISION
if (expected && head !== expected) throw Error(`Fixture source is ${head}; prepare its owned checkout at ${expected} before reload`)
const dirty = git(source, 'status', '--porcelain', '--untracked-files=normal') !== ''
if (dirty && !process.argv.includes('--allow-dirty')) throw Error('Fixture builds require a reviewed clean checkout; --allow-dirty labels native development builds explicitly')
const revision = head + (dirty ? '-dirty' : '')
const artifact = join(state, 'artifacts', revision)
mkdirSync(artifact, { recursive: true })
const logPath = join(state, 'build.log')
const log = openSync(logPath, 'a')
async function run(args, cwd, env = process.env) {
  const child = spawn('bun', args, { cwd, env, windowsHide: true, stdio: ['ignore', log, log] })
  await new Promise((resolveDone, reject) => {
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolveDone() : reject(Error(`bun ${args.join(' ')} exited ${code}; see ${logPath}`)))
  })
}
try {
  await run(['--cwd=packages/core', 'run', 'build'], source)
  await run(['build', 'scripts/authority-fixture-server.ts', '--target=bun', '--outfile=' + join(artifact, 'realm.mjs'), '--define', 'JG_COMPILED_REVISION=' + JSON.stringify(revision)], source)
  await run(['--cwd=apps/dev', 'run', 'build', '--outDir', join(artifact, 'frontend')], source, { ...process.env, VITE_JG_COMPILED_REVISION: revision })
  writeFileSync(join(artifact, 'frontend', '__version'), JSON.stringify({ revision, component: 'frontend', fixture: 'hosted-authority', port: 4624 }))
} finally { closeSync(log) }
let old
try { old = await fetch('http://127.0.0.1:4625/__version', { signal: AbortSignal.timeout(3000) }).then(response => response.json()) }
catch (error) { if (error?.cause?.code !== 'ECONNREFUSED') throw error }
if (old) {
  if (old.fixture !== 'hosted-authority') throw Error('Port 4625 belongs to another service; refusing to stop it')
  const stopped = await fetch('http://127.0.0.1:4625/__fixture/stop', { method: 'POST', signal: AbortSignal.timeout(15000) })
  if (!stopped.ok) throw Error('Fixture shutdown failed: ' + await stopped.text())
}
const runtimeLog = openSync(join(state, 'runtime.log'), 'a')
const child = spawn('bun', [join(artifact, 'realm.mjs')], {
  cwd: source, detached: true, windowsHide: true, stdio: ['ignore', runtimeLog, runtimeLog, 'ipc'],
  env: { ...process.env, JG_FIXTURE_ARTIFACT: join(artifact, 'frontend'), JG_FIXTURE_DATA: join(state, 'data') },
})
try {
  await new Promise((resolveReady, reject) => {
    const deadline = setTimeout(() => reject(Error('Fixture readiness event missing after 30s; see runtime.log')), 30000)
    const fail = error => { clearTimeout(deadline); reject(error) }
    child.once('error', fail)
    child.once('exit', code => fail(Error(`Fixture exited ${code} before readiness`)))
    child.once('message', message => {
      clearTimeout(deadline)
      if (message?.ready && message.revision === revision) resolveReady()
      else reject(Error('Unexpected fixture readiness event'))
    })
  })
  writeFileSync(sourceFile, JSON.stringify({ source }))
  writeFileSync(join(state, 'running.json'), JSON.stringify({ pid: child.pid, revision, artifact, frontend: 4624, realm: 4625 }))
  console.log(`Relay Courtyard ready: frontend http://127.0.0.1:4624/?game=hosted-authority&actor=alice; realm 4625; compiled ${revision}`)
  child.disconnect()
  child.unref()
} catch (error) { child.kill(); throw error }
finally { closeSync(runtimeLog) }
