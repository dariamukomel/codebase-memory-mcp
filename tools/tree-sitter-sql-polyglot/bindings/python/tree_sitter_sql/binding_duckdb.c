#include <Python.h>

typedef struct TSLanguage TSLanguage;

TSLanguage *tree_sitter_duckdb_sql(void);

static PyObject* _binding_language_duckdb(PyObject *Py_UNUSED(self), PyObject *Py_UNUSED(args)) {
    return PyCapsule_New(tree_sitter_duckdb_sql(), "tree_sitter.Language", NULL);
}

static struct PyModuleDef_Slot slots[] = {
#ifdef Py_GIL_DISABLED
    {Py_mod_gil, Py_MOD_GIL_NOT_USED},
#endif
    {0, NULL}
};

static PyMethodDef methods[] = {
    {"language_duckdb", _binding_language_duckdb, METH_NOARGS,
     "Get the tree-sitter language for the duckdb_sql dialect."},
    {NULL, NULL, 0, NULL}
};

static struct PyModuleDef module = {
    .m_base = PyModuleDef_HEAD_INIT,
    .m_name = "_binding_duckdb",
    .m_doc = NULL,
    .m_size = 0,
    .m_methods = methods,
    .m_slots = slots,
};

PyMODINIT_FUNC PyInit__binding_duckdb(void) {
    return PyModuleDef_Init(&module);
}
