"""CPU invoice OCR service on Modal: docTR (db_resnet50 + crnn_vgg16_bn) + PyMuPDF."""

import base64
import hmac
import io
import logging
import os
import threading
import time
from pathlib import Path

import modal

APP_NAME = "invoice-docservice"
MAX_BYTES, MAX_SIDE, DPI = 25 * 1024 * 1024, 1600, 200
DOCTR_CACHE = "/root/.cache/doctr"
ALLOWED = {".pdf": "pdf", ".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg"}

app = modal.App(APP_NAME)
logger = logging.getLogger("docservice")
logging.basicConfig(level=logging.INFO)


def download_models() -> None:
    from doctr.models import ocr_predictor

    ocr_predictor(det_arch="db_resnet50", reco_arch="crnn_vgg16_bn", pretrained=True)


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install("torch==2.9.1+cpu", "torchvision==0.24.1+cpu",
                 extra_index_url="https://download.pytorch.org/whl/cpu")
    .pip_install("fastapi[standard]", "pymupdf", "pillow", "numpy", "python-doctr[torch]")
    .env({"DOCTR_CACHE_DIR": DOCTR_CACHE, "OMP_NUM_THREADS": "4"})
    .run_function(download_models)
)

_predictor = None
_init_lock = threading.Lock()
_infer_lock = threading.Lock()


def get_predictor():
    global _predictor
    with _init_lock:
        if _predictor is None:
            from doctr.models import ocr_predictor

            started = time.perf_counter()
            _predictor = ocr_predictor(det_arch="db_resnet50", reco_arch="crnn_vgg16_bn", pretrained=True)
            logger.info("DOCSERVICE_PREDICTOR_INIT %.2fs", time.perf_counter() - started)
    return _predictor


def box(x0: float, y0: float, x1: float, y1: float) -> dict:
    x0, x1 = sorted((max(0.0, min(1.0, float(x0))), max(0.0, min(1.0, float(x1)))))
    y0, y1 = sorted((max(0.0, min(1.0, float(y0))), max(0.0, min(1.0, float(y1)))))
    return {"x0": round(x0, 4), "y0": round(y0, 4), "x1": round(x1, 4), "y1": round(y1, 4)}


def text_layer_ok(words: list) -> bool:
    if len(words) < 20:
        return False
    text = "".join(word[4] for word in words)
    bad = sum(1 for ch in text if ch == "\ufffd" or ord(ch) == 127 or (ord(ch) < 32 and ch not in "\n\r\t"))
    return bool(text) and bad / len(text) <= 0.02


def detect_kind(filename: str, data: bytes) -> str:
    from fastapi import HTTPException

    suffix = Path(filename).suffix.lower()
    if suffix in ALLOWED:
        return ALLOWED[suffix]
    if data.startswith(b"%PDF"):
        return "pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    raise HTTPException(415, f"Unsupported file type: {suffix or 'unknown'}")


def ocr_words(img) -> list:
    import numpy as np

    with _infer_lock:
        result = get_predictor()([np.array(img.convert("RGB"))])
    words = []
    for block in result.pages[0].blocks:
        for line in block.lines:
            for word in line.words:
                text = str(word.value).strip()
                if text:
                    (x0, y0), (x1, y1) = word.geometry
                    words.append({"text": text, **box(x0, y0, x1, y1),
                                  "conf": round(float(word.confidence), 4), "source": "ocr"})
    return words


def thumbnail(img, include_images: bool):
    thumb = img.copy()
    thumb.thumbnail((MAX_SIDE, MAX_SIDE))
    if not include_images:
        return thumb, None
    buffer = io.BytesIO()
    thumb.save(buffer, format="PNG")
    return thumb, base64.b64encode(buffer.getvalue()).decode("ascii")


def analyze_bytes(file_kind: str, data: bytes, include_images: bool) -> list:
    from PIL import Image

    doc = None
    if file_kind == "pdf":
        import pymupdf

        doc = pymupdf.open(stream=data, filetype="pdf")
    pages = []
    try:
        for idx in range(1, (doc.page_count if doc else 1) + 1):
            width = height = None
            if doc:
                page = doc.load_page(idx - 1)
                width, height = page.rect.width, page.rect.height
                raw = page.get_text("words")
                pix = page.get_pixmap(dpi=DPI)
                img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                page_kind = "text" if text_layer_ok(raw) else "scan"
            else:
                raw, img, page_kind = [], Image.open(io.BytesIO(data)).convert("RGB"), "image"

            words, error = [], None
            if page_kind == "text":
                words = [{"text": text, **box(x0 / width, y0 / height, x1 / width, y1 / height),
                          "conf": 1.0, "source": "text_layer"}
                         for x0, y0, x1, y1, text, *_ in raw if text.strip()]
            else:
                try:
                    words = ocr_words(img)
                except Exception as exc:
                    logger.exception("OCR failed on page %d", idx)
                    error = str(exc)

            thumb, image_b64 = thumbnail(img, include_images)
            pages.append({
                "page": idx,
                "kind": page_kind,
                "width_pt": round(width, 2) if width else None,
                "height_pt": round(height, 2) if height else None,
                "image_width": thumb.width,
                "image_height": thumb.height,
                "words": words,
                "image_b64": image_b64,
                "error": error,
            })
    finally:
        if doc:
            doc.close()
    return pages


def create_app():
    from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile

    api = FastAPI(title=APP_NAME)

    def require_token(authorization: str | None = Header(default=None)) -> None:
        expected = os.environ.get("DOC_SERVICE_TOKEN", "")
        if not expected:
            raise HTTPException(500, "DOC_SERVICE_TOKEN is not configured")
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "Missing bearer token")
        if not hmac.compare_digest(authorization[7:], expected):
            raise HTTPException(401, "Invalid bearer token")

    @api.get("/health")
    def health():
        return {"ok": True}

    @api.post("/analyze", dependencies=[Depends(require_token)])
    def analyze(file: UploadFile = File(...), include_images: bool = True):
        started = time.perf_counter()
        data = file.file.read()
        if not data:
            raise HTTPException(400, "Empty file")
        if len(data) > MAX_BYTES:
            raise HTTPException(413, "File exceeds 25 MB")
        pages = analyze_bytes(detect_kind(file.filename or "", data), data, include_images)
        return {"filename": file.filename or "upload", "page_count": len(pages), "pages": pages,
                "elapsed_ms": int((time.perf_counter() - started) * 1000)}

    return api


_api = None
_api_lock = threading.Lock()


def get_api():
    global _api
    with _api_lock:
        if _api is None:
            _api = create_app()
    return _api


@app.function(
    image=image,
    cpu=4,
    memory=8192,
    timeout=300,
    scaledown_window=600,
    min_containers=1,
    max_containers=1,
    secrets=[modal.Secret.from_name("docservice-token")],
)
@modal.concurrent(max_inputs=2)
@modal.asgi_app()
def fastapi_app():
    return get_api()
