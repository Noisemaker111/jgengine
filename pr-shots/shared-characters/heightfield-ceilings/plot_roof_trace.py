from pathlib import Path
import csv
import hashlib
import json
import math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path('/workspace/JGengine')
DATA = ROOT / '.scratch/characters/consumer/heightfield-ceilings'
OUT = ROOT / '.scratch/characters/native/heightfield-ceilings'
variants = {}
records = []
for name, color in [('before', '#c44e52'), ('after', '#0072b2')]:
    path = DATA / f'roof-{name}.json'
    document = json.loads(path.read_text())
    obj = document['objects'][0]
    route = obj['normalSpawnWalk']
    frames = route['jumpFrames']
    base = route['brakedAt']
    ceiling = obj['selected']['ceiling']
    assert [f['frame'] for f in frames] == list(range(24))
    assert document['playerHeight'] == 1.8
    assert document['appearanceClaim'] is False
    rows = [{'time_s': 0.0, 'head_y_m': base[1] + document['playerHeight'], 'xz_displacement_m': 0.0, 'step_xz_shift_m': 0.0}]
    prior = base
    for frame in frames:
        x, y, z = frame['position']
        head_y = y + document['playerHeight']
        displacement = math.hypot(x - base[0], z - base[2])
        measured_shift = math.hypot(x - prior[0], z - prior[2])
        assert math.isclose(head_y - ceiling, frame['headPenetration'], abs_tol=1e-12)
        assert math.isclose(measured_shift, frame['horizontalShift'], abs_tol=1e-12)
        rows.append({'time_s': (frame['frame'] + 1) / 60, 'head_y_m': head_y, 'xz_displacement_m': displacement, 'step_xz_shift_m': frame['horizontalShift']})
        prior = frame['position']
    variants[name] = {'document': document, 'object': obj, 'route': route, 'rows': rows, 'color': color}
    manifest_path = DATA / ('baseline-package-manifest.json' if name == 'before' else 'candidate-package-manifest.json')
    manifest = json.loads(manifest_path.read_text())
    assert manifest['commit'] == document['cohort']
    records.append({'variant': name, 'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'cohort': document['cohort'], 'gameSource': document['gamesSource'], 'packageManifest': {'path': str(manifest_path), 'sha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(), 'tree': manifest['tree'], 'packages': [{'name': p['name'], 'version': p['version'], 'sha256': p['sha256']} for p in manifest['packages']]}})

before, after = variants['before'], variants['after']
for key in ['marker', 'model', 'glbSha256', 'placed', 'placement', 'selected']:
    assert before['object'][key] == after['object'][key], key
for key in ['authoredSpawn', 'walkedTo', 'routeFrames', 'brakedAt', 'beforeJump']:
    assert before['route'][key] == after['route'][key], key
assert before['document']['gamesSource'] == after['document']['gamesSource']
ceiling = before['object']['selected']['ceiling']
obstacle = before['object']['obstacle']
roof_center = [obstacle['position'][i] + obstacle['offset'][i] for i in range(3)]
def inside_roof_xz(position):
    return all(abs(position[i] - roof_center[i]) <= obstacle['halfExtents'][i] for i in [0, 2])
first_inside = next(f for f in before['route']['jumpFrames'] if f['headPenetration'] > 1e-9 and inside_roof_xz(f['position']))
assert first_inside['frame'] == 2
assert math.isclose(first_inside['headPenetration'], .01488559087117558, abs_tol=1e-12)

plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 11, 'axes.spines.top': False, 'axes.spines.right': False, 'svg.fonttype': 'none'})
fig, axes = plt.subplots(2, 1, figsize=(11.5, 7.5), sharex=True, gridspec_kw={'height_ratios': [1.5, 1]})
fig.subplots_adjust(top=.79, bottom=.19, left=.10, right=.96, hspace=.16)
fig.suptitle('Lantern Reach: jump beneath the authored workshop roof', fontsize=17, fontweight='bold', x=.10, ha='left', y=.97)
fig.text(.10, .925, 'Numerical installed-package simulation · original spawn → walk → brake → jump', fontsize=12)
fig.text(.10, .887, 'Same authored scene, game source, model bytes and route; 24 jump steps at 1/60 s.', fontsize=10, color='#555555')
for name, variant in variants.items():
    rows = variant['rows']
    times = [r['time_s'] for r in rows]
    label = f"{name.capitalize()} · {variant['document']['cohort'][:8]}"
    axes[0].plot(times, [r['head_y_m'] for r in rows], color=variant['color'], label=label, lw=2.5)
    axes[1].step(times, [r['xz_displacement_m'] for r in rows], where='post', color=variant['color'], label=label, lw=2.5)
