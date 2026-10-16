#!/usr/bin/env python3
"""Package the tested standalone HTML and complete source tree (excluding installed dependencies).
Run npm run build first. Uses Python's standard library only.
"""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "deliverables"
BUILT = ROOT / "dist" / "index.html"
SOURCE_DIRECTORIES = ("src", "tests", "docs", "licenses", "tools")
SOURCE_FILES = (
    ".gitignore", "index.html", "package.json", "package-lock.json",
    "tsconfig.json", "vite.config.ts", "README.md", "THIRD_PARTY_NOTICES.md",
)
EXCLUDED = {"node_modules", ".git", ".arena", ".generated", "__pycache__"}

if not BUILT.is_file():
    raise SystemExit("Missing dist/index.html. Run npm ci && npm run build first.")

files = [ROOT / name for name in SOURCE_FILES]
for directory in SOURCE_DIRECTORIES:
    files.extend(
        path for path in (ROOT / directory).rglob("*")
        if path.is_file() and not EXCLUDED.intersection(path.relative_to(ROOT).parts)
    )
files = sorted(set(files), key=lambda path: path.relative_to(ROOT).as_posix())
missing = [str(path) for path in files if not path.is_file()]
if missing:
    raise SystemExit("Missing source files: " + ", ".join(missing))

# Docs/tests do not affect the frontend. Source, build config and license notices do.
build_inputs = [path for path in files if path.relative_to(ROOT).parts[0] in {"src", "licenses"}]
build_inputs.extend(ROOT / name for name in ("index.html", "package.json", "package-lock.json", "vite.config.ts", "THIRD_PARTY_NOTICES.md"))
if any(path.stat().st_mtime > BUILT.stat().st_mtime for path in build_inputs):
    raise SystemExit("The build is older than a build input. Rebuild and re-run QA before packaging.")

OUTPUT.mkdir(exist_ok=True)
shutil.copyfile(BUILT, OUTPUT / "calculator.html")
archive = OUTPUT / "calculator-source.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for path in files:
        # Fixed metadata makes the archive reproducible for identical source bytes.
        info = zipfile.ZipInfo("calculator-applcation/" + path.relative_to(ROOT).as_posix(), (2026, 10, 16, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        bundle.writestr(info, path.read_bytes(), compresslevel=9)
with zipfile.ZipFile(archive) as bundle:
    if bundle.testzip() is not None:
        raise SystemExit("Archive CRC verification failed.")

artifacts = []
for name in ("calculator.html", "calculator-source.zip"):
    path = OUTPUT / name
    artifacts.append({"file": name, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
(OUTPUT / "checksums.sha256").write_text("".join(f"{item['sha256']}  {item['file']}\n" for item in artifacts))
(OUTPUT / "manifest.json").write_text(json.dumps({"format": 1, "sourceFiles": len(files), "artifacts": artifacts}, indent=2) + "\n")
print(json.dumps({"sourceFiles": len(files), "artifacts": artifacts}, indent=2))
