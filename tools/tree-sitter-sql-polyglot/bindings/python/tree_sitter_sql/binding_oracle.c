#include <Python.h>

typedef struct TSLanguage TSLanguage;

TSLanguage *tree_sitter_oracle_sql(void);

static PyObject* _binding_language_oracle(PyObject *Py_UNUSED(self), PyObject *Py_UNUSED(args)) {
    return PyCapsule_New(tree_sitter_oracle_sql(), "tree_sitter.Language", NULL);
}

static struct PyModuleDef_Slot slots[] = {
#ifdef Py_GIL_DISABLED
    {Py_mod_gil, Py_MOD_GIL_NOT_USED},
#endif
    {0, NULL}
};

static PyMethodDef methods[] = {
    {"language_oracle", _binding_language_oracle, METH_NOARGS,
     "Get the tree-sitter language for the oracle_sql dialect."},
    {NULL, NULL, 0, NULL}
};

static struct PyModuleDef module = {
    .m_base = PyModuleDef_HEAD_INIT,
    .m_name = "_binding_oracle",
    .m_doc = NULL,
    .m_size = 0,
    .m_methods = methods,
    .m_slots = slots,
};

PyMODINIT_FUNC PyInit__binding_oracle(void) {
    return PyModuleDef_Init(&module);
}
