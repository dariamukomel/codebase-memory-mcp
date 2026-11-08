#!/usr/bin/env bash
# Build the exact static CPython + SQLGlot payload consumed by Makefile.cbm.
# These are build-time dependencies only; the installed CBM remains one file.
# No host pip or Python packages are required: both upstream archives are
# pinned and verified before they are used.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${SQLGLOT_EMBED_DIR:-$ROOT/build/sqlglot-embed}"
PYTHON_VERSION="${CBM_EMBED_PYTHON_VERSION:-3.12.12}"
SQLGLOT_VERSION="${CBM_SQLGLOT_VERSION:-30.21.0}"
PYTHON_SHA256="${CBM_EMBED_PYTHON_SHA256:-487c908ddf4097a1b9ba859f25fe46d22ccaabfb335880faac305ac62bffb79b}"
SQLGLOT_SHA256="${CBM_SQLGLOT_SHA256:-816d1a4815b7562b3976efcc0b561c928a743f976efd0fb8ad6db7a5b96c069e}"
JOBS="${NPROC:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '2')}"
WORK="$OUT/work"
PREFIX="$OUT/python"
PYTHON_MM="${PYTHON_VERSION%.*}"
TARBALL="$WORK/Python-$PYTHON_VERSION.tgz"
SOURCE="$WORK/Python-$PYTHON_VERSION"
WHEEL="$WORK/sqlglot-$SQLGLOT_VERSION-py3-none-any.whl"
RUNTIME_STAGE="$WORK/runtime"
RUNTIME_ZIP="$OUT/sqlglot-runtime.zip"
BUILD_RECIPE="static-minimal-deflate-v3"
BUILD_STAMP="$PREFIX/.cbm-sqlglot-build-recipe"

if [[ "$PYTHON_VERSION" != "3.12.12" && -z "${CBM_EMBED_PYTHON_SHA256:-}" ]]; then
    echo "CBM_EMBED_PYTHON_SHA256 is required when overriding CPython" >&2
    exit 2
fi
if [[ "$SQLGLOT_VERSION" != "30.21.0" && -z "${CBM_SQLGLOT_SHA256:-}" ]]; then
    echo "CBM_SQLGLOT_SHA256 is required when overriding SQLGlot" >&2
    exit 2
fi

case "$OUT" in
    ""|/|"$HOME")
        echo "Refusing unsafe SQLGLOT_EMBED_DIR: '$OUT'" >&2
        exit 2
        ;;
esac

mkdir -p "$WORK"

sha256_file() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | awk '{print $1}'
    else
        echo "A SHA-256 tool (sha256sum or shasum) is required" >&2
        return 2
    fi
}

verify_file() {
    local path="$1" expected="$2" actual
    actual="$(sha256_file "$path")"
    if [[ "$actual" != "$expected" ]]; then
        echo "SHA-256 mismatch for $path" >&2
        echo "  expected: $expected" >&2
        echo "  actual:   $actual" >&2
        return 2
    fi
}

download_verified() {
    local path="$1" url="$2" expected="$3" partial="$1.part.$$"
    if [[ -f "$path" ]] && verify_file "$path" "$expected"; then
        return 0
    fi
    rm -f "$path" "$partial"
    if ! curl --fail --location --retry 3 "$url" --output "$partial"; then
        rm -f "$partial"
        return 1
    fi
    if ! verify_file "$partial" "$expected"; then
        rm -f "$partial"
        return 1
    fi
    mv "$partial" "$path"
}

download_verified \
    "$TARBALL" \
    "https://www.python.org/ftp/python/$PYTHON_VERSION/Python-$PYTHON_VERSION.tgz" \
    "$PYTHON_SHA256"

if [[ "$SQLGLOT_VERSION" == "30.21.0" ]]; then
    SQLGLOT_URL="https://files.pythonhosted.org/packages/7e/93/acaa0862f841051e490326c1fc8c61d618d2df26f9e7aed26c331419ab15/sqlglot-30.21.0-py3-none-any.whl"
else
    SQLGLOT_URL="${CBM_SQLGLOT_WHEEL_URL:-}"
    if [[ -z "$SQLGLOT_URL" ]]; then
        echo "CBM_SQLGLOT_WHEEL_URL is required when overriding SQLGlot" >&2
        exit 2
    fi
fi
download_verified "$WHEEL" "$SQLGLOT_URL" "$SQLGLOT_SHA256"

# A previous recipe may have produced a working Python that cannot read a
# compressed embedded ZIP (notably when zlib was a shared extension). Rebuild
# only when the recipe changes; ordinary reruns reuse the expensive CPython
# build.
if [[ -x "$PREFIX/bin/python$PYTHON_MM" ]] &&
   [[ "$(cat "$BUILD_STAMP" 2>/dev/null || true)" != "$BUILD_RECIPE" ]]; then
    rm -rf "$PREFIX" "$SOURCE"
