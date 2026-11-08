#if defined(CBM_SQLGLOT_EMBEDDED) && CBM_SQLGLOT_EMBEDDED
/* Must precede libc headers; see CPython's embedding documentation. */
#include <Python.h>
#endif

#include "sqlglot_runtime.h"
#include "foundation/log.h"

#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>

#if defined(CBM_SQLGLOT_EMBEDDED) && CBM_SQLGLOT_EMBEDDED
#if defined(_WIN32)
#include <windows.h>
#elif defined(__APPLE__)
#include <mach-o/dyld.h>
#include <limits.h>
#include <sched.h>
#else
#include <limits.h>
#include <sched.h>
#include <unistd.h>
#endif

static CBMSqlglotApi g_api;
static _Atomic int g_state = 0; /* 0 uninitialized, 2 initializing, 1 ready, -1 unavailable */

static void sqlglot_yield(void) {
#if defined(_WIN32)
    (void)SwitchToThread();
#else
    (void)sched_yield();
#endif
}

static PyObject *sqlglot_attr(PyObject *module, const char *name) {
    if (!module) return NULL;
    PyObject *value = PyObject_GetAttrString(module, name);
    if (!value) PyErr_Clear();
    return value;
}

static void sqlglot_log_python_error(const char *stage) {
    PyObject *type = NULL;
    PyObject *value = NULL;
    PyObject *traceback = NULL;
    PyErr_Fetch(&type, &value, &traceback);
    PyErr_NormalizeException(&type, &value, &traceback);
    PyObject *text = value ? PyObject_Str(value) : NULL;
    const char *reason = text ? PyUnicode_AsUTF8(text) : NULL;
    cbm_log_error("sqlglot.runtime_failed", "stage", stage,
                  "reason", reason ? reason : "unknown Python error");
    Py_XDECREF(text);
    Py_XDECREF(traceback);
    Py_XDECREF(value);
    Py_XDECREF(type);
    if (PyErr_Occurred()) PyErr_Clear();
}

static void sqlglot_quiet_library_logging(void) {
    PyObject *logging = PyImport_ImportModule("logging");
    PyObject *logger = logging ? PyObject_CallMethod(logging, "getLogger", "s", "sqlglot")
                               : NULL;
    PyObject *result = logger ? PyObject_CallMethod(logger, "setLevel", "i", 50) : NULL;
    Py_XDECREF(result);
    Py_XDECREF(logger);
    Py_XDECREF(logging);
    if (PyErr_Occurred()) PyErr_Clear();
}

static bool sqlglot_load_api(void) {
    PyObject *sqlglot = PyImport_ImportModule("sqlglot");
    PyObject *exp = PyImport_ImportModule("sqlglot.expressions");
    PyObject *parser_module = PyImport_ImportModule("sqlglot.parser");
    PyObject *dialects = PyImport_ImportModule("sqlglot.dialects");
    if (!sqlglot || !exp || !parser_module || !dialects) {
        sqlglot_log_python_error("import");
        Py_XDECREF(sqlglot);
        Py_XDECREF(exp);
        Py_XDECREF(parser_module);
        Py_XDECREF(dialects);
        return false;
    }
    g_api.parse_one = sqlglot_attr(sqlglot, "parse_one");
    g_api.tokenize = sqlglot_attr(sqlglot, "tokenize");
    PyObject *parser = sqlglot_attr(parser_module, "Parser");
    g_api.statement_parsers = sqlglot_attr(parser, "STATEMENT_PARSERS");
    g_api.query_start_tokens = sqlglot_attr(parser, "SUBQUERY_TOKENS");
    PyObject *dialect = sqlglot_attr(dialects, "Dialect");
    g_api.dialect_classes = sqlglot_attr(dialect, "classes");
    g_api.query_type = sqlglot_attr(exp, "Query");
    g_api.dml_type = sqlglot_attr(exp, "DML");
    g_api.ddl_type = sqlglot_attr(exp, "DDL");
    g_api.create_type = sqlglot_attr(exp, "Create");
    g_api.command_type = sqlglot_attr(exp, "Command");
    g_api.condition_type = sqlglot_attr(exp, "Condition");
    g_api.like_property_type = sqlglot_attr(exp, "LikeProperty");
    g_api.table_type = sqlglot_attr(exp, "Table");
    g_api.column_type = sqlglot_attr(exp, "Column");
    g_api.identifier_type = sqlglot_attr(exp, "Identifier");
    g_api.cte_type = sqlglot_attr(exp, "CTE");
    g_api.subquery_type = sqlglot_attr(exp, "Subquery");
    g_api.select_type = sqlglot_attr(exp, "Select");
    g_api.set_operation_type = sqlglot_attr(exp, "SetOperation");
    g_api.alias_type = sqlglot_attr(exp, "Alias");
    Py_XDECREF(parser);
    Py_XDECREF(dialect);
    Py_DECREF(dialects);
    Py_DECREF(parser_module);
    Py_DECREF(sqlglot);
    Py_DECREF(exp);
    sqlglot_quiet_library_logging();
    return g_api.parse_one && g_api.tokenize && g_api.statement_parsers &&
           PyDict_Check(g_api.statement_parsers) && g_api.dialect_classes &&
           PyDict_Check(g_api.dialect_classes) && g_api.query_start_tokens &&
           PyAnySet_Check(g_api.query_start_tokens) &&
           g_api.query_type && g_api.dml_type && g_api.ddl_type && g_api.create_type &&
           g_api.command_type && g_api.condition_type && g_api.like_property_type &&
           g_api.table_type && g_api.column_type &&
           g_api.identifier_type && g_api.cte_type && g_api.subquery_type &&
           g_api.select_type && g_api.set_operation_type && g_api.alias_type;
}

