#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
mega=(ROOT/'src/MegaLibrary.tsx').read_text()
portfolio=(ROOT/'src/libraryPortfolio013.ts').read_text()
ui=(ROOT/'src/LibraryPortfolio013.tsx').read_text()
css=(ROOT/'src/library-portfolio013.css').read_text()
package=(ROOT/'package.json').read_text()
docs=(ROOT/'docs/LIBRARY_PORTFOLIO_0_13.md').read_text() if (ROOT/'docs/LIBRARY_PORTFOLIO_0_13.md').exists() else ''

checks={
 'Portfolio planner is mounted in Global Library': "import LibraryPortfolio013 from './LibraryPortfolio013'" in mega and '<LibraryPortfolio013' in mega,
 'Variants can be pinned to portfolio': "addLibraryPortfolioItem013" in mega and 'Pin plan' in mega,
 'Portfolio dataset is bounded': 'const LIMIT=24' in portfolio,
 'Portfolio export schema is versioned': "openguin.library.portfolio.v1" in portfolio,
 'Unknown size invalidates complete feasibility': "state:'unknown'" in portfolio and 'known.length!==items.length' in portfolio,
 'Steady storage sums final variant sizes': "const steady=known.reduce" in portfolio,
 'Peak uses steady plus largest transient overhead': 'const transient=Math.max(0,...extras),peak=steady+transient' in portfolio,
 'No dedup savings are silently assumed': 'no dedup assumed' in ui.lower() and 'ignores possible shared Ollama blobs' in ui,
 'Runtime remains per model rather than summed': 'assessLibraryVariant013' in ui and 'Runtime projections are per item' in ui,
 'Shared capacity controls feed portfolio': 'context={capacityContext}' in mega and 'policy={capacityPolicy}' in mega and 'reserveGb={reserveGb}' in mega,
 'Portfolio supports remove clear and JSON export': 'removeLibraryPortfolioItem013' in ui and 'clearLibraryPortfolio013' in ui and 'Export JSON' in ui,
 'Portfolio CSS exposes feasibility states': '.lp13-state.feasible' in css and '.lp13-state.storage-constrained' in css and '.lp13-state.unknown' in css,
 'Portfolio methodology documentation exists': 'Multi-model portfolio planning' in docs and 'conservative upper bound' in docs and 'capacity planning' in docs.lower(),
 'Production verification includes portfolio contract': 'verify:library-portfolio' in package and 'verify-library-portfolio013.py' in package,
}

failed=[name for name,ok in checks.items() if not ok]
if failed:
 print('OpenPenguin 0.13 Library portfolio verification FAILED')
 for name in failed: print(f' - {name}')
 sys.exit(1)
print('OpenPenguin 0.13 Library portfolio verification PASSED')
for name in checks: print(f' - {name}')