fi
if [[ ! -d "$SOURCE" ]]; then
    tar -xzf "$TARBALL" -C "$WORK"
fi

if [[ ! -x "$PREFIX/bin/python$PYTHON_MM" ]]; then
    # zipimport needs zlib inside libpython itself. A shared zlib extension
    # cannot be loaded from the appended executable ZIP and would make the
    # supposedly autonomous binary depend on a sidecar .so/.dylib.
    cat > "$SOURCE/Modules/Setup.local" <<'EOF'
*static*
array arraymodule.c
_bisect _bisectmodule.c
_csv _csv.c
_heapq _heapqmodule.c
_json _json.c
_opcode _opcode.c
_pickle _pickle.c
_random _randommodule.c
_socket socketmodule.c
_struct _struct.c
math mathmodule.c
select selectmodule.c
_datetime _datetimemodule.c
_decimal _decimal/_decimal.c
binascii binascii.c
zlib zlibmodule.c -lz
unicodedata unicodedata.c
_sha2 sha2module.c -I$(srcdir)/Modules/_hacl/include Modules/_hacl/libHacl_Hash_SHA2.a
_blake2 _blake2/blake2module.c _blake2/blake2b_impl.c _blake2/blake2s_impl.c
EOF
    pushd "$SOURCE" >/dev/null
    CFLAGS="${CBM_EMBED_PYTHON_CFLAGS:--Os -fPIC -ffunction-sections -fdata-sections}" ./configure \
        --prefix="$PREFIX" \
        --disable-shared \
        --with-static-libpython=yes \
        --without-ensurepip \
        --without-doc-strings \
        --disable-test-modules
    make -j"$JOBS"
    make install
    popd >/dev/null
    printf '%s\n' "$BUILD_RECIPE" > "$BUILD_STAMP"
fi

BUILD_PYTHON="$PREFIX/bin/python$PYTHON_MM"
RUNTIME_LIB_DIR="$PREFIX/lib/cbm-sqlglot"
MPDEC_LIBRARY="$RUNTIME_LIB_DIR/libmpdec.a"
HACL_SHA2_LIBRARY="$RUNTIME_LIB_DIR/libHacl_Hash_SHA2.a"
mkdir -p "$RUNTIME_LIB_DIR"
install -m 0644 "$SOURCE/Modules/_decimal/libmpdec/libmpdec.a" "$MPDEC_LIBRARY"
install -m 0644 "$SOURCE/Modules/_hacl/libHacl_Hash_SHA2.a" "$HACL_SHA2_LIBRARY"

rm -rf "$RUNTIME_STAGE"
mkdir -p "$RUNTIME_STAGE"

"$BUILD_PYTHON" - "$PREFIX/lib/python$PYTHON_MM" "$WHEEL" \
    "$RUNTIME_STAGE" "$RUNTIME_ZIP" "$SOURCE/LICENSE" <<'PY'
from __future__ import annotations

import pathlib
import shutil
import sys
import zipfile

stdlib = pathlib.Path(sys.argv[1])
wheel = pathlib.Path(sys.argv[2])
stage = pathlib.Path(sys.argv[3])
output = pathlib.Path(sys.argv[4])
python_license = pathlib.Path(sys.argv[5])

excluded = {
    "__pycache__", "ensurepip", "idlelib", "lib2to3", "site-packages",
    "test", "tests", "tkinter", "turtledemo", "venv",
}
for source in stdlib.rglob("*.py"):
    relative = source.relative_to(stdlib)
    if any(part in excluded for part in relative.parts):
        continue
    destination = stage / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)

with zipfile.ZipFile(wheel) as archive:
    for info in archive.infolist():
        if info.is_dir():
            continue
        first = pathlib.PurePosixPath(info.filename).parts[0]
        if first != "sqlglot" and not first.startswith("sqlglot-"):
            continue
        destination = stage / info.filename
        destination.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(info) as source, destination.open("wb") as target:
            shutil.copyfileobj(source, target)

license_target = stage / "_licenses" / "cpython.txt"
license_target.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(python_license, license_target)

with zipfile.ZipFile(
    output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
) as archive:
    for source in sorted(stage.rglob("*")):
        if source.is_file():
            archive.write(source, source.relative_to(stage).as_posix())
PY

# Prove that this CPython has no shared zlib dependency and that the compressed
# payload can import every bundled SQLGlot dialect before it is appended to CBM.
"$BUILD_PYTHON" - "$RUNTIME_ZIP" <<'PY'
import pathlib
import sys
import zipfile

runtime = pathlib.Path(sys.argv[1]).resolve()
with zipfile.ZipFile(runtime) as archive:
    assert archive.testzip() is None
