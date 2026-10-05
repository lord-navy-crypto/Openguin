# AI CoWork migration record

This directory contains a source snapshot migrated from **lord-navy-crypto/AI-cowork** into OpenPenguin.

- Source branch: `main`
- Source commit: `66692023621412a0887581842ff173ec818bbd73`
- Source archive branch: `archive/ai-cowork-2026-10-05`
- Destination repository: `lord-navy-crypto/Openguin`
- Destination branch: `ai-cowork-integration`
- Destination path: `modules/ai-cowork/`
- Migration date: 2026-10-05

The source repository was archived to a dedicated branch before its default branch was repurposed. The migrated module remains experimental and is not part of the stable OpenPenguin 0.10 runtime.

## Snapshot manifest

| Source path | Blob SHA | Bytes |
|---|---|---:|
| `.github/workflows/test.yml` | `c1446e106d78dccb1b1fd50579a550ff8ea649e1` | 349 |
| `.gitignore` | `925cb4564bac67848e44cbde16e9565c35031a97` | 219 |
| `README.md` | `27e758223d7f60bf1bbdb02640c05e0f2585188d` | 3736 |
| `WEB_ARCHITECTURE.md` | `f14a85050b8c74212bc07ebf381e4b4f6da7aacb` | 3146 |
| `ai_cowork/__init__.py` | `3dc1f76bc69e3f559bee6253b24fc93acee9e1f9` | 22 |
| `ai_cowork/agents.py` | `35d43c4112c030fed5984531efad3c311f30ab96` | 6378 |
| `ai_cowork/cooperation.py` | `d2e36f3c069ac92c62a5835f5d72e7281bdaa297` | 24620 |
| `ai_cowork/cursor_supervisor.py` | `18f453bc79f2ff7ffcff5cb084097069769bd8f6` | 2642 |
| `ai_cowork/events.py` | `35115d34deecfd98a1d5fe27915eed1c54191b9f` | 625 |
| `ai_cowork/gui.py` | `303a0ff169a0cf76b5332e97467272975d8c2ea2` | 17055 |
| `ai_cowork/macos.py` | `64fcbfe67cf5e82d7172f8838c514f0761211dbd` | 23501 |
| `ai_cowork/runtime_state.py` | `166ac6be721d29a8a926e6469b98afcf189d7540` | 5968 |
| `ai_cowork/supervisor.py` | `b1431f8cd3eddb366f623bbc4e598bf24d7b69d7` | 4341 |
| `ai_cowork/web_runtime.py` | `ea1c01bba0278452557f0b97487e9e355d375126` | 28192 |
| `config.example.yaml` | `ac22b794af3bd11520fb7edfc58ec648f7857f69` | 589 |
| `main.py` | `fedc8a638c29e791ec48a8d0bd71a04a93472208` | 10298 |
| `requirements.txt` | `cb24bb971ac8d52af059af67e683dce8d6708ebe` | 101 |
| `scripts/bootstrap_mac.sh` | `d6d7520b2fcbc1bef53acc6f518aff35bf536ad5` | 731 |
| `tests/test_core.py` | `aed5038cb6bbec33351341f8431b730cdd87975d` | 18846 |

## Notes

- The Python package, tests, scripts, original README, web architecture document, configuration example, and original workflow file are preserved with matching Git blob SHAs.
- OpenPenguin adds a separate root-level workflow so the nested module can be tested from the integration branch.
- This is a source snapshot migration. The original AI-cowork Git history remains recoverable from the archive branch in the source repository.
