#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
bus=(ROOT/'src/taskBus.ts').read_text()
ops=(ROOT/'src/taskOperations.ts').read_text()
center=(ROOT/'src/TaskCenter.tsx').read_text()
css=(ROOT/'src/task-center.css').read_text()
package=(ROOT/'package.json').read_text()
docs=(ROOT/'docs/TASK_OPERATIONS_ENGINEERING.md').read_text() if (ROOT/'docs/TASK_OPERATIONS_ENGINEERING.md').exists() else ''

checks={
 'Task metadata includes explicit priority': "TaskPriority='low'|'normal'|'high'" in bus and 'priority?:TaskPriority' in bus,
 'Task metadata includes resource classes': 'TaskResourceClass' in bus and "'unclassified'" in bus and 'resourceClass?:TaskResourceClass' in bus,
 'Explicit queued producer exists': 'queueTask(' in bus and "state:'queued'" in bus,
 'Lifecycle timestamps are explicit': 'queuedAt?:number' in ops and 'startedAt?:number' in ops and 'finishedAt?:number' in ops,
 'Queue wait requires observed queued and running': 'row.queuedAt!=null&&row.startedAt!=null' in ops and 'row.startedAt-row.queuedAt' in ops,
 'Service time requires start and terminal evidence': 'row.startedAt!=null&&end!=null' in ops and 'end-row.startedAt' in ops,
 'Operations summaries retain sample counts': 'queueWaitSamples' in ops and 'serviceSamples' in ops and 'medianTaskMetric' in ops,
 'Task Center mounts Operations Observatory': 'OPERATIONS OBSERVATORY' in center and 'Queue / service evidence' in center,
 'UI explicitly denies automatic scheduling': 'observational only · no automatic scheduler' in center,
 'Native install/import events are classified': "resourceClass:'mixed'" in center and "priority:'normal'" in center,
 'Missing queue evidence is not rendered as zero': "taskQueueWaitMs" in center and "ops.queueWaitSamples" in center and "taskQueueWaitMs(row" not in docs,
 'Active resource classes are visible': 'ops.activeByClass' in center and 'Classified active' in center,
 'Existing cancellation ownership is retained': 'cancel_pull' in center and 'cancel_hf_import' in center and 'cancelOrDismiss' in center,
 'Queued state has dedicated visual treatment': '.task-row.queued' in css,
 'Operations UI has responsive styling': '.task-ops-grid' in css and '@media(max-width:680px)' in css,
 'Methodology rejects premature queueing claims': "Little's Law" in docs and 'automatic concurrency limits' in docs and 'unknown queue wait' in docs,
 'Production verification includes Task operations': 'verify:task-operations' in package and 'verify-task-operations.py' in package,
}

failed=[name for name,ok in checks.items() if not ok]
if failed:
 print('OpenPenguin Task Operations verification FAILED')
 for name in failed: print(f' - {name}')
 sys.exit(1)
print('OpenPenguin Task Operations verification PASSED')
for name in checks: print(f' - {name}')
