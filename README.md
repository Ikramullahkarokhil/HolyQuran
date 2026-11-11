# Welcome to Zād al-Hudā App

## Prebuilt semantic search index

The app loads the index from `assets/search-index.bin` and
`assets/search-index.json`, then saves it locally for subsequent launches. It
does not embed the corpus during normal search. Generate index vectors on a
computer rather than on a phone. The laptop script uses the Hugging Face
`google/embeddinggemma-2` Sentence Transformers model and the same document
text format and 256-dimensional normalized vectors as the app.

Create a Python environment and install Sentence Transformers:

```sh
python3 -m venv .venv-index
source .venv-index/bin/activate
python -m pip install sentence-transformers
python -m pip install --upgrade "git+https://github.com/huggingface/transformers.git"
```

The latest Transformers development version may be required for
`google/embeddinggemma-2`; the stable version installed by Sentence
Transformers may not recognize its model architecture.

For concurrent CPU + Intel GPU generation, install PyTorch's XPU wheels and
the Intel GPU runtime/driver required by your Linux distribution:

```sh
python -m pip uninstall -y torch torchvision
python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/xpu
python -c "import torch; print(torch.xpu.is_available()); print(torch.xpu.get_device_name(0) if torch.xpu.is_available() else 'No Intel GPU')"
```

The check must print `True` and the Intel GPU name before using hybrid mode.
Intel's [PyTorch GPU prerequisites](https://www.intel.com/content/www/us/en/developer/articles/tool/pytorch-prerequisites-for-intel-gpu.html)
cover supported GPUs and Linux driver installation. If you previously
installed a different PyTorch build, pip replaces it with the XPU build.

Export the ordered document inputs from the project corpus, generate vectors
locally, and package them into the app's index assets:

```sh
node scripts/build-search-index.js --export-documents /tmp/search-index-documents.json
python3 scripts/generate-search-vectors.py \
  --documents /tmp/search-index-documents.json \
  --output /tmp/search-index-vectors.bin \
  --batch-size 32 \
  --backend hybrid \
  --cpu-threads 4
npm run index:search -- --vectors /tmp/search-index-vectors.bin
```

The first Python run downloads the model to the local Hugging Face cache.
Hybrid mode uses separate CPU and Intel GPU workers and distributes batches as
workers become available, keeping vectors in the original document order. It
loads two copies of the model, so it needs more RAM and may not be faster on an
integrated GPU that shares memory with the CPU. Compare CPU-only and hybrid
throughput on the same first 256 documents before processing the entire corpus:

```sh
python scripts/generate-search-vectors.py --documents /tmp/search-index-documents.json --output /tmp/cpu-test.bin --limit 256 --batch-size 32 --backend torch --device cpu
python scripts/generate-search-vectors.py --documents /tmp/search-index-documents.json --output /tmp/hybrid-test.bin --limit 256 --batch-size 32 --backend hybrid --cpu-threads 4
```

Only use hybrid mode for the full run if it is faster and both workers fit in
memory. Reduce `--batch-size` or `--cpu-threads` if memory is tight. The regular
PyTorch backend also supports `cuda` and `mps` where installed; OpenVINO is an
alternative backend for compatible setups.

The Node packager validates the vector count, quantizes the vectors, and
writes `assets/search-index.bin` and `assets/search-index.json`. Include both
generated assets in the app build. The app checks their corpus fingerprint and
reports an error if either asset is stale or missing; it will not fall back to
a slow on-device corpus build.
