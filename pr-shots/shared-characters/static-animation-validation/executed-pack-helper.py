import argparse, datetime, fcntl, hashlib, json, os, pathlib, re, shutil, subprocess, tarfile, time, uuid

ORDER = ['core','rapier','ws','sql','navbake','react','convex','node','shell','editor','assets','github','jgengine']
ROOT = pathlib.Path(__file__).resolve().parents[2]
sha = lambda data: hashlib.sha256(data).hexdigest()

def git(*args):
    return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()

def save(path, value):
    path.write_text(json.dumps(value,indent=2)+'\n')

def identity(expected):
    commit = git('rev-parse','HEAD')
    if commit != expected: raise RuntimeError(f'expected frozen HEAD {expected}, found {commit}')
    if git('status','--porcelain','--untracked-files=all'): raise RuntimeError('clean source required')
    return {'commit':commit,'tree':git('rev-parse','HEAD^{tree}')}

def source_files():
    rows = []
    for raw in subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).split(b'\0'):
        if not raw: continue
        rel=os.fsdecode(raw); p=ROOT/rel
        data=os.fsencode(os.readlink(p)) if p.is_symlink() else p.read_bytes()
        rows.append({'path':rel,'sha256':sha(data),'symlink':p.is_symlink()})
    return rows

def safe_dist(name):
    pkg=ROOT/'packages'/name; p=pkg/'dist'
    if pkg.is_symlink() or pkg.resolve()!=pkg: raise RuntimeError(f'redirected package: {pkg}')
    if p.is_symlink() or (p.exists() and not p.is_dir()): raise RuntimeError(f'unsafe dist: {p}')
    if git('ls-files','--',str(p.relative_to(ROOT))): raise RuntimeError(f'tracked dist: {p}')
    ignored=subprocess.run(['git','check-ignore','--quiet','--',str((p/'__pack_probe__').relative_to(ROOT))],cwd=ROOT).returncode==0
    if not ignored: raise RuntimeError(f'non-ignored dist: {p}')
    return p

def files(directory):
    rows=[]
    for p in sorted(directory.rglob('*')):
        if p.is_symlink(): raise RuntimeError(f'symlink in output: {p}')
        if p.is_file():
            data=p.read_bytes(); rows.append({'path':str(p.relative_to(directory)),'bytes':len(data),'sha256':sha(data)})
    return rows

