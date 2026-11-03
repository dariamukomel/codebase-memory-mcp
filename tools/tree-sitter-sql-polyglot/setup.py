from os import path, makedirs, stat
from sysconfig import get_config_var

from setuptools import Extension, find_packages, setup
from setuptools.command.build import build
from setuptools.command.build_ext import build_ext
from setuptools.command.egg_info import egg_info
from wheel.bdist_wheel import bdist_wheel


class Build(build):
    def run(self):
        dest = path.join(self.build_lib, "tree_sitter_sql", "queries")
        if path.isdir("queries"):
            self.copy_tree("queries", dest)
        # Each dialect's standalone highlights query, flattened next to the base
        # one: queries/highlights_<dialect>.scm. The bundles are gitignored
        # build outputs (like parser.c): an sdist ships them, a git checkout
        # has to generate them first.
        for dialect in DIALECT_DIRS:
            bundled = path.join(dialect, "queries", "highlights.bundled.scm")
            if not path.exists(bundled):
                raise FileNotFoundError(
                    f"missing {bundled} (run `node scripts/inflate-parsers.js`)"
                )
            self.mkpath(dest)
            self.copy_file(bundled, path.join(dest, f"highlights_{dialect}.scm"))
        super().run()


DIALECT_DIRS = [
    "spark", "postgres", "mysql", "databricks", "snowflake", "bigquery",
    "mariadb", "sqlite", "hive", "oracle", "db2", "tsql", "duckdb", "trino",
    "athena", "redshift", "clickhouse", "flink", "cockroachdb", "spanner",
    "teradata", "hana",
]


def _inflate(src_dir):
    """Decompresses `<src_dir>/parser.c.br` into `<src_dir>/parser.c` if the
    plain file is missing or older than the blob. Only the Brotli-compressed
    blob is committed (see scripts/compress-parsers.js); this must run before
    the Extension's sources are compiled.
    """
    plain_path = path.join(src_dir, "parser.c")
    blob_path = f"{plain_path}.br"
    if not path.exists(blob_path):
        # An sdist ships the already-inflated parser.c and no .br blob: the
        # blobs are a git-checkout build input, not a distributed source
        # (EggInfo.find_sources never adds them, while parser.c comes along
        # as an Extension source). Missing blob + present parser.c is that
        # case and there is nothing to inflate; missing both is a broken tree.
        if path.exists(plain_path):
            return
        raise FileNotFoundError(
            f"missing {blob_path} (run `node scripts/compress-parsers.js`)"
        )
    if path.exists(plain_path) and stat(plain_path).st_mtime >= stat(blob_path).st_mtime:
        return
    # Imported lazily so the sdist path above, which never inflates anything,
    # does not need brotli installed at all.
    import brotli

    makedirs(src_dir, exist_ok=True)
    with open(blob_path, "rb") as f:
        data = brotli.decompress(f.read())
    with open(plain_path, "wb") as f:
        f.write(data)


_inflate("src")
for _dialect in DIALECT_DIRS:
    _inflate(path.join(_dialect, "src"))


class BuildExt(build_ext):
    def build_extension(self, ext: Extension):
        if self.compiler.compiler_type != "msvc":
            ext.extra_compile_args = ["-std=c11", "-fvisibility=hidden"]
        else:
            # /GL (whole-program optimization) forces the linker into /LTCG;
            # measured locally, linking all 22 dialects' enormous parser.c
            # translation units into one module that way ran the 64-bit
            # linker out of heap space (LNK1102) before this extension got
            # split one-per-dialect. Kept off for all extensions since it
            # costs nothing per-dialect either (no cross-module inlining to
            # lose - each is its own single-parser.c module now).
            ext.extra_compile_args = ["/std:c11", "/utf-8", "/GL-"]
            ext.extra_link_args = ["/LTCG:OFF"]
        # Each extension gets only its OWN scanner.c (its include_dirs[0] is
        # that dialect's own src/ dir) - not every dialect's, which is what a
        # blanket "append every scanner.c to whatever's building" loop would
        # do now that there are 23 separate extensions instead of 1.
        scanner = path.join(ext.include_dirs[0], "scanner.c")
        if path.exists(scanner):
            ext.sources.append(scanner)
        if ext.py_limited_api:
            ext.define_macros.append(("Py_LIMITED_API", "0x030A0000"))
        super().build_extension(ext)


class BdistWheel(bdist_wheel):
    def get_tag(self):
        python, abi, platform = super().get_tag()
        if python.startswith("cp"):
            python, abi = "cp310", "abi3"
        return python, abi, platform


class EggInfo(egg_info):
    def find_sources(self):
        super().find_sources()
        self.filelist.recursive_include("queries", "*.scm")
        self.filelist.include("src/tree_sitter/*.h")
        # The base scanner: compiled into _binding, and #included by every
        # dialect's own scanner.c. Neither route puts it in an Extension's
        # `sources` at sdist time (build_ext appends it later), so without
        # this the sdist ships 22 dialect scanners that can't compile.
        self.filelist.include("src/scanner.c")
        for dialect in DIALECT_DIRS:
            self.filelist.include(f"{dialect}/src/tree_sitter/*.h")
            self.filelist.include(f"{dialect}/src/scanner.c")
            self.filelist.include(f"{dialect}/queries/highlights.bundled.scm")


setup(
    packages=find_packages("bindings/python"),
    package_dir={"": "bindings/python"},
    package_data={
        "tree_sitter_sql": ["*.pyi", "py.typed"],
        "tree_sitter_sql.queries": ["*.scm"],
    },
    ext_package="tree_sitter_sql",
    # One extension module per dialect (+ base) instead of one `_binding`
    # module compiling all 44 parser.c/scanner.c files together - that's what
    # lets __init__.py's lazy __getattr__ (see generate-bindings.js's Python
    # section) import only the dialect actually accessed, instead of always
    # dlopen-ing all 22 dialects' compiled parse tables at `import
    # tree_sitter_sql` time.
    ext_modules=[
        Extension(
            name="_binding",
            sources=[
                "bindings/python/tree_sitter_sql/binding.c",
                "src/parser.c",
            ],
            define_macros=[
                ("PY_SSIZE_T_CLEAN", None),
                ("TREE_SITTER_HIDE_SYMBOLS", None),
            ],
            include_dirs=["src"],
            py_limited_api=not get_config_var("Py_GIL_DISABLED"),
        ),
        *[
            Extension(
                name=f"_binding_{dialect}",
                sources=[
                    f"bindings/python/tree_sitter_sql/binding_{dialect}.c",
                    path.join(dialect, "src", "parser.c"),
                ],
                define_macros=[
                    ("PY_SSIZE_T_CLEAN", None),
                    ("TREE_SITTER_HIDE_SYMBOLS", None),
                ],
                include_dirs=[path.join(dialect, "src")],
                py_limited_api=not get_config_var("Py_GIL_DISABLED"),
            )
            for dialect in DIALECT_DIRS
        ],
    ],
    cmdclass={
        "build": Build,
        "build_ext": BuildExt,
        "bdist_wheel": BdistWheel,
        "egg_info": EggInfo,
    },
    zip_safe=False
)
