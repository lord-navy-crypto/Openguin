# Model licensing and provenance

OpenPenguin is a model manager, not a blanket license for model weights.

For every community model source, OpenPenguin should preserve as much of the following as the upstream source provides:

- repository/model ID
- publisher or organization
- source URL
- declared license
- original GGUF filename
- quantization
- SHA-256 / LFS checksum when available
- base-model / fine-tune lineage metadata when available

A missing or ambiguous license should be displayed as such rather than guessed. Users remain responsible for checking the upstream terms for their intended use.

OpenPenguin's discovery or import UI does not alter upstream model terms. Provenance metadata is preserved so model origin, file identity, checksum information, and declared licensing can be reviewed later.