/* The runtime ZIP is appended to the executable after link. zipimport accepts
 * a self-extracting-style prefix, so no Python installation, PYTHONPATH or
 * extracted sidecar is consulted at run time. */
static bool sqlglot_configure_executable(PyConfig *config) {
#if defined(_WIN32)
    wchar_t path[32768];
    DWORD n = GetModuleFileNameW(NULL, path, (DWORD)(sizeof(path) / sizeof(path[0])));
    if (!n || n >= sizeof(path) / sizeof(path[0])) return false;
    PyStatus status = PyConfig_SetString(config, &config->executable, path);
#else
    char path[PATH_MAX];
#if defined(__APPLE__)
    uint32_t size = (uint32_t)sizeof(path);
    if (_NSGetExecutablePath(path, &size) != 0) return false;
    size_t n = strlen(path);
#else
    ssize_t read = readlink("/proc/self/exe", path, sizeof(path) - 1);
    if (read <= 0 || (size_t)read >= sizeof(path)) return false;
    size_t n = (size_t)read;
    path[n] = '\0';
#endif
    (void)n;
    PyStatus status = PyConfig_SetBytesString(config, &config->executable, path);
#endif
    if (PyStatus_Exception(status) || !config->executable) return false;
    status = PyConfig_SetString(config, &config->base_executable, config->executable);
    if (PyStatus_Exception(status)) return false;
    config->module_search_paths_set = 1;
    status = PyWideStringList_Append(&config->module_search_paths, config->executable);
    return !PyStatus_Exception(status);
}

static void sqlglot_finalize(void) {
    if (atomic_load_explicit(&g_state, memory_order_acquire) != 1 || !Py_IsInitialized()) return;
    (void)PyGILState_Ensure();
    (void)Py_FinalizeEx();
    atomic_store_explicit(&g_state, -1, memory_order_release);
}

