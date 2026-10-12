"""Screenshot validation and local OCR.

Uploads are untrusted. Checks, in order:
  1. size cap (enforced while streaming, before this module sees the bytes)
  2. declared MIME type must be PNG, JPEG or WebP
  3. magic bytes must match the declared type (no polyglots relabelled as images)
  4. dimensions are read from the header and capped before any pixel is decoded
     (decompression-bomb guard; Pillow's own bomb check remains as a second layer)
  5. the image is re-encoded to a fresh grayscale PNG in memory; metadata (EXIF, GPS) is discarded
  6. Tesseract runs as a subprocess on stdin with a timeout, no shell, no file names from the client

Nothing is written to disk and the image is not kept after the request.
If Tesseract is missing or fails, the result says so; it never pretends to have read the image.
"""
from __future__ import annotations

import hashlib
import io
import shutil
import subprocess
from dataclasses import dataclass, field

ALLOWED = {"image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp"}
MAX_PIXELS = 40_000_000
MAX_SIDE = 10_000


class UploadRejected(ValueError):
    pass


@dataclass
class ImageInfo:
    mime: str
    width: int
    height: int
    size_bytes: int
    sha256: str


@dataclass
class OcrResult:
    status: str                 # completed | partial | unavailable | failed
    text: str = ""
    mean_confidence: float | None = None
    word_count: int = 0
    engine: str = "tesseract"
    detail: str = ""
    notes: list[str] = field(default_factory=list)


def sniff(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def validate_image(data: bytes, declared: str) -> tuple[ImageInfo, bytes]:
    """Returns image facts and a sanitised grayscale PNG for OCR. Raises UploadRejected."""
    declared = (declared or "").split(";")[0].strip().lower()
    if declared not in ALLOWED:
        raise UploadRejected("Only PNG, JPEG or WebP screenshots are accepted.")
    if not data:
        raise UploadRejected("The file is empty.")
    actual = sniff(data)
    if actual is None:
        raise UploadRejected("The file is not a valid PNG, JPEG or WebP image.")
    if actual != declared:
        raise UploadRejected("The file contents do not match its declared image type.")
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError as exc:  # pragma: no cover - Pillow is in requirements.txt
        raise UploadRejected("Image support is not installed on this server.") from exc
    try:
        with Image.open(io.BytesIO(data)) as probe:
            if probe.format is None or probe.format.lower() != ALLOWED[actual]:
                raise UploadRejected("The image format is not supported.")
            w, h = probe.size
            if w < 16 or h < 16 or w > MAX_SIDE or h > MAX_SIDE or w * h > MAX_PIXELS:
                raise UploadRejected("The image dimensions are outside the accepted range.")
            probe.verify()
        with Image.open(io.BytesIO(data)) as img:
            img.seek(0)  # first frame only
            gray = img.convert("L")
            if gray.width < 1200:  # small screenshots OCR better when upscaled
                f = min(3, max(1, 1600 // max(gray.width, 1)))
                gray = gray.resize((gray.width * f, gray.height * f), Image.LANCZOS)
            out = io.BytesIO()
            gray.save(out, format="PNG")
    except UploadRejected:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise UploadRejected("The image is too large to process safely.")
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, EOFError):
        raise UploadRejected("The image could not be decoded. It may be corrupt.")
    info = ImageInfo(actual, w, h, len(data), hashlib.sha256(data).hexdigest())
    return info, out.getvalue()


def tesseract_path(configured: str = "") -> str | None:
    if configured:
        return configured if shutil.which(configured) else None
    return shutil.which("tesseract")


def run_ocr(png: bytes, cmd: str | None, timeout: float = 20.0, lang: str = "eng") -> OcrResult:
    if not cmd:
        return OcrResult("unavailable", detail="No local OCR engine (Tesseract) is installed on the server, so the "
                                               "screenshot could not be read. Paste the text instead.")
    try:
        proc = subprocess.run([cmd, "stdin", "stdout", "-l", lang, "--psm", "6", "tsv"], input=png,
                              capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired:
        return OcrResult("failed", detail="Reading the screenshot took too long and was stopped.")
    except OSError:
        return OcrResult("unavailable", detail="The OCR engine could not be started.")
    if proc.returncode != 0:
        return OcrResult("failed", detail="The OCR engine could not read this image.")
    return parse_tsv(proc.stdout.decode("utf-8", "replace"))


def parse_tsv(tsv: str) -> OcrResult:
    lines: dict[tuple, list[str]] = {}
    confs: list[float] = []
    for row in tsv.splitlines()[1:]:
        cols = row.split("\t")
        if len(cols) < 12 or cols[0] != "5":
            continue
        word = cols[11].strip()
        try:
            conf = float(cols[10])
        except ValueError:
            continue
        if not word or conf < 0:
            continue
        lines.setdefault((cols[2], cols[3], cols[4]), []).append(word)
        confs.append(conf)
    text = "\n".join(" ".join(ws) for ws in lines.values())
    if not confs:
        return OcrResult("partial", detail="No readable text was found in the screenshot.",
                         notes=["The image may contain no text, or text that is too small or stylised."])
    mean = sum(confs) / len(confs)
    status = "completed" if mean >= 60 and len(confs) >= 5 else "partial"
    notes = [] if status == "completed" else ["Parts of the screenshot may have been misread; check the extracted text."]
    return OcrResult(status, text=text, mean_confidence=round(mean, 1), word_count=len(confs),
                     detail="Text extracted locally with Tesseract.", notes=notes)
