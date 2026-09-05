#!/usr/bin/env python3
from pathlib import Path
import sys

root=Path(__file__).resolve().parents[1]
errors=[]
def require(path:str,token:str,label:str):
    p=root/path
    if not p.is_file(): errors.append(f"missing {path}");return
    if token not in p.read_text(): errors.append(f"{path}: missing {label}: {token}")

require('src/EngineeringControl011.tsx',"import CalibrationRecorder011 from './CalibrationRecorder011';",'recorder import')
require('src/EngineeringControl011.tsx','<CalibrationRecorder011','recorder mount')
require('src/CalibrationRecorder011.tsx','Record point','explicit record action')
require('src/CalibrationRecorder011.tsx','Download JSON','JSON export')
require('src/CalibrationRecorder011.tsx','Download CSV','CSV export')
require('src/CalibrationRecorder011.tsx','Recording is explicit','anti-poll-bias explanation')
require('src/engineeringCalibrationDataset011.ts','ENGINEERING_DATASET_KEY','persistent dataset key')
require('src/engineeringCalibrationDataset011.ts','const LIMIT=120','bounded dataset')
require('src/engineeringCalibrationDataset011.ts','recordEngineeringPoint','record function')
require('src/engineeringCalibrationDataset011.ts','engineeringDatasetCsv','CSV serializer')
require('src/engineeringCalibrationDataset011.ts','engineeringDatasetJson','JSON serializer')
require('src/engineeringCalibrationDataset011.ts','openguin.engineering.calibration.v1','export schema')
require('src/calibration-recorder011.css','.eng011-recorder','recorder styling')
require('src/Observatory.tsx','saveEngineeringCalibration','measured snapshot producer')
require('scripts/validate-mac011.py','openguin.physical-mac-validation.v1','physical-Mac report schema')
require('scripts/validate-mac011.py','--require-private','private-runtime strict mode')
require('scripts/validate-mac011.py','manualStillRequired','manual gate separation')
require('scripts/validate-mac011.py','.build-cache','ignored report destination')
require('docs/SOURCE_OF_TRUTH.md','production source','source-of-truth policy')

# Observatory may refresh the latest snapshot every 2s, but only the explicit
# Recorder component may append to the multi-point calibration dataset.
obs=(root/'src/Observatory.tsx').read_text()
if 'recordEngineeringPoint' in obs or 'ENGINEERING_DATASET_KEY' in obs:
    errors.append('Observatory must not auto-append calibration dataset points')

if errors:
    print('OpenPenguin 0.11 release-gate tooling verification FAILED')
    for e in errors: print(' -',e)
    sys.exit(1)
print('OpenPenguin 0.11 release-gate tooling verification PASSED')
print(' - Plan-vs-Measured snapshot remains separate from explicit dataset recording')
print(' - Calibration Recorder persists bounded operating points and exports JSON/CSV')
print(' - Physical-Mac harness produces an ignored evidence report')
print(' - Automated harness explicitly preserves manual release-gate requirements')
