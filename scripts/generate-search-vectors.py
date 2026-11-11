#!/usr/bin/env python3
"""Generate EmbeddingGemma document vectors locally for the search index."""

import argparse
import json
import multiprocessing
import os
from pathlib import Path
import queue
import sys
import time
import traceback

DEFAULT_MODEL = "google/embeddinggemma-2"
DIMENSION = 256


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--documents", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument(
        "--limit",
        type=int,
        help="embed only the first N documents (use for a speed test, not a full index)",
    )
    parser.add_argument(
        "--cpu-threads",
        type=int,
        default=max(1, (os.cpu_count() or 2) // 2),
        help="CPU worker thread count in hybrid mode",
    )
    parser.add_argument(
        "--backend",
        choices=("torch", "openvino", "hybrid"),
        default="torch",
        help="torch, openvino, or concurrent CPU + Intel XPU (hybrid)",
    )
    parser.add_argument(
        "--device",
        default="auto",
        help="auto, cpu, cuda, mps, or xpu for torch; auto, CPU, or GPU for OpenVINO",
    )
    args = parser.parse_args()
    if args.batch_size < 1:
        parser.error("--batch-size must be at least 1")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be at least 1")
    if args.cpu_threads < 1:
        parser.error("--cpu-threads must be at least 1")
    return args


def make_model_inputs(documents):
    try:
        return [
            f"title: {document['title'] or 'none'} | text: {document['text']}"
            for document in documents
        ]
    except (KeyError, TypeError) as error:
        raise ValueError(f"Malformed document in export: {error}") from error


def hybrid_worker(device, documents_path, vectors_path, document_count, batch_size, cpu_threads,
                  work_queue, result_queue):
    try:
        import numpy as np
        import torch
        from sentence_transformers import SentenceTransformer

        if device == "xpu":
            if not hasattr(torch, "xpu") or not torch.xpu.is_available():
                raise RuntimeError(
                    "PyTorch cannot access an Intel GPU. Install the PyTorch XPU "
                    "wheel and Intel GPU runtime, then verify torch.xpu.is_available()."
                )
        else:
            torch.set_num_threads(cpu_threads)

        exported = json.loads(documents_path.read_text(encoding="utf-8"))
        documents = exported["documents"]
        model = SentenceTransformer(DEFAULT_MODEL, device=device)
        vectors_file = np.memmap(
            vectors_path,
            dtype="<f4",
            mode="r+",
            shape=(document_count, DIMENSION),
        )

        while True:
            task = work_queue.get()
            if task is None:
                break
            start, end = task
            inputs = make_model_inputs(documents[start:end])
            vectors = model.encode(
                inputs,
                prompt="",
                batch_size=batch_size,
                show_progress_bar=False,
                convert_to_numpy=True,
                normalize_embeddings=True,
                precision="float32",
                truncate_dim=DIMENSION,
            )
            vectors = np.asarray(vectors, dtype="<f4")
            if vectors.shape != (end - start, DIMENSION):
                raise ValueError(
                    f"{device} returned shape {vectors.shape}; "
                    f"expected ({end - start}, {DIMENSION})."
                )
            if not np.isfinite(vectors).all():
                raise ValueError(f"{device} returned non-finite values at document {start}.")
            vectors_file[start:end] = vectors
            result_queue.put(("progress", end - start, device))

        vectors_file.flush()
        del vectors_file
        result_queue.put(("done", 0, device))
    except Exception:
        result_queue.put(("error", traceback.format_exc(), device))


def generate_hybrid(inputs, documents_path, output_path, batch_size, cpu_threads):
    import numpy as np
    import torch

    if not hasattr(torch, "xpu") or not torch.xpu.is_available():
        raise SystemExit(
            "Hybrid mode requires an available Intel GPU in PyTorch. "
            "Install the Intel XPU PyTorch wheel and GPU runtime, then verify "
            "with: python -c \"import torch; print(torch.xpu.is_available())\""
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_name(output_path.name + ".tmp")
    temporary_path.unlink(missing_ok=True)
    with temporary_path.open("wb") as file:
        file.truncate(len(inputs) * DIMENSION * np.dtype("<f4").itemsize)

    context = multiprocessing.get_context("spawn")
    work_queue = context.Queue()
    result_queue = context.Queue()
    for start in range(0, len(inputs), batch_size):
        work_queue.put((start, min(start + batch_size, len(inputs))))
    work_queue.put(None)
    work_queue.put(None)

    workers = [
        context.Process(
            target=hybrid_worker,
            args=(
                device,
                documents_path,
                temporary_path,
                len(inputs),
                batch_size,
                cpu_threads,
                work_queue,
                result_queue,
            ),
            name=f"search-index-{device}",
        )
        for device in ("cpu", "xpu")
    ]
    started = time.perf_counter()
    total_done = 0
    worker_done = set()
    try:
        for worker in workers:
            worker.start()

        while len(worker_done) < len(workers):
            try:
                status, value, device = result_queue.get(timeout=1)
            except queue.Empty:
                failed = [worker for worker in workers if worker.exitcode not in (None, 0)]
                if failed:
                    raise RuntimeError(
                        f"Hybrid worker exited unexpectedly: {failed[0].name} "
                        f"(exit code {failed[0].exitcode})"
                    )
                continue

            if status == "error":
                raise RuntimeError(f"{device} worker failed:\n{value}")
            if status == "done":
                worker_done.add(device)
                continue

            total_done += value
            elapsed = time.perf_counter() - started
            if total_done == len(inputs) or total_done % (batch_size * 10) < value:
                rate = total_done / elapsed if elapsed else 0
                print(
                    f"{total_done:,}/{len(inputs):,} documents "
                    f"({rate:.1f} docs/s; CPU + Intel GPU)",
                    flush=True,
                )

        for worker in workers:
            worker.join()
            if worker.exitcode != 0:
                raise RuntimeError(
                    f"Hybrid worker {worker.name} failed with exit code {worker.exitcode}."
                )

        if total_done != len(inputs):
            raise RuntimeError(
                f"Generated {total_done} vectors; expected {len(inputs)}."
            )
        expected_bytes = len(inputs) * DIMENSION * np.dtype("<f4").itemsize
        if temporary_path.stat().st_size != expected_bytes:
            raise ValueError("Hybrid output file has an unexpected size.")
        os.replace(temporary_path, output_path)
    except Exception:
        for worker in workers:
            if worker.is_alive():
                worker.terminate()
                worker.join()
        temporary_path.unlink(missing_ok=True)
        raise
    finally:
        work_queue.close()
        result_queue.close()

    print(f"Saved vectors to {output_path}")
    print("Next, run: npm run index:search -- --vectors <path-to-vector-file>")


def main():
    args = parse_args()
    documents_path = args.documents.resolve()
    output_path = args.output.resolve()

    try:
        import numpy as np
        from sentence_transformers import SentenceTransformer
    except ImportError as error:
        raise SystemExit(
            "Missing dependency. Install NumPy, PyTorch for your laptop, and "
            "sentence-transformers, then rerun this script."
        ) from error

    try:
        exported = json.loads(documents_path.read_text(encoding="utf-8"))
    except OSError as error:
        raise SystemExit(f"Cannot read document export {documents_path}: {error}") from error
    except json.JSONDecodeError as error:
        raise SystemExit(f"Invalid document export {documents_path}: {error}") from error

    documents = exported.get("documents")
    if (
        exported.get("formatVersion") != 1
        or not isinstance(documents, list)
        or exported.get("count") != len(documents)
        or not documents
    ):
        raise SystemExit("Document export is missing, empty, or has an unsupported format.")

    try:
        inputs = make_model_inputs(documents)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    if args.limit is not None:
        inputs = inputs[: args.limit]
        if not inputs:
            raise SystemExit("The document export is empty.")
        print(
            f"Speed-test mode: embedding only {len(inputs):,} of "
            f"{len(documents):,} documents."
        )

    if args.backend == "hybrid":
        print(
            "Running concurrent CPU + Intel GPU workers. This loads two model "
            "copies; integrated graphics shares system memory, so monitor RAM."
        )
        generate_hybrid(
            inputs,
            documents_path,
            output_path,
            args.batch_size,
            args.cpu_threads,
        )
        return

    if args.backend == "openvino":
        try:
            import openvino as ov
        except ImportError as error:
            raise SystemExit(
                'OpenVINO is not installed. Run: pip install "sentence-transformers[openvino]"'
            ) from error

        available_devices = ov.Core().available_devices
        has_gpu = any(
            device == "GPU" or device.startswith("GPU.")
            for device in available_devices
        )
        if args.device.lower() == "auto":
            device = "GPU" if has_gpu else "CPU"
        else:
            device = args.device.upper()
        if device.startswith("GPU") and not has_gpu:
            raise SystemExit(
                "OpenVINO did not find an Intel GPU. Check the GPU driver, "
                "or pass --device CPU."
            )
        print(f"Loading {DEFAULT_MODEL} with OpenVINO on {device}…")
        model = SentenceTransformer(
            DEFAULT_MODEL,
            backend="openvino",
            model_kwargs={"device": device},
        )
    else:
        device = None if args.device.lower() == "auto" else args.device
        print(
            f"Loading {DEFAULT_MODEL} with PyTorch on "
            f"{'automatic device selection' if device is None else device}…"
        )
        model = SentenceTransformer(DEFAULT_MODEL, device=device)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_name(output_path.name + ".tmp")
    started = time.perf_counter()
    try:
        with temporary_path.open("wb") as output:
            for start in range(0, len(inputs), args.batch_size):
                batch = inputs[start : start + args.batch_size]
                vectors = model.encode(
                    batch,
                    prompt="",
                    batch_size=args.batch_size,
                    show_progress_bar=False,
                    convert_to_numpy=True,
                    normalize_embeddings=True,
                    precision="float32",
                    truncate_dim=DIMENSION,
                )
                vectors = np.asarray(vectors, dtype="<f4")
                if vectors.shape != (len(batch), DIMENSION):
                    raise ValueError(
                        f"Model returned shape {vectors.shape}; "
                        f"expected ({len(batch)}, {DIMENSION})."
                    )
                if not np.isfinite(vectors).all():
                    raise ValueError(f"Embedding batch at document {start} has non-finite values.")
                vectors.tofile(output)

                done = start + len(batch)
                if done == len(inputs) or done % (args.batch_size * 10) == 0:
                    elapsed = time.perf_counter() - started
                    rate = done / elapsed if elapsed else 0
                    print(
                        f"{done:,}/{len(inputs):,} documents "
                        f"({rate:.1f} docs/s)",
                        flush=True,
                    )

        expected_bytes = len(inputs) * DIMENSION * np.dtype("<f4").itemsize
        actual_bytes = temporary_path.stat().st_size
        if actual_bytes != expected_bytes:
            raise ValueError(
                f"Generated file has {actual_bytes} bytes; expected {expected_bytes}."
            )
        os.replace(temporary_path, output_path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise

    print(f"Saved vectors to {output_path}")
    print("Next, run: npm run index:search -- --vectors <path-to-vector-file>")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Vector generation failed: {error}", file=sys.stderr)
        raise