sys.path.insert(0, str(runtime))
import zlib
assert zlib.__spec__.origin == "built-in", zlib.__spec__.origin
import sqlglot
from sqlglot.dialects import Dialect
for dialect in tuple(Dialect.classes):
    Dialect.get_or_raise(dialect)
sqlglot.parse_one("SELECT a FROM t")
PY

PYTHON_CONFIG="$PREFIX/bin/python${PYTHON_MM}-config"
INCLUDE_FLAGS="$($PYTHON_CONFIG --includes)"
LINK_FLAGS="$($PYTHON_CONFIG --embed --ldflags) $MPDEC_LIBRARY $HACL_SHA2_LIBRARY -lz -lm"
case "$(uname -s)" in
    Linux) LINK_FLAGS="-Wl,--gc-sections $LINK_FLAGS" ;;
    Darwin) LINK_FLAGS="-Wl,-dead_strip $LINK_FLAGS" ;;
esac
MK="$OUT/sqlglot-embed.mk"
printf '%s\n' \
    "# Generated by scripts/prepare-sqlglot-embed.sh; do not edit." \
    "SQLGLOT_CFLAGS := -DCBM_SQLGLOT_EMBEDDED=1 $INCLUDE_FLAGS" \
    "SQLGLOT_LDFLAGS := $LINK_FLAGS" \
    "SQLGLOT_BUILD_PYTHON := $BUILD_PYTHON" \
    "SQLGLOT_RUNTIME_ZIP := $RUNTIME_ZIP" \
    > "$MK"

# python-config omits private archives required by statically built extension
# modules. Compile and execute the exact embedding link now so a missing
# libmpdec/HACL dependency fails here, not at the end of CBM's long link.
LINK_PROBE_C="$WORK/embed-link-probe.c"
LINK_PROBE="$WORK/embed-link-probe"
cat > "$LINK_PROBE_C" <<'C'
#include <Python.h>
#include <stdio.h>

int main(int argc, char **argv) {
    if (argc < 1 || !argv[0] || !argv[0][0]) return 2;

    PyConfig config;
    PyConfig_InitIsolatedConfig(&config);
    config.use_environment = 0;
    config.user_site_directory = 0;
    config.site_import = 0;
    config.write_bytecode = 0;
    config.install_signal_handlers = 0;
    config.parse_argv = 0;
    config.pathconfig_warnings = 0;

    PyStatus status = PyConfig_SetBytesString(&config, &config.executable, argv[0]);
    if (!PyStatus_Exception(status))
        status = PyConfig_SetString(&config, &config.base_executable, config.executable);
    config.module_search_paths_set = 1;
    if (!PyStatus_Exception(status))
        status = PyWideStringList_Append(&config.module_search_paths, config.executable);
    if (!PyStatus_Exception(status)) status = Py_InitializeFromConfig(&config);
    if (PyStatus_Exception(status)) {
        fprintf(stderr, "embedded Python initialization failed: %s: %s\n",
                status.func ? status.func : "unknown",
                status.err_msg ? status.err_msg : "unknown");
        PyConfig_Clear(&config);
        return 2;
    }
    PyConfig_Clear(&config);
    int rc = PyRun_SimpleString(
        "import _csv, _sha2, decimal, zlib\n"
        "assert _sha2.sha256(b'cbm').hexdigest()\n"
        "assert str(decimal.Decimal('1.25') + 1) == '2.25'\n"
        "assert zlib.decompress(zlib.compress(b'cbm')) == b'cbm'\n"
        "import sqlglot\n"
        "from sqlglot.dialects import Dialect\n"
        "for dialect in tuple(Dialect.classes): Dialect.get_or_raise(dialect)\n"
        "sqlglot.parse_one('SELECT a FROM t')\n");
    if (Py_FinalizeEx() < 0) return 120;
    return rc == 0 ? 0 : 1;
}
C
# The generated make fragment already consumes these as shell words. Arrays
# preserve that same contract while avoiding eval.
read -r -a EMBED_CC_ARGS <<< "${CC:-cc}"
read -r -a EMBED_INCLUDE_ARGS <<< "$INCLUDE_FLAGS"
read -r -a EMBED_LINK_ARGS <<< "$LINK_FLAGS"
"${EMBED_CC_ARGS[@]}" "${EMBED_INCLUDE_ARGS[@]}" "$LINK_PROBE_C" \
    -o "$LINK_PROBE" "${EMBED_LINK_ARGS[@]}"
"$BUILD_PYTHON" "$ROOT/scripts/append-sqlglot-runtime.py" \
    "$LINK_PROBE" "$RUNTIME_ZIP"
"$LINK_PROBE"

echo "Prepared embedded CPython $PYTHON_VERSION + SQLGlot $SQLGLOT_VERSION in $OUT"
echo "Compressed runtime: $(du -h "$RUNTIME_ZIP" | awk '{print $1}')"