bool cbm_sqlglot_runtime_init(void) {
    int expected = 0;
    if (!atomic_compare_exchange_strong_explicit(&g_state, &expected, 2,
                                                  memory_order_acq_rel,
                                                  memory_order_acquire)) {
        while (expected == 2) {
            sqlglot_yield();
            expected = atomic_load_explicit(&g_state, memory_order_acquire);
        }
        return expected == 1;
    }

    /* cbm_init is a single-threaded startup boundary. Isolated configuration
     * ignores PYTHONPATH, user site packages and the machine's Python install.
     * The build supplies module_search_paths pointing at embedded resources. */
    PyConfig config;
    PyConfig_InitIsolatedConfig(&config);
    config.use_environment = 0;
    config.user_site_directory = 0;
    config.site_import = 0;
    config.write_bytecode = 0;
    config.install_signal_handlers = 0;
    config.parse_argv = 0;
    config.pathconfig_warnings = 0;

    if (!sqlglot_configure_executable(&config)) {
        cbm_log_error("sqlglot.runtime_failed", "stage", "configure_executable",
                      "reason", "could not configure executable search path");
        PyConfig_Clear(&config);
        atomic_store_explicit(&g_state, -1, memory_order_release);
        return false;
    }
    PyStatus status = Py_InitializeFromConfig(&config);
    if (PyStatus_Exception(status)) {
        cbm_log_error("sqlglot.runtime_failed", "stage", "initialize",
                      "function", status.func ? status.func : "unknown",
                      "reason", status.err_msg ? status.err_msg : "unknown initialization error");
        PyConfig_Clear(&config);
        atomic_store_explicit(&g_state, -1, memory_order_release);
        return false;
    }
    PyConfig_Clear(&config);
    if (!sqlglot_load_api()) {
        cbm_log_error("sqlglot.runtime_failed", "stage", "load_api",
                      "reason", "required SQLGlot API is unavailable");
        (void)Py_FinalizeEx();
        atomic_store_explicit(&g_state, -1, memory_order_release);
        return false;
    }
    atomic_store_explicit(&g_state, 1, memory_order_release);
    (void)atexit(sqlglot_finalize);
    /* Release the startup thread's GIL. Worker calls use PyGILState_Ensure. */
    PyEval_SaveThread();
    return true;
}

bool cbm_sqlglot_runtime_available(void) {
    return atomic_load_explicit(&g_state, memory_order_acquire) == 1;
}

bool cbm_sqlglot_enter(CBMSqlglotGilState *state, const CBMSqlglotApi **api) {
    if (!state || !api || !cbm_sqlglot_runtime_init()) return false;
    PyGILState_STATE gil = PyGILState_Ensure();
    *state = (int)gil;
    *api = &g_api;
    return true;
}

void cbm_sqlglot_leave(CBMSqlglotGilState state) {
    PyGILState_Release((PyGILState_STATE)state);
}

PyObject *cbm_sqlglot_parse(const CBMSqlglotApi *api, const char *sql, size_t len,
                            const char *dialect) {
    if (!api || !api->parse_one || !sql) return NULL;
    PyObject *text = PyUnicode_DecodeUTF8(sql, (Py_ssize_t)len, "replace");
    PyObject *args = text ? PyTuple_Pack(1, text) : NULL;
    PyObject *kwargs = PyDict_New();
    PyObject *read = dialect && dialect[0] ? PyUnicode_FromString(dialect) : NULL;
    if (!text || !args || !kwargs || (read && PyDict_SetItemString(kwargs, "read", read) < 0)) {
        Py_XDECREF(read); Py_XDECREF(kwargs); Py_XDECREF(args); Py_XDECREF(text);
        PyErr_Clear();
        return NULL;
    }
    PyObject *tree = PyObject_Call(api->parse_one, args, kwargs);
    Py_XDECREF(read);
    Py_DECREF(kwargs);
    Py_DECREF(args);
    Py_DECREF(text);
    if (!tree) PyErr_Clear();
    return tree;
}

