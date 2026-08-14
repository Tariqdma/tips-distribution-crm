from pathlib import Path

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT_ROOT / "assets" / "images" / "icon.png"
TARGETS = [
    PROJECT_ROOT / "assets" / "images" / "icon.png",
    PROJECT_ROOT / "assets" / "images" / "splash-icon.png",
    PROJECT_ROOT / "assets" / "images" / "favicon.png",
    PROJECT_ROOT / "assets" / "images" / "android-icon-foreground.png",
]


def main() -> None:
    with Image.open(SOURCE) as original:
        resized = original.convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
        for target in TARGETS:
            resized.save(target, format="PNG", optimize=True, compress_level=9)
            print(f"wrote {target.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
