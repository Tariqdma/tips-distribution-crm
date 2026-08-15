from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"

# Redaction rectangles are limited to account-identifying text in browser captures.
# Coordinates preserve the instructional UI while removing test-account identity.
REDACTIONS = {
    "live-admin-overview.webp": [
        (0, 0, 170, 42),
        (170, 500, 510, 570),
    ],
    "live-plan-review.webp": [
        (0, 0, 170, 42),
        (340, 419, 456, 439),
        (575, 419, 708, 442),
    ],
    "live-plan-review-demo.webp": [
        (0, 0, 170, 42),
        (340, 419, 456, 439),
        (575, 419, 708, 442),
    ],
    "live-plan-edit.webp": [
        (0, 0, 170, 42),
        (470, 299, 635, 318),
        (575, 419, 708, 442),
    ],
    "live-rep-returned-plan.webp": [
        (610, 0, 893, 50),
    ],
    "live-rep-home.webp": [
        (610, 0, 893, 50),
    ],
}


def redact(path: Path, boxes: list[tuple[int, int, int, int]]) -> None:
    with Image.open(path).convert("RGB") as source:
        canvas = source.copy()
        draw = ImageDraw.Draw(canvas)
        for box in boxes:
            draw.rounded_rectangle(box, radius=5, fill="#F7FAF9")
        canvas.save(path, "WEBP", quality=92, method=6)


def main() -> None:
    for filename, boxes in REDACTIONS.items():
        path = ASSETS / filename
        if not path.exists():
            raise FileNotFoundError(path)
        redact(path, boxes)
        print(f"Redacted {filename}")


if __name__ == "__main__":
    main()
