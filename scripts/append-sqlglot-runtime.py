#!/usr/bin/env python3
"""Append the embedded Python module archive to an already-linked executable."""

from __future__ import annotations

import pathlib
import sys
import zipfile


def main() -> int:
    if len(sys.argv) == 3 and sys.argv[1] == "--check":
        binary = pathlib.Path(sys.argv[2])
        try:
            with zipfile.ZipFile(binary) as archive:
                names = set(archive.namelist())
            return 0 if {"encodings/__init__.py", "sqlglot/__init__.py"} <= names else 1
        except (OSError, zipfile.BadZipFile):
            return 1
    if len(sys.argv) != 3:
        print(f"usage: {sys.argv[0]} BINARY RUNTIME_ZIP | --check BINARY", file=sys.stderr)
        return 2
    binary = pathlib.Path(sys.argv[1])
    runtime = pathlib.Path(sys.argv[2])
    if not binary.is_file() or not runtime.is_file():
        print("binary or runtime ZIP does not exist", file=sys.stderr)
        return 2
    with binary.open("ab") as output, runtime.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            output.write(chunk)
    # Python's zipimport supports an executable prefix. Validate the exact
    # resulting file now, rather than discovering a malformed artifact later.
    with zipfile.ZipFile(binary) as archive:
        names = set(archive.namelist())
        if "encodings/__init__.py" not in names or "sqlglot/__init__.py" not in names:
            raise SystemExit("appended runtime is missing encodings or sqlglot")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