bool cbm_sqlglot_maybe_statement(const CBMSqlglotApi *api, const char *sql, size_t len,
                                 const char *dialect, bool any_position) {
    if (!api || !api->tokenize || !api->statement_parsers || !sql) return false;
    PyObject *text = PyUnicode_DecodeUTF8(sql, (Py_ssize_t)len, "replace");
    PyObject *args = text ? PyTuple_Pack(1, text) : NULL;
    PyObject *kwargs = PyDict_New();
    PyObject *read = dialect && dialect[0] ? PyUnicode_FromString(dialect) : NULL;
    if (!text || !args || !kwargs || (read && PyDict_SetItemString(kwargs, "read", read) < 0)) {
        Py_XDECREF(read); Py_XDECREF(kwargs); Py_XDECREF(args); Py_XDECREF(text);
        PyErr_Clear();
        return false;
    }
    PyObject *tokens = PyObject_Call(api->tokenize, args, kwargs);
    /* Use the selected dialect's registrations, including its opaque commands.
     * The base Parser omits EXPORT, ATTACH, EXEC and other dialect extensions. */
    PyObject *dialect_class = PyDict_GetItemString(api->dialect_classes,
                                                   dialect ? dialect : "");
    PyObject *parser_class = dialect_class ? sqlglot_attr(dialect_class, "parser_class") : NULL;
    PyObject *tokenizer_class = dialect_class ? sqlglot_attr(dialect_class, "tokenizer_class") : NULL;
    PyObject *statements = parser_class ? sqlglot_attr(parser_class, "STATEMENT_PARSERS") : NULL;
    PyObject *commands = tokenizer_class ? sqlglot_attr(tokenizer_class, "COMMANDS") : NULL;
    Py_XDECREF(read);
    Py_DECREF(kwargs);
    Py_DECREF(args);
    Py_DECREF(text);
    PyObject *it = tokens ? PyObject_GetIter(tokens) : NULL;
    PyObject *token;
    bool found = false;
    while (it && (token = PyIter_Next(it))) {
        PyObject *type = PyObject_GetAttrString(token, "token_type");
        if (!type) PyErr_Clear();
        if (type && (PyDict_Contains(statements ? statements : api->statement_parsers, type) == 1 ||
                     (commands && PySet_Contains(commands, type) == 1) ||
                     PySet_Contains(api->query_start_tokens, type) == 1)) found = true;
        /* Some query roots are dispatched inline instead of being registered
         * (e.g. VALUES/SUMMARIZE). Recognize their keyword-to-AST correspondence
         * from SQLGlot itself, without another operation allowlist. Never use
         * scalar expressions (NULL, function calls, etc.) as statement evidence. */
        PyObject *type_name = type ? sqlglot_attr(type, "name") : NULL;
        const char *type_text = type_name && PyUnicode_Check(type_name)
                                    ? PyUnicode_AsUTF8(type_name) : NULL;
        if (!found && type_text && !any_position &&
            strcmp(type_text, "VAR") != 0 && strcmp(type_text, "IDENTIFIER") != 0 &&
            strcmp(type_text, "STRING") != 0 && strcmp(type_text, "NUMBER") != 0) {
            PyObject *root = cbm_sqlglot_parse(api, sql, len, dialect);
            if (root && PyObject_IsInstance(root, api->condition_type) == 0) {
                PyObject *key = sqlglot_attr(root, "key");
                PyObject *upper = key ? PyObject_CallMethod(key, "upper", NULL) : NULL;
                PyObject *name = sqlglot_attr(type, "name");
                if (upper && name && PyObject_RichCompareBool(upper, name, Py_EQ) == 1)
                    found = true;
                Py_XDECREF(name); Py_XDECREF(upper); Py_XDECREF(key);
            }
            Py_XDECREF(root);
        }
        Py_XDECREF(type_name);
        Py_XDECREF(type);
        Py_DECREF(token);
        if (found || !any_position) break;
    }
    if (PyErr_Occurred()) PyErr_Clear();
    Py_XDECREF(it);
    Py_XDECREF(tokens);
    Py_XDECREF(statements); Py_XDECREF(commands);
    Py_XDECREF(parser_class); Py_XDECREF(tokenizer_class);
    return found;
}

#else

bool cbm_sqlglot_runtime_init(void) { return false; }
bool cbm_sqlglot_runtime_available(void) { return false; }
bool cbm_sqlglot_enter(CBMSqlglotGilState *state, const CBMSqlglotApi **api) {
    (void)state; (void)api; return false;
}
void cbm_sqlglot_leave(CBMSqlglotGilState state) { (void)state; }
PyObject *cbm_sqlglot_parse(const CBMSqlglotApi *api, const char *sql, size_t len,
                            const char *dialect) {
    (void)api; (void)sql; (void)len; (void)dialect; return NULL;
}
bool cbm_sqlglot_maybe_statement(const CBMSqlglotApi *api, const char *sql, size_t len,
                                 const char *dialect, bool any_position) {
    (void)api; (void)sql; (void)len; (void)dialect; (void)any_position; return false;
}

#endif
