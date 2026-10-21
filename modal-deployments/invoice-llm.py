"""Deploy Qwen2.5-VL-7B-Instruct as an OpenAI-compatible server on Modal.

The server exposes `POST /v1/chat/completions` with the model name `invoice-vlm`.
Weights are downloaded once at image-build time into a persistent Hugging Face
cache Volume, so container boots never touch the network for weights.

Deploy:
    modal deploy modal-deployments/invoice-llm.py

Test:
    python modal-deployments/run-invoice-llm.py --pdf public/01_grid_tabular_USD.pdf
"""

import os
import subprocess

import modal

APP_NAME = "invoice-llm"
MODEL_ID = "Qwen/Qwen2.5-VL-7B-Instruct"
MODEL_REVISION = "cc594898137f460bfe9f0759e9844b3ce807cfb5"
SERVED_MODEL_NAME = "invoice-vlm"

# 24 GB is enough for 16.6 GB of BF16 weights + 16k KV cache + vision activations.
GPU = "L4"
VLLM_PORT = 8000
MAX_MODEL_LEN = 16384
FAST_BOOT = True

CACHE_DIR = "/cache/huggingface"
VLLM_CACHE_DIR = "/root/.cache/vllm"

app = modal.App(APP_NAME)

hf_cache_vol = modal.Volume.from_name("huggingface-model-cache", create_if_missing=True)
vllm_cache_vol = modal.Volume.from_name("vllm-cache", create_if_missing=True)


def download_model() -> None:
    """Populate the HF cache Volume at image-build time."""
    from huggingface_hub import snapshot_download

    snapshot_download(
        repo_id=MODEL_ID,
        revision=MODEL_REVISION,
        token=os.environ["HF_TOKEN"],
    )


vllm_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.9.0-devel-ubuntu22.04",
        add_python="3.12",
    )
    .entrypoint([])
    .uv_pip_install("vllm==0.21.0", "huggingface_hub[hf_xet]")
    .env(
        {
            "HF_XET_HIGH_PERFORMANCE": "1",
            "HF_HOME": CACHE_DIR,
            "HF_HUB_CACHE": CACHE_DIR,
            "VLLM_LOG_STATS_INTERVAL": "1",
        }
    )
    .run_function(
        download_model,
        volumes={CACHE_DIR: hf_cache_vol},
        secrets=[modal.Secret.from_name("huggingface-secret")],
    )
)


@app.server(
    image=vllm_image,
    gpu=GPU,
    secrets=[modal.Secret.from_name("huggingface-secret")],
    volumes={
        CACHE_DIR: hf_cache_vol,
        VLLM_CACHE_DIR: vllm_cache_vol,
    },
    port=VLLM_PORT,
    unauthenticated=True,
    target_concurrency=8,
    startup_timeout=15 * 60,
    scaledown_window=15 * 60,
    min_containers=1,
    max_containers=1,
)
class VllmServer:
    @modal.enter()
    def start(self) -> None:
        cmd = [
            "vllm",
            "serve",
            MODEL_ID,
            "--revision",
            MODEL_REVISION,
            "--served-model-name",
            SERVED_MODEL_NAME,
            "--host",
            "0.0.0.0",
            "--port",
            str(VLLM_PORT),
            "--dtype",
            "bfloat16",
            "--max-model-len",
            str(MAX_MODEL_LEN),
            "--gpu-memory-utilization",
            "0.90",
            "--max-num-seqs",
            "8",
            "--limit-mm-per-prompt",
            '{"image": 1, "video": 0}',
            "--uvicorn-log-level",
            "info",
        ]

        if FAST_BOOT:
            # Skips CUDA graph capture: less memory and a much faster cold start.
            cmd.append("--enforce-eager")

        print("Launching vLLM:", *cmd, flush=True)
        self.process = subprocess.Popen(cmd)

    @modal.exit()
    def stop(self) -> None:
        self.process.terminate()
        self.process.wait(timeout=30)


@app.local_entrypoint()
def main() -> None:
    print(f"Deploy : modal deploy modal-deployments/{os.path.basename(__file__)}")
    print(f"Model  : {MODEL_ID} @ {MODEL_REVISION}")
    print(f"Served : {SERVED_MODEL_NAME}")
    print(f"GPU    : {GPU}, max-model-len={MAX_MODEL_LEN}")