def main():
    ap=argparse.ArgumentParser(description='Scratch clean ordered package build and normal npm pack with provenance')
    ap.add_argument('--expect-head',required=True)
    ap.add_argument('--cohort-name')
    args=ap.parse_args()
    if pathlib.Path.cwd().resolve()!=ROOT: raise RuntimeError(f'run from {ROOT}')
    if not re.fullmatch('[0-9a-f]{40}',args.expect_head): raise RuntimeError('exact full40-character commit required')
    if (ROOT/'packages').is_symlink(): raise RuntimeError('redirected packages root')
    if not (ROOT/'node_modules/.bin/tsgo').exists(): raise RuntimeError('bootstrap installed toolchain separately')
    with (ROOT/'.scratch/characters/clean-build-pack.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        initial=identity(args.expect_head); inputs=source_files()
        rootbuild=json.loads((ROOT/'package.json').read_text())['scripts']['build']
        if re.findall(r'packages/([a-z]+) build',rootbuild)!=ORDER: raise RuntimeError('root build order changed; review workflow')
        configs={p:json.loads((ROOT/'packages'/p/'package.json').read_text()) for p in ORDER}
        for p in ORDER:
            cfg=json.loads((ROOT/'packages'/p/'tsconfig.build.json').read_text())
            if cfg.get('compilerOptions',{}).get('outDir')!='dist' or not configs[p].get('scripts',{}).get('build'):
                raise RuntimeError(f'{p} build contract changed')
        outputs={p:safe_dist(p) for p in ORDER}
        stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        name=args.cohort_name or f'clean-{initial["commit"][:8]}-{stamp}-{uuid.uuid4().hex[:6]}'
        if not re.fullmatch('[A-Za-z0-9][A-Za-z0-9._-]*',name): raise RuntimeError('unsafe cohort name')
        out=ROOT/'.scratch/characters/packages'/name; out.mkdir(exist_ok=False)
        provenance={'status':'running',**initial,'base':git('merge-base','HEAD','origin/beta'),'startedUtc':stamp,
                    'workflowSha256':sha(pathlib.Path(__file__).read_bytes()),'rootBuildScript':rootbuild,
                    'packageBuildOrder':ORDER,'packageBuildScripts':{p:configs[p]['scripts']['build'] for p in ORDER},
                    'dependencyLockSha256':sha((ROOT/'bun.lock').read_bytes()),
                    'toolVersions':{t:subprocess.check_output([t,'--version'],cwd=ROOT,text=True).strip() for t in ['bun','npm']},
                    'stages':[],'removedDist':[],
                    'limitations':['Caller freezes checkout and prevents concurrent builds/branch switches; scratch lock serializes only this workflow.',
                                   'No install/gen/registry build/tests/source edits/release/publication. Owning verification remains separate.',
                                   'Uses root13-package order with AGENTS-compatible bun --cwd= syntax.',
                                   'SDK skills are explicitly staged from owning source before mapping validation; optional ignored package changelogs must match root.']}
        save(out/'source-files.json',inputs);save(out/'build-provenance.json',provenance)
        def stable():
            if identity(args.expect_head)!=initial: raise RuntimeError('source identity changed')
        def stage(label, argv, cwd=ROOT):
            stable();print(label,flush=True)
            so=out/f'{label}.stdout.log';se=out/f'{label}.stderr.log';start=time.monotonic()
            with so.open('wb') as stdout,se.open('wb') as stderr:
                result=subprocess.run(argv,cwd=cwd,stdout=stdout,stderr=stderr)
            provenance['stages'].append({'label':label,'argv':argv,'cwd':str(cwd),'exitCode':result.returncode,
                'elapsedSeconds':time.monotonic()-start,'stdout':so.name,'stdoutSha256':sha(so.read_bytes()),'stderr':se.name,'stderrSha256':sha(se.read_bytes())})
            save(out/'build-provenance.json',provenance)
            if result.returncode: raise RuntimeError(f'{label} exit{result.returncode}; inspect {so} and {se}')
            stable();return so
        try:
            stage('stage-skills',['bun','run','stage-skills'])
            stage('check-staged-skills',['bun','run','check-stage-skills'])
            for p in ORDER:
                changelog=ROOT/'packages'/p/'CHANGELOG.md'
                if changelog.exists() and changelog.read_bytes()!=(ROOT/'CHANGELOG.md').read_bytes():
                    raise RuntimeError(f'{p} packaged changelog stale; prepare separately')
            stable()
            for p,directory in outputs.items():
                safe_dist(p)
                if directory.exists(): shutil.rmtree(directory)
                provenance['removedDist'].append(str(directory.relative_to(ROOT)))
            save(out/'build-provenance.json',provenance)
            for p in ORDER:
                stage(f'build-{p}',['bun',f'--cwd=packages/{p}','run','build'])
                if not outputs[p].is_dir() or not any(outputs[p].iterdir()): raise RuntimeError(f'{p} build emitted no dist')
            compiled={p:files(outputs[p]) for p in ORDER};save(out/'compiled-files.json',compiled)
            if source_files()!=inputs: raise RuntimeError('tracked source bytes changed during build')
            manifest={'label':'unreleased clean-built character candidate; no registry publication or shipped game adoption',**initial,
                      'base':provenance['base'],'dirty':False,'packages':[],'buildProvenance':'build-provenance.json',
                      'compiledFileLedger':'compiled-files.json','packageFileLedger':'package-files.json','sourceFileLedger':'source-files.json'}
            packed={}
            for p in ORDER:
                so=stage(f'pack-{p}',['npm','pack','--json','--pack-destination',str(out)],ROOT/'packages'/p)
                result=json.loads(so.read_text())[-1];filename=result['filename']
                if pathlib.Path(filename).name!=filename: raise RuntimeError('unsafe npm output filename')
                target=out/filename;rows=[];dist={}
                with tarfile.open(target,'r:gz') as archive:
                    for member in archive.getmembers():
                        if member.isdir(): continue
                        if not member.isfile(): raise RuntimeError(f'unsupported tar entry {member.name}')
                        rel=pathlib.PurePosixPath(member.name).relative_to('package')
                        if '..' in rel.parts: raise RuntimeError(f'unsafe tar entry {member.name}')
                        data=archive.extractfile(member).read();row={'path':str(rel),'bytes':len(data),'sha256':sha(data)};rows.append(row)
                        disk=ROOT/'packages'/p/str(rel)
                        if disk.is_symlink() or disk.read_bytes()!=data: raise RuntimeError(f'tar/disk byte mismatch {p}:{rel}')
                        if rel.parts[0]=='dist':
                            key=str(rel.relative_to('dist'));dist[key]={**row,'path':key}
                if dist!={row['path']:row for row in compiled[p]}: raise RuntimeError(f'{p} tar dist differs from clean build')
                if files(outputs[p])!=compiled[p]: raise RuntimeError(f'{p} dist mutated during pack')
                packed[p]=rows;manifest['packages'].append({'name':result['name'],'version':result['version'],'path':str(target),'sha256':sha(target.read_bytes()),'files':len(rows)})
            stable()
            if source_files()!=inputs: raise RuntimeError('tracked source bytes changed during pack')
            save(out/'package-files.json',packed)
            provenance['status']='complete';provenance['completedUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
            provenance['ledgerHashes']={f:sha((out/f).read_bytes()) for f in ['source-files.json','compiled-files.json','package-files.json']}
            save(out/'build-provenance.json',provenance);manifest['buildProvenanceSha256']=sha((out/'build-provenance.json').read_bytes())
            save(out/'manifest.json',manifest);print(out/'manifest.json',flush=True)
        except BaseException as error:
            provenance['status']='failed';provenance['error']=str(error);save(out/'build-provenance.json',provenance);raise

if __name__=='__main__': main()
