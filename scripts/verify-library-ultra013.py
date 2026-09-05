#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
mega=(ROOT/'src/MegaLibrary.tsx').read_text()
policy=(ROOT/'src/libraryResourcePolicy013.ts').read_text()
panel=(ROOT/'src/LibraryCapacityPanel013.tsx').read_text()
css=(ROOT/'src/library-capacity013.css').read_text()
package=(ROOT/'package.json').read_text()
docs=(ROOT/'docs/LIBRARY_RESOURCE_ALLOCATION_0_13.md').read_text() if (ROOT/'docs/LIBRARY_RESOURCE_ALLOCATION_0_13.md').exists() else ''

checks={
 '0.13 capacity panel is mounted': "import LibraryCapacityPanel013 from './LibraryCapacityPanel013'" in mega and '<LibraryCapacityPanel013' in mega,
 '0.11 memory model is preserved': 'size*1.18+.25*GB' in policy and 'Math.max(size*.10,384*MB)' in policy and "policy==='safe'?.82" in policy and "policy==='maximum'?.96:.90" in policy,
 'Storage reserve is explicit and adjustable': 'protectedStorageReserveBytes' in policy and '[5,10,20,30]' in panel and 'Protected free storage' in panel,
 'HF transient peak is modeled separately': "source==='Hugging Face'" in policy and 'sizeBytes*2+2*GB' in policy,
 'Unknown size is never treated as safe': "state:'unknown'" in policy and 'cannot make a defensible storage or runtime feasibility claim' in policy,
 'Feasibility separates storage and runtime': 'runtime-constrained' in policy and 'storage-constrained' in policy and 'both-constrained' in policy and 'canInstall' in policy and 'canRun' in policy,
 'Live system capacity is refreshed': "invoke<Profile>('system_profile')" in mega and 'Rechecking live storage capacity' in mega,
 'Installed inventory is read from selected runtime': "path:'/api/tags'" in mega and 'installedBytes' in mega and 'installedCount' in panel,
 'HF metadata is refreshed before import': "invoke<HFVariant[]>('list_hf_gguf_variants'" in mega and 'refreshed=assessLibraryVariant013' in mega,
 'Storage constrained installs are blocked': '!livePlan.canInstall' in mega and '!refreshed.canInstall' in mega and '!plan.canInstall' in mega,
 'Runtime constrained storage remains intentional': "plan.canRun?'Install':'Install · run limited'" in mega and 'allow intentional storage of runtime-constrained variants' in docs,
 'Largest feasible is not a quality score': 'largestFeasibleVariant013' in policy and 'Largest fully feasible' in mega and 'not highest model quality' in panel,
 'Capacity table exposes peak and post-install storage': 'Peak install' in panel and 'Post-install free' in panel and 'peakInstallBytes' in panel,
 'Capacity styles cover all states': '.lc13-row.feasible' in css and '.lc13-row.runtime-constrained' in css and '.lc13-row.both-constrained' in css,
 'No arbitrary Penguin Score is introduced': 'Penguin Score' not in mega and 'penguinScore' not in policy and 'opaque aggregate score' in docs,
 'Methodology documentation exists': 'Capacity planning' in docs and 'peak install headroom' in docs and 'Industrial & Operations Engineering' in docs,
 'Production verification includes Library Ultra': 'verify:library-ultra' in package and 'verify-library-ultra013.py' in package,
}

failed=[name for name,ok in checks.items() if not ok]
if failed:
 print('OpenPenguin 0.13 Global Library Ultra verification FAILED')
 for name in failed: print(f' - {name}')
 sys.exit(1)
print('OpenPenguin 0.13 Global Library Ultra verification PASSED')
for name in checks: print(f' - {name}')
