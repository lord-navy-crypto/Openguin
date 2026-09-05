# Security Policy

## Alpha status

OpenPenguin is alpha software. Do not treat it as a hardened sandbox for untrusted executable code.

## Runtime boundary

- The private Ollama runtime binds to loopback (`127.0.0.1:11435`).
- External Ollama is expected at loopback (`127.0.0.1:11434`).
- The React frontend does not receive arbitrary shell access.
- Rust exposes a narrow set of Tauri commands and an allow-listed subset of Ollama API paths.
- Hugging Face GGUF imports are SHA-256 hashed locally and compared with Hub LFS metadata when it is available.
- Production source composition is static; `desktop:prepare` is limited to resources/assets and must not rewrite tracked source.

## Reporting

Please open a GitHub security report or use a private maintainer contact instead of publicly posting a working exploit. Do not include secrets, tokens, private model URLs, or personal data in reports.