axes[0].axhline(ceiling, color='#444444', ls='--', lw=1.4, label=f'Roof bounds underside · {ceiling:.3f} m')
axes[0].set_ylabel('Physical head world Y (m)')
axes[0].set_ylim(8.95, 10.32)
axes[0].legend(loc='upper left', bbox_to_anchor=(0, 1.18), ncol=3, frameon=False, fontsize=10)
peak = max(before['rows'], key=lambda row: row['head_y_m'])
axes[0].annotate(f"Before: {peak['head_y_m'] - ceiling:.3f} m above bound", xy=(peak['time_s'], peak['head_y_m']), xytext=(.195, 10.23), fontsize=10, color=before['color'], arrowprops={'arrowstyle': '-', 'color': before['color']})
axes[0].annotate('After: ascent stops at bound', xy=(.05, ceiling), xytext=(.105, 9.44), fontsize=10, color=after['color'], arrowprops={'arrowstyle': '-', 'color': after['color']})
axes[1].set_ylabel('XZ displacement from\nbraked position (m)')
axes[1].set_xlabel('Simulated time after jump input (s)')
axes[1].set_ylim(-.12, 2.1)
axes[1].set_xlim(0, .4)
axes[1].text(.15, 1.91, 'Before: 1.820 m sideways ejection', color=before['color'], fontsize=10)
axes[1].text(.15, .15, 'After: 0 m horizontal displacement', color=after['color'], fontsize=10)
for axis in axes:
    axis.grid(axis='y', alpha=.20)
fig.text(.10, .085, 'Physical height 1.8 m; visual character target height 2.6 m. Roof collision uses conservative outer bounds.', fontsize=10, color='#555555')
fig.text(.10, .047, 'NOT a native screenshot, appearance claim, controls-feel assessment or hardware performance measurement.', fontsize=10, color='#555555')
for extension in ['png', 'svg']:
    fig.savefig(OUT / f'roof-jump-trace.{extension}', dpi=160, facecolor='white')
plt.close(fig)

with (OUT / 'roof-jump-trace.csv').open('w', newline='') as handle:
    writer = csv.DictWriter(handle, fieldnames=['variant', 'time_s', 'head_y_m', 'xz_displacement_m', 'step_xz_shift_m'])
    writer.writeheader()
    for name, variant in variants.items():
        writer.writerows({'variant': name, **row} for row in variant['rows'])

sidecar = {
    'label': 'Numerical installed-package simulation; not native appearance or hardware performance evidence',
    'inputs': records,
    'marker': before['object']['marker'],
    'modelSha256': before['object']['glbSha256'],
    'roofBoundsUndersideWorldY': ceiling,
    'physicalHeight': 1.8,
    'visualTargetHeight': 2.6,
    'route': {'walkingSteps': before['route']['routeFrames'], 'walkingDt': 1/120, 'brakingSteps': 120, 'brakingDt': 1/120, 'jumpSteps': 24, 'jumpDt': 1/60, 'authoredSpawn': before['route']['authoredSpawn'], 'brakedAt': before['route']['brakedAt']},
    'derivations': {'time_s': '(frame + 1) / 60; initial point from the recorded braked position at t=0', 'head_y_m': 'recorded feet Y + recorded physical height', 'xz_displacement_m': 'Euclidean XZ distance from recorded braked position', 'step_xz_shift_m': 'recorded horizontalShift, independently checked against consecutive XZ coordinates'},
    'maximums': {name: {'maxHeadMinusBoundReferencePlane_m': max(r['head_y_m'] - ceiling for r in v['rows']), 'xzDisplacement_m': max(r['xz_displacement_m'] for r in v['rows']), 'stepXzShift_m': max(r['step_xz_shift_m'] for r in v['rows'])} for name, v in variants.items()},
    'firstInsideRoofBoundsPenetrationBefore': {'frame': first_inside['frame'], 'time_s': (first_inside['frame'] + 1) / 60, 'position': first_inside['position'], 'signedHeadMinusBound_m': first_inside['headPenetration'], 'horizontalShift_m': first_inside['horizontalShift'], 'insideXZBounds': True},
    'headReferenceMeaning': 'The maximum 0.817107813 m is head Y minus the roof underside reference plane after sideways ejection outside the roof XZ bounds. It is not maximum actual 3D roof penetration. The first recorded penetration while still inside the conservative roof bounds is 0.014885591 m at frame 2, before ejection at frame 3.',
    'limitations': ['Conservative roof outer bounds do not represent exact interior triangle clearance.', 'Head minus roof reference plane does not establish 3D overlap after leaving the roof footprint.', 'Physical 1.8 m clearance does not prove clearance of the 2.6 m visual model.', 'Image decoding was skipped by the numerical fixture.', 'No native host or daemon was launched for this figure.', 'No registry release or published game adoption occurred.'],
    'artifacts': {name: hashlib.sha256((OUT / name).read_bytes()).hexdigest() for name in ['plot_roof_trace.py', 'roof-jump-trace.csv', 'roof-jump-trace.png', 'roof-jump-trace.svg']}
}
(OUT / 'roof-jump-trace.json').write_text(json.dumps(sidecar, indent=2) + '\n')
print(json.dumps({'png': str(OUT / 'roof-jump-trace.png'), 'sidecar': str(OUT / 'roof-jump-trace.json'), 'maximums': sidecar['maximums']}))
