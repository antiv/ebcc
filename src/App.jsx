import React, { useState, useEffect, useMemo, useRef } from 'react';
import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import Papa from 'papaparse';
import { DEFAULT_MAPPINGS, INITIAL_SCHEMA } from './constants';
import DataTable from './components/DataTable';
import EditRowModal from './components/EditRowModal';
import ConfirmModal from './components/ConfirmModal';
import MapModal from './components/MapModal';
import QueryBuilderModal from './components/QueryBuilderModal';
import { getLatLonIndices } from './utils/helpers';

// Get APP_MODE for filename generation
const APP_MODE = import.meta.env.VITE_APP_MODE || 'ebcc';

function App() {
    const [db, setDb] = useState(null);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);
    const [fileName, setFileName] = useState("");
    const [sqlInstance, setSqlInstance] = useState(null);
    const [activeTab, setActiveTab] = useState("dashboard");
    const [mappings, setMappings] = useState(DEFAULT_MAPPINGS);
    const [csvFile, setCsvFile] = useState(null);
    const [targetTable, setTargetTable] = useState("shumske");
    const [isProcessing, setIsProcessing] = useState(false);
    const [importLog, setImportLog] = useState([]);
    const [viewerTable, setViewerTable] = useState("shumske");
    const [viewerData, setViewerData] = useState([]);
    const [viewerColumns, setViewerColumns] = useState([]);
    const [viewerLoading, setViewerLoading] = useState(false);
    const [settingsTable, setSettingsTable] = useState("shumske");
    const [tempMappings, setTempMappings] = useState(null);
    const [query, setQuery] = useState("");
    const [queryResults, setQueryResults] = useState(null);
    const [lastUsedFile, setLastUsedFile] = useState(localStorage.getItem("lastBioDb") || "");
    const [dbTables, setDbTables] = useState([]); // List of all tables
    const [newTableFile, setNewTableFile] = useState(null);
    const [newTableName, setNewTableName] = useState("");
    const [editingRow, setEditingRow] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: "", message: "", onConfirm: null });
    const [mapModal, setMapModal] = useState({ isOpen: false, lat: 0, lon: 0 });
    const [columnRoles, setColumnRoles] = useState({}); // { tableName: { lat: "col1", lon: "col2" } }
    const [mainTables, setMainTables] = useState([]); // List of tables marked as main
    const [isQueryBuilderOpen, setIsQueryBuilderOpen] = useState(false);
    const [savedQueries, setSavedQueries] = useState([]);
    const [showSaveQueryDialog, setShowSaveQueryDialog] = useState(false);
    const [queryName, setQueryName] = useState('');
    const [editingQueryId, setEditingQueryId] = useState(null);
    const [editingQueryName, setEditingQueryName] = useState('');

    useEffect(() => {
        const init = async () => {
            try {
                const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
                setSqlInstance(SQL);
            } catch (err) { setError("Greška pri učitavanju SQL biblioteke: " + err.message); }
        };
        init();
    }, []);

    useEffect(() => {
        const handleBeforeUnload = (e) => { if (db) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [db]);

    // Handle empty mappings case (biodata mode) - auto-select "New Table"
    useEffect(() => {
        const mappingKeys = Object.keys(mappings);
        if (mappingKeys.length === 0) {
            // No default tables, set all selectors to "New Table" option
            setTargetTable("__NEW_TABLE__");
            setViewerTable("__NEW_TABLE__");
            setSettingsTable("__NEW_TABLE__");
        } else if (!mappingKeys.includes(targetTable)) {
            // Current selection doesn't exist, select first available
            setTargetTable(mappingKeys[0]);
            if (!mappingKeys.includes(viewerTable)) setViewerTable(mappingKeys[0]);
            if (!mappingKeys.includes(settingsTable)) setSettingsTable(mappingKeys[0]);
        }
    }, [mappings]);

    // Auto-dismiss success messages after 5 seconds
    useEffect(() => {
        if (successMsg) {
            const timer = setTimeout(() => {
                setSuccessMsg(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [successMsg]);

    // Auto-dismiss error messages after 5 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => {
                setError(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const initializeDatabase = (newDb) => {
        // 0. Init Main Tables if not exist
        try {
            newDb.exec(INITIAL_SCHEMA);
        } catch (e) {
            console.error("Error initializing schema:", e);
            setError("Greška pri inicijalizaciji šeme: " + e.message);
        }

        // 1. Init History Table
        newDb.exec(`
            CREATE TABLE IF NOT EXISTS app_import_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                target_table TEXT NOT NULL,
                import_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                row_count INTEGER
            );
        `);
        try { newDb.exec("ALTER TABLE app_import_history ADD COLUMN backup_table_name TEXT"); } catch (e) { }

        // 2. Init Saved Queries Table
        newDb.exec(`
            CREATE TABLE IF NOT EXISTS app_saved_queries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                sql TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. Init Config
        newDb.exec(`CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT);`);
        const configRes = newDb.exec("SELECT value FROM app_config WHERE key = 'mappings'");
        if (configRes.length > 0) {
            try {
                const rawValue = configRes[0].values[0][0];
                const config = JSON.parse(rawValue);
                
                // Check if mappings is directly in config or nested
                let loadedMappings;
                if (config.mappings && typeof config.mappings === 'object') {
                    loadedMappings = config.mappings;
                } else if (config.ostale_vrste || Object.keys(config).some(key => !['mappings', 'column_roles', 'main_tables'].includes(key))) {
                    // If config has direct table keys, it might be the old format
                    // Extract all keys that are not metadata keys
                    const tableKeys = Object.keys(config).filter(key => 
                        !['mappings', 'column_roles', 'main_tables'].includes(key) && 
                        typeof config[key] === 'object'
                    );
                    if (tableKeys.length > 0) {
                        // Old format - config itself is mappings
                        loadedMappings = {};
                        tableKeys.forEach(key => {
                            loadedMappings[key] = config[key];
                        });
                        // Also include config.mappings if it exists
                        if (config.mappings) {
                            loadedMappings = { ...loadedMappings, ...config.mappings };
                        }
                    } else {
                        loadedMappings = config.mappings || DEFAULT_MAPPINGS;
                    }
                } else {
                    loadedMappings = config.mappings || DEFAULT_MAPPINGS;
                }
                
                // Ensure mappings is an object, not null or undefined
                if (loadedMappings && typeof loadedMappings === 'object') {
                    setMappings(loadedMappings);
                    setColumnRoles(config.column_roles || {});
                    setMainTables(config.main_tables || Object.keys(loadedMappings));
                } else {
                    setMappings(DEFAULT_MAPPINGS);
                    setColumnRoles({});
                    setMainTables(Object.keys(DEFAULT_MAPPINGS));
                }
            } catch (e) {
                setMappings(DEFAULT_MAPPINGS);
                setColumnRoles({});
                setMainTables(Object.keys(DEFAULT_MAPPINGS));
            }
        } else {
            const initialConfig = { mappings: DEFAULT_MAPPINGS, column_roles: {}, main_tables: Object.keys(DEFAULT_MAPPINGS) };
            const stmt = newDb.prepare("INSERT INTO app_config (key, value) VALUES (?, ?)");
            stmt.run(['mappings', JSON.stringify(initialConfig)]);
            stmt.free();
            setMappings(DEFAULT_MAPPINGS);
            setColumnRoles({});
            setMainTables(Object.keys(DEFAULT_MAPPINGS));
        }
        refreshImportLog(newDb);
        loadSavedQueriesFromDb(newDb);
    };

    const loadSavedQueriesFromDb = (database) => {
        if (!database) return;
        try {
            const res = database.exec("SELECT id, name, sql, created_at FROM app_saved_queries ORDER BY created_at DESC");
            if (res.length > 0) {
                const queries = res[0].values.map(row => ({
                    id: row[0],
                    name: row[1],
                    sql: row[2],
                    createdAt: row[3]
                }));
                setSavedQueries(queries);
            } else {
                setSavedQueries([]);
            }
        } catch (e) {
            console.error('Error loading saved queries from DB:', e);
            setSavedQueries([]);
        }
    };

    const migrateQueriesFromLocalStorage = (database) => {
        if (!database) return;
        try {
            const saved = localStorage.getItem('savedQueries');
            if (saved) {
                const queries = JSON.parse(saved);
                if (queries.length > 0) {
                    // Check if there are already queries in DB
                    const existingRes = database.exec("SELECT COUNT(*) as cnt FROM app_saved_queries");
                    const existingCount = existingRes.length > 0 ? existingRes[0].values[0][0] : 0;
                    
                    if (existingCount === 0) {
                        // Migrate from localStorage to DB
                        const stmt = database.prepare("INSERT INTO app_saved_queries (name, sql, created_at) VALUES (?, ?, ?)");
                        queries.forEach(query => {
                            stmt.run([query.name, query.sql, query.createdAt || new Date().toISOString()]);
                        });
                        stmt.free();
                        // Clear localStorage after migration
                        localStorage.removeItem('savedQueries');
                        // Reload from DB
                        loadSavedQueriesFromDb(database);
                    }
                }
            }
        } catch (e) {
            console.error('Error migrating queries from localStorage:', e);
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setFileName(file.name);
        localStorage.setItem("lastBioDb", file.name);
        setLastUsedFile(file.name);
        setError(null);
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const uInt8Array = new Uint8Array(reader.result);
                const newDb = new sqlInstance.Database(uInt8Array);
                setDb(newDb);

                initializeDatabase(newDb);

                setSuccessMsg("Baza uspešno učitana.");
            } catch (err) { setError("Nije moguće otvoriti bazu."); }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleCreateEmptyDb = () => {
        if (!sqlInstance) return;
        try {
            const newDb = new sqlInstance.Database();
            setDb(newDb);
            setFileName("nova_baza.db");
            initializeDatabase(newDb);
            setSuccessMsg("Nova prazna baza je uspešno kreirana.");
        } catch (err) {
            setError("Greška pri kreiranju nove baze: " + err.message);
        }
    };

    const resetDatabase = () => {
        if (confirm("Da li ste sigurni da želite da zatvorite bazu? Nesačuvane izmene će biti izgubljene.")) {
            setDb(null); setFileName(""); setViewerData([]); setQueryResults(null); setActiveTab("dashboard");
        }
    };

    const refreshImportLog = (database) => {
        try {
            const res = database.exec("SELECT id, filename, target_table, import_date, row_count, backup_table_name FROM app_import_history ORDER BY import_date DESC");
            if (res.length > 0) setImportLog(res[0].values);
            else setImportLog([]);
        } catch (e) { console.log("No audit table yet"); }
    };

    const fetchDbTables = () => {
        if (!db) return;
        try {
            // Fetch all tables
            const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
            if (res.length > 0) {
                setDbTables(res[0].values.map(r => r[0]));
            } else {
                setDbTables([]);
            }
        } catch (e) { setError("Greška pri učitavanju liste tabela: " + e.message); }
    };

    const handleDropTable = (tableName) => {
        if (confirm(`Da li ste sigurni da želite trajno da obrišete tabelu '${tableName}'?
Ova akcija je nepovratna!`)) {
            try {
                db.exec(`DROP TABLE "${tableName}"`);
                setSuccessMsg(`Tabela '${tableName}' je uspešno obrisana.`);
                fetchDbTables(); // Refresh list
            } catch (e) {
                setError("Greška pri brisanju tabele: " + e.message);
            }
        }
    };

    const openInSql = (tableName) => {
        const sql = `SELECT * FROM "${tableName}" LIMIT 100;`;
        setQuery(sql);
        setActiveTab('sql');
        // Automatski izvrši upit (koristimo setTimeout da se osiguramo da je tab promenjen)
        setTimeout(() => {
            execQuery(sql);
        }, 100);
    };

    useEffect(() => {
        if (activeTab === 'database' || activeTab === 'sql') fetchDbTables();
    }, [activeTab, db]);

    useEffect(() => {
        if (db) {
            loadSavedQueriesFromDb(db);
            migrateQueriesFromLocalStorage(db);
        }
    }, [db]);

    const saveQuery = () => {
        if (!db) {
            setError('Baza nije učitana.');
            return;
        }
        if (!queryName.trim() || !query.trim()) {
            setError('Molimo unesite naziv upita.');
            return;
        }

        try {
            const stmt = db.prepare("INSERT INTO app_saved_queries (name, sql, created_at) VALUES (?, ?, ?)");
            const createdAt = new Date().toISOString();
            stmt.run([queryName.trim(), query, createdAt]);
            stmt.free();

            const newQuery = {
                id: db.exec("SELECT last_insert_rowid()")[0].values[0][0],
                name: queryName.trim(),
                sql: query,
                createdAt: createdAt
            };

            setSavedQueries([...savedQueries, newQuery]);
            setQueryName('');
            setShowSaveQueryDialog(false);
            setSuccessMsg('Upit uspešno sačuvan!');
        } catch (e) {
            console.error('Error saving query:', e);
            setError('Greška pri čuvanju upita: ' + e.message);
        }
    };

    const deleteQuery = (id) => {
        if (!db) {
            setError('Baza nije učitana.');
            return;
        }
        if (confirm('Da li ste sigurni da želite da obrišete ovaj upit?')) {
            try {
                const stmt = db.prepare("DELETE FROM app_saved_queries WHERE id = ?");
                stmt.run([id]);
                stmt.free();

                const updated = savedQueries.filter(q => q.id !== id);
                setSavedQueries(updated);
                setSuccessMsg('Upit uspešno obrisan.');
            } catch (e) {
                console.error('Error deleting query:', e);
                setError('Greška pri brisanju upita: ' + e.message);
            }
        }
    };

    const startEditingQuery = (query) => {
        setEditingQueryId(query.id);
        setEditingQueryName(query.name);
    };

    const saveEditedQuery = (id) => {
        if (!db) {
            setError('Baza nije učitana.');
            return;
        }
        if (!editingQueryName.trim()) {
            setError('Naziv upita ne može biti prazan.');
            return;
        }

        try {
            const stmt = db.prepare("UPDATE app_saved_queries SET name = ? WHERE id = ?");
            stmt.run([editingQueryName.trim(), id]);
            stmt.free();

            const updated = savedQueries.map(q => 
                q.id === id ? { ...q, name: editingQueryName.trim() } : q
            );
            setSavedQueries(updated);
            setEditingQueryId(null);
            setEditingQueryName('');
            setSuccessMsg('Naziv upita uspešno izmenjen.');
        } catch (e) {
            console.error('Error updating query:', e);
            setError('Greška pri izmeni naziva upita: ' + e.message);
        }
    };

    const cancelEditingQuery = () => {
        setEditingQueryId(null);
        setEditingQueryName('');
    };

    const loadQuery = (savedQuery) => {
        setQuery(savedQuery.sql);
        setShowSaveQueryDialog(false);
        setQueryName('');
        // Just load the query, don't execute automatically
    };

    const handleUndoImport = (row) => {
        const [id, filename, target_table, import_date, row_count, backup_table_name] = row;
        if (!backup_table_name) return alert("Nije moguće poništiti ovaj uvoz jer naziv backup tabele nije sačuvan.");
        if (!confirm(`PAŽNJA: Ovo će obrisati ${row_count} redova iz tabele '${target_table}' koji su uvezeni iz fajla '${filename}'.

Da li ste sigurni da želite da nastavite?`)) return;

        try {
            const checkTable = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${backup_table_name}'`);
            if (checkTable.length === 0) throw new Error(`Backup tabela '${backup_table_name}' više ne postoji u bazi. Nemoguće izvršiti automatsko brisanje.`);

            const mapping = mappings[target_table];
            if (!mapping) throw new Error("Nema mapiranja za ovu tabelu.");

            const backupColsRes = db.exec(`PRAGMA table_info("${backup_table_name}")`);
            const backupCols = backupColsRes[0].values.map(r => r[1]);

            let joinConditions = [];
            for (const [dbCol, csvOptions] of Object.entries(mapping)) {
                const match = backupCols.find(c => csvOptions.includes(c));
                if (match) joinConditions.push(`main_tbl."${dbCol}" = backup_tbl."${match}"`);
            }

            if (joinConditions.length === 0) throw new Error("Nije moguće utvrditi parove kolona za brisanje.");

            const deleteQuery = `DELETE FROM ${target_table} WHERE rowid IN (SELECT main_tbl.rowid FROM ${target_table} AS main_tbl INNER JOIN "${backup_table_name}" AS backup_tbl ON ${joinConditions.join(" AND ")})`;

            db.exec("BEGIN TRANSACTION");
            db.exec(deleteQuery);
            db.run("DELETE FROM app_import_history WHERE id = ?", [id]);
            db.exec(`DROP TABLE IF EXISTS "${backup_table_name}"`);
            db.exec("COMMIT");

            setSuccessMsg("Uvoz uspešno poništen. Podaci su obrisani iz glavne tabele i zapis je uklonjen iz istorije.");
            refreshImportLog(db);
        } catch (err) {
            db.exec("ROLLBACK");
            setError("Greška pri poništavanju uvoza: " + err.message);
        }
    };

    useEffect(() => {
        if (mappings && settingsTable) {
            const currentMappings = mappings[settingsTable] || {};
            // Convert arrays to comma-separated strings for editing
            const stringMappings = {};
            Object.keys(currentMappings).forEach(col => {
                const val = currentMappings[col];
                stringMappings[col] = Array.isArray(val) ? val.join(", ") : val;
            });
            setTempMappings(stringMappings);
        }
    }, [mappings, settingsTable]);
    const handleMappingChange = (dbCol, val) => {
        setTempMappings(prev => ({ ...prev, [dbCol]: val }));
    };
    const handleSaveSettings = () => {
        if (!db) return;
        try {
            // Convert string values back to arrays for mappings
            const processedMappings = {};
            Object.keys(tempMappings).forEach(col => {
                const val = tempMappings[col];
                if (typeof val === 'string') {
                    processedMappings[col] = val.split(",").map(s => s.trim()).filter(s => s !== "");
                } else {
                    processedMappings[col] = val;
                }
            });

            const newMappings = { ...mappings, [settingsTable]: processedMappings };
            setMappings(newMappings);

            // Prepare combined config object
            const configToSave = {
                mappings: newMappings,
                column_roles: columnRoles,
                main_tables: mainTables
            };

            db.exec("BEGIN TRANSACTION");
            const stmt = db.prepare("UPDATE app_config SET value = ? WHERE key = 'mappings'");
            stmt.run([JSON.stringify(configToSave)]);
            stmt.free();
            db.exec("COMMIT");
            setSuccessMsg("Podešavanja su uspešno sačuvana u bazu!");
        } catch (err) { setError("Greška pri čuvanju podešavanja: " + err.message); }
    };

    const fetchViewerData = () => {
        if (!db) return;
        setViewerLoading(true); setError(null);
        try {
            const colRes = db.exec(`SELECT * FROM ${viewerTable} LIMIT 1`);
            const cols = colRes.length > 0 ? colRes[0].columns : [];
            // Ensure rowid is fetched but maybe handled specially in UI if needed
            // We will fetch rowid explicitly to be sure
            const dataRes = db.exec(`SELECT rowid, * FROM ${viewerTable}`);
            if (dataRes.length > 0) {
                const values = dataRes[0].values;
                const columnsWithId = ["rowid", ...cols];
                setViewerColumns(columnsWithId);
                setViewerData(values);
            } else {
                setViewerData([]);
                setViewerColumns(["rowid", ...cols]);
            }
        } catch (err) { if (err.message.includes("no such table")) { setViewerData([]); setViewerColumns([]); } else setError("Greška pri učitavanju tabele: " + err.message); } finally { setViewerLoading(false); }
    };
    useEffect(() => { if (activeTab === 'viewer') fetchViewerData(); }, [activeTab, viewerTable, db]);

    const handleCsvUpload = (e) => { setCsvFile(e.target.files[0]); setSuccessMsg(null); setError(null); };

    // Helper function to preprocess CSV and find the header line
    const preprocessCsv = (file, callback) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split(/\r?\n/);

            // Find the first line that looks like a CSV header
            // Must have multiple non-empty values separated by commas
            let headerLineIndex = 0;
            for (let i = 0; i < Math.min(10, lines.length); i++) {
                const line = lines[i].trim();

                // Skip completely empty lines
                if (!line) continue;

                // Split by comma and count non-empty values
                const values = line.split(',').map(v => v.trim().replace(/^"(.*)"$/, '$1'));
                const nonEmptyCount = values.filter(v => v.length > 0).length;

                // A valid header should have at least 3 non-empty column names
                // and most values should be non-empty (at least 50%)
                if (nonEmptyCount >= 3 && nonEmptyCount / values.length >= 0.5) {
                    headerLineIndex = i;
                    break;
                }
            }

            // Create cleaned CSV starting from header line
            const cleanedCsv = lines.slice(headerLineIndex).join('\n');
            const blob = new Blob([cleanedCsv], { type: 'text/csv' });
            callback(blob);
        };
        reader.readAsText(file);
    };
    const processImport = (overrideTableName = null, overrideMappings = null) => {
        const tableToUse = overrideTableName || targetTable;
        const mappingsToUse = overrideMappings || mappings;
        if (!db || !csvFile || !tableToUse) return;
        const checkRes = db.exec(`SELECT count(*) as cnt FROM app_import_history WHERE filename = '${csvFile.name}' AND target_table = '${tableToUse}'`);
        if (checkRes[0].values[0][0] > 0) { setError(`UPOZORENJE: Fajl '${csvFile.name}' je već uvezen u tabelu '${tableToUse}'!`); return; }
        setIsProcessing(true);
        preprocessCsv(csvFile, (cleanedFile) => {
            Papa.parse(cleanedFile, {
                header: true, skipEmptyLines: true,
                complete: function (results) {
                    try {
                        db.exec("BEGIN TRANSACTION"); // Start transaction right away
                        const data = results.data;
                        const headers = results.meta.fields;
                        const tempTableName = "import_" + csvFile.name.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30) + "_" + Date.now(); // Unique name

                        const createCols = headers.map(h => `"${h}" TEXT`).join(", ");
                        db.exec(`CREATE TABLE "${tempTableName}" (${createCols})`);

                        const stmt = db.prepare(`INSERT INTO "${tempTableName}" VALUES (${headers.map(() => '?').join(',')})`);
                        data.forEach(row => { stmt.run(headers.map(h => row[h])); });
                        stmt.free();

                        const targetMap = mappingsToUse[tableToUse];
                        let targetCols = [], selectCols = [];
                        if (!targetMap) throw new Error("Mapiranje za ovu tabelu nije definisano.");
                        for (const [dbCol, csvOptions] of Object.entries(targetMap)) {
                            const match = headers.find(h => csvOptions.includes(h));
                            if (match) { targetCols.push(`"${dbCol}"`); selectCols.push(`"${match}"`); }
                        }
                        if (targetCols.length === 0) throw new Error("Nije pronađena nijedna odgovarajuća kolona za mapiranje!");

                        // VALIDACIJA
                        const totalTargetCols = Object.keys(targetMap).length;
                        const matchedCols = targetCols.length;
                        const matchPercent = Math.round((matchedCols / totalTargetCols) * 100);
                        if (matchPercent < 75) {
                            if (!confirm(`UPOZORENJE: Detektovano je poklapanje samo ${matchedCols} od ${totalTargetCols} kolona (${matchPercent}%) za tabelu '${tableToUse}'.

Velika je verovatnoća da pokušavate uvoz pogrešnog fajla ili da mapiranja nisu ispravna.

Da li sigurno želite da nastavite uvoz?`)) {
                                throw new Error("Uvoz otkazan od strane korisnika (loše poklapanje kolona).");
                            }
                        }

                        const finalSql = `INSERT INTO ${tableToUse} (${targetCols.join(", ")}) SELECT ${selectCols.join(", ")} FROM "${tempTableName}"`;
                        db.exec(finalSql);
                        db.run(`INSERT INTO app_import_history (filename, target_table, row_count, backup_table_name) VALUES (?, ?, ?, ?)`, [csvFile.name, tableToUse, data.length, tempTableName]);

                        db.exec("COMMIT"); // Commit at the very end

                        setSuccessMsg(`Uspešno uvezeno ${data.length} redova iz '${csvFile.name}' u tabelu '${tableToUse}'.`);
                        refreshImportLog(db);
                        setCsvFile(null);
                        setNewTableName(""); // Clear new table name after successful import
                    } catch (err) {
                        db.exec("ROLLBACK"); // Rollback on any error
                        setError("Greška pri importu: " + err.message);
                    } finally {
                        setIsProcessing(false);
                    }
                },
                error: (err) => { setError("Greška pri čitanju CSV-a: " + err.message); setIsProcessing(false); }
            });
        });
    };

    const handleImport = () => {
        if (!csvFile) {
            setError("Molimo izaberite CSV fajl.");
            return;
        }

        if (targetTable === "__NEW_TABLE__") {
            if (!newTableName) {
                setError("Molimo unesite naziv nove tabele.");
                return;
            }
            if (!/^[a-zA-Z0-9_]+$/.test(newTableName)) {
                setError("Naziv tabele sme sadržati samo slova, brojeve i donju crtu.");
                return;
            }
            // Create table first, then import
            handleTableCreationFromCsv(true); // true = proceed to import after creation
        } else {
            // Just import
            processImport();
        }
    };

    const handleTableCreationFromCsv = (proceedToImport = false) => {
        // Use csvFile instead of newTableFile since we merged the inputs
        const fileToParse = csvFile;

        if (!fileToParse || !newTableName) {
            setError("Molimo izaberite fajl i unesite naziv tabele.");
            return;
        }

        // Basic validation for table name (alphanumeric + underscore)
        if (!/^[a-zA-Z0-9_]+$/.test(newTableName)) {
            setError("Naziv tabele sme sadržati samo slova, brojeve i donju crtu.");
            return;
        }

        preprocessCsv(fileToParse, (cleanedFile) => {
            Papa.parse(cleanedFile, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    if (results.data.length === 0) {
                        setError("CSV fajl je prazan.");
                        return;
                    }

                    const headers = results.meta.fields;
                    if (!headers || headers.length === 0) {
                        setError("Nije moguće detektovati kolone u CSV fajlu.");
                        return;
                    }

                    // Infer types from the first row (or first few rows)
                    const firstRow = results.data[0];
                    const columnDefs = headers.map(header => {
                        const val = firstRow[header];
                        let type = "TEXT";
                        if (val !== null && val !== undefined && val !== "") {
                            if (!isNaN(Number(val))) {
                                if (Number.isInteger(Number(val))) type = "INTEGER";
                                else type = "REAL";
                            }
                        }
                        // Sanitize column name
                        const safeColName = header.trim().replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
                        return { original: header, name: safeColName, type };
                    });

                    // Create Table SQL
                    const createTableSql = `CREATE TABLE IF NOT EXISTS ${newTableName} (${columnDefs.map(c => `${c.name} ${c.type}`).join(", ")});`;

                    try {
                        db.exec(createTableSql);

                        // Update Mappings
                        const newMapping = {};
                        columnDefs.forEach(c => {
                            newMapping[c.name] = [c.original, c.name]; // Default mapping
                        });

                        const updatedMappings = { ...mappings, [newTableName]: newMapping };
                        setMappings(updatedMappings);

                        // Persist Mappings
                        db.exec("BEGIN TRANSACTION");
                        const stmt = db.prepare("UPDATE app_config SET value = ? WHERE key = 'mappings'");
                        stmt.run([JSON.stringify({ mappings: updatedMappings, column_roles: columnRoles, main_tables: [...mainTables, newTableName] })]);
                        stmt.free();
                        db.exec("COMMIT");

                        setMappings(updatedMappings);
                        setMainTables([...mainTables, newTableName]);
                        if (proceedToImport) {
                            // Pass the updated mappings directly to avoid state race condition
                            processImport(newTableName, updatedMappings);
                        } else {
                            setSuccessMsg(`Tabela '${newTableName}' je uspešno kreirana!`);
                            setNewTableName("");
                        }
                        fetchDbTables(); // Refresh table list
                    } catch (err) {
                        setError("Greška pri kreiranju tabele: " + err.message);
                    }
                },
                error: (err) => {
                    setError("Greška pri parsiranju CSV-a: " + err.message);
                }
            });
        });
    };

    const handleDownloadDb = () => {
        if (!db) return;

        // Generate filename: {mode}_ddmmyyyy_hhmm.db
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const dateStr = `${day}${month}${year}`;
        const timeStr = `${hours}${minutes}`;
        const filename = `${APP_MODE}_${dateStr}_${timeStr}.db`;

        const data = db.export();
        const blob = new Blob([data], { type: 'application/x-sqlite3' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    };

    const handleDeleteRow = (row) => {
        setConfirmModal({
            isOpen: true,
            title: "Brisanje Reda",
            message: "Da li ste sigurni da želite da obrišete ovaj red? Ova akcija je nepovratna.",
            onConfirm: () => {
                try {
                    const id = row[0];
                    db.exec(`DELETE FROM ${viewerTable} WHERE rowid = ${id}`);
                    setSuccessMsg("Red uspešno obrisan.");
                    fetchViewerData();
                } catch (err) {
                    setError("Greška pri brisanju reda: " + err.message);
                }
                setConfirmModal({ ...confirmModal, isOpen: false });
            }
        });
    };

    const handleEditRow = (row) => {
        setEditingRow(row);
        setIsEditModalOpen(true);
    };

    const handleSaveRow = (updatedValues) => {
        try {
            const id = editingRow[0]; // rowid is first
            const updates = [];
            const params = [];

            // Skip rowid (index 0)
            viewerColumns.slice(1).forEach((col, index) => {
                updates.push(`"${col}" = ?`);
                params.push(updatedValues[col]);
            });

            const sql = `UPDATE ${viewerTable} SET ${updates.join(", ")} WHERE rowid = ?`;
            params.push(id);

            const stmt = db.prepare(sql);
            stmt.run(params);
            stmt.free();

            setSuccessMsg("Red uspešno izmenjen.");
            setIsEditModalOpen(false);
            setEditingRow(null);
            fetchViewerData();
        } catch (err) {
            setError("Greška pri čuvanju izmena: " + err.message);
        }
    };

    // Ažurirana execQuery da prihvata SQL argument
    const execQuery = (sqlToRun = query) => {
        if (!db || !sqlToRun) return;
        try {
            const res = db.exec(sqlToRun);
            setQueryResults(res);
            setError(null);
            // Don't auto-show save dialog - user must click the button
        } catch (err) {
            setError(err.message);
            setQueryResults(null);
            setShowSaveQueryDialog(false);
        }
    };

    if (!sqlInstance) return <div className="flex items-center justify-center h-screen text-gray-500">Učitavanje aplikacije...</div>;
    if (!db) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center animate-fade-in">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"><svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg></div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Podešavanje Baze</h2>
                <p className="text-gray-500 mb-4">Učitaj svoj lokalni SQLite (.db) fajl da bi počeo.</p>
                {lastUsedFile && <div className="mb-6 bg-yellow-50 text-yellow-800 p-3 rounded-lg text-sm border border-yellow-200 inline-block"><strong>Info:</strong> Poslednja korišćena baza je bila: <span className="font-mono">{lastUsedFile}</span>.<br /><span className="text-xs text-yellow-600">(Zbog bezbednosti browser-a, moraš ponovo izabrati fajl)</span></div>}
                <label className="block w-full cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition transform hover:scale-105 mb-4">Izaberi Fajl Baze<input type="file" className="hidden" accept=".db,.sqlite,.sqlite3" onChange={handleFileUpload} /></label>
                <button onClick={handleCreateEmptyDb} className="block w-full cursor-pointer bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold py-4 px-6 rounded-xl transition transform hover:scale-105">Započni sa Praznom Bazom</button>
                {error && <p className="mt-4 text-red-500 text-sm bg-red-50 p-2 rounded">{error}</p>}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen flex flex-col max-w-[95%] mx-auto bg-white shadow-2xl my-4 rounded-xl overflow-hidden">
            <header className="bg-slate-800 text-white p-4 flex justify-between items-center">
                <div><h1 className="text-xl font-bold">BioData Manager</h1><div className="flex items-center gap-2 text-xs text-slate-400 mt-1"><span className="w-2 h-2 rounded-full bg-green-500"></span>{fileName}</div></div>
                <div className="flex gap-2">
                    <button onClick={() => setActiveTab('settings')} className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${activeTab === 'settings' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-700'}`} title="Podešavanja Mapiranja"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg></button>
                    <button onClick={handleDownloadDb} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition shadow-lg shadow-emerald-500/30"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg> Sačuvaj DB</button>
                    <button onClick={resetDatabase} className="bg-slate-700 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition" title="Promeni bazu (Logout)"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg></button>
                </div>
            </header>
            <nav className="bg-slate-100 p-1 flex gap-1 border-b border-gray-200 overflow-x-auto">
                {['dashboard', 'viewer', 'import', 'database', 'sql', 'settings'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-3 rounded-lg text-sm font-medium transition capitalize whitespace-nowrap ${activeTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'}`}>
                        {tab === 'dashboard' ? 'Početna' : tab === 'viewer' ? 'Pregled' : tab === 'import' ? 'Uvoz' : tab === 'database' ? 'Baza' : tab === 'sql' ? 'SQL Konzola' : 'Podešavanja'}
                    </button>
                ))}
            </nav>
            <main className="flex-1 p-6 bg-gray-50 overflow-y-auto">
                {error && <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm flex justify-between items-start"><div><p className="text-red-700 font-medium text-sm">{error}</p></div><button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button></div>}
                {successMsg && <div className="mb-4 bg-green-50 border-l-4 border-green-500 p-4 rounded shadow-sm flex justify-between items-start"><div><p className="text-green-700 font-medium text-sm">{successMsg}</p></div><button onClick={() => setSuccessMsg(null)} className="text-green-400 hover:text-green-600">✕</button></div>}

                {activeTab === 'dashboard' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {Object.keys(mappings || {}).map(tbl => (
                            <div key={tbl} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-blue-300 transition group">
                                <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-gray-800 capitalize group-hover:text-blue-600">{tbl}</h3><span className="bg-blue-50 text-blue-600 py-1 px-3 rounded-full text-xs font-bold">Tabela</span></div>
                                <p className="text-gray-500 text-sm mb-4">Glavna tabela podataka.</p>
                                <button onClick={() => { setViewerTable(tbl); setActiveTab('viewer'); }} className="w-full py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-medium">Otvori u Pregledaču</button>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'viewer' && (
                    <div className="flex flex-col h-[calc(100vh-12rem)]">
                        <div className="mb-4 flex items-center gap-3">
                            <label className="text-sm font-medium text-gray-700">Izaberi Tabelu:</label>
                            <select value={viewerTable} onChange={(e) => { setViewerTable(e.target.value); }} className="p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm">
                                {Object.keys(mappings).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <DataTable
                            data={viewerData}
                            columns={viewerColumns}
                            title={`Pregled: ${viewerTable}`}
                            enableMapsExport={true}
                            className="flex-1 shadow-sm border border-gray-200 rounded-xl"
                            stickyHeader={true}
                            stickyColumns={1}
                            columnRoles={columnRoles[viewerTable]}
                            rowAction={(row) => {
                                const { latIdx, lonIdx } = getLatLonIndices(viewerColumns, columnRoles[viewerTable]);
                                const hasCoords = latIdx !== -1 && lonIdx !== -1 && row[latIdx] && row[lonIdx];

                                return (
                                    <div className="flex gap-2 justify-end">
                                        {hasCoords && (
                                            <button
                                                onClick={() => setMapModal({ isOpen: true, lat: row[latIdx], lon: row[lonIdx] })}
                                                className="text-green-600 hover:text-green-800 text-xs font-bold border border-green-200 bg-green-50 hover:bg-green-100 px-3 py-1 rounded transition flex items-center gap-1"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                                Mapa
                                            </button>
                                        )}
                                        <button onClick={() => handleEditRow(row)} className="text-blue-600 hover:text-blue-800 text-xs font-bold border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded transition">Izmeni</button>
                                        <button onClick={() => handleDeleteRow(row)} className="text-red-600 hover:text-red-800 text-xs font-bold border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1 rounded transition">Obriši</button>
                                    </div>
                                );
                            }}
                        />
                        <EditRowModal
                            isOpen={isEditModalOpen}
                            onClose={() => { setIsEditModalOpen(false); setEditingRow(null); }}
                            onSave={handleSaveRow}
                            columns={viewerColumns}
                            initialData={editingRow}
                        />
                        <MapModal
                            isOpen={mapModal.isOpen}
                            onClose={() => setMapModal({ ...mapModal, isOpen: false })}
                            lat={mapModal.lat}
                            lon={mapModal.lon}
                        />
                    </div>
                )}

                {activeTab === 'import' && (
                    <div className="flex flex-col gap-8">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                                1. Uvoz novih podataka (CSV)
                            </h2>

                            <div className="mb-6 p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Left Column: File Selection */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Izaberi CSV Fajl</label>
                                        <div className="flex items-center gap-3">
                                            <label className="cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-2 px-4 rounded-lg border border-blue-200 transition text-sm">
                                                Choose File
                                                <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
                                            </label>
                                            <span className="text-sm text-gray-600 truncate max-w-[200px]">{csvFile ? csvFile.name : "Nije izabran fajl"}</span>
                                        </div>
                                    </div>

                                    {/* Right Column: Table Selection & Action */}
                                    <div className="flex flex-col gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Ciljna Tabela</label>
                                            <select value={targetTable} onChange={(e) => setTargetTable(e.target.value)} className="w-full p-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm shadow-sm">
                                                {Object.keys(mappings).map(t => <option key={t} value={t}>{t}</option>)}
                                                <option value="__NEW_TABLE__" className="font-bold text-blue-600">+ Nova Tabela...</option>
                                            </select>
                                        </div>

                                        {targetTable === "__NEW_TABLE__" && (
                                            <div className="animate-fade-in">
                                                <label className="block text-sm font-medium text-gray-700 mb-2">Naziv nove tabele (npr. leptiri)</label>
                                                <input type="text" value={newTableName} onChange={(e) => setNewTableName(e.target.value)} placeholder="unesi naziv..." className="w-full p-2.5 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm bg-blue-50" />
                                            </div>
                                        )}

                                        <button onClick={handleImport} disabled={isProcessing} className={`mt-2 w-full py-3 px-4 rounded-lg font-bold text-white shadow-md transition transform active:scale-95 ${isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                            {isProcessing ? 'Procesiranje...' : 'Uvezi Podatke'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                2. Istorija Uvoza & Poništavanje
                            </h2>
                            <DataTable columns={["id", "filename", "target_table", "import_date", "row_count", "backup_table_name"]} data={importLog} title="Zapisi o uvozu" enableMapsExport={false} rowAction={(row) => (<button onClick={() => handleUndoImport(row)} className="text-red-600 hover:text-red-800 text-xs font-bold border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1 rounded transition flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path></svg> Poništi</button>)} />
                        </div>
                    </div>
                )}

                {activeTab === 'database' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-lg font-bold text-orange-800 mb-3 flex items-center gap-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg> Backup Tabele</h3>
                            <DataTable
                                columns={["Naziv Tabele"]}
                                data={dbTables.filter(t => t.startsWith('import_')).map(t => [t])}
                                title="Backup Tabele"
                                enableMapsExport={false}
                                rowAction={(row) => (
                                    <div className="flex gap-2 justify-end">
                                        <button
                                            onClick={() => {
                                                const tableName = row[0];
                                                if (mainTables.includes(tableName)) {
                                                    setConfirmModal({
                                                        isOpen: true,
                                                        title: "Ukloni iz Glavnih Tabela",
                                                        message: `Da li sigurno želite da uklonite tabelu "${tableName}" iz Glavnih tabela? Mapiranje će biti obrisano.`,
                                                        onConfirm: () => {
                                                            const newMainTables = mainTables.filter(t => t !== tableName);
                                                            setMainTables(newMainTables);
                                                            const newMappings = { ...mappings };
                                                            delete newMappings[tableName];
                                                            setMappings(newMappings);
                                                            const config = { mappings: newMappings, column_roles: columnRoles, main_tables: newMainTables };
                                                            db.exec(`UPDATE app_config SET value = '${JSON.stringify(config)}' WHERE key = 'mappings'`);
                                                            setSuccessMsg(`Tabela "${tableName}" uklonjena iz Glavnih tabela.`);
                                                            setConfirmModal({ isOpen: false, title: "", message: "", onConfirm: null });
                                                        }
                                                    });
                                                } else {
                                                    const newMainTables = [...mainTables, tableName];
                                                    setMainTables(newMainTables);
                                                    let newMappings = { ...mappings };
                                                    if (!newMappings[tableName]) {
                                                        const colRes = db.exec(`SELECT * FROM ${tableName} LIMIT 1`);
                                                        if (colRes.length > 0) {
                                                            const cols = colRes[0].columns;
                                                            newMappings[tableName] = {};
                                                            cols.forEach(col => {
                                                                const variants = [
                                                                    col,
                                                                    col.charAt(0).toUpperCase() + col.slice(1),
                                                                    col.replace(/_/g, ' '),
                                                                    col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                                                                    col.charAt(0).toUpperCase() + col.slice(1).replace(/_/g, ' '),
                                                                ];
                                                                const uniqueVariants = [...new Set(variants)].join(', ');
                                                                newMappings[tableName][col] = uniqueVariants;
                                                            });
                                                        }
                                                    }
                                                    setMappings(newMappings);
                                                    const config = { mappings: newMappings, column_roles: columnRoles, main_tables: newMainTables };
                                                    db.exec(`UPDATE app_config SET value = '${JSON.stringify(config)}' WHERE key = 'mappings'`);
                                                    setSuccessMsg(`Tabela "${tableName}" postavljena kao Glavna sa automatskim mapiranjem varijanti naziva kolona.`);
                                                }
                                            }}
                                            className="text-blue-600 hover:text-blue-800 text-xs font-bold"
                                        >
                                            {mainTables.includes(row[0]) ? '★' : '☆'}
                                        </button>
                                        <button onClick={() => openInSql(row[0])} className="text-blue-600 hover:text-blue-800 text-xs font-bold border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded transition">SQL</button>
                                        <button onClick={() => handleDropTable(row[0])} className="text-red-600 hover:text-red-800 text-xs font-bold border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1 rounded transition">Obriši</button>
                                    </div>
                                )}
                            />
                        </div>

                        <div>
                            <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg> Tabele</h3>
                            <DataTable
                                columns={["Naziv Tabele", "Tip"]}
                                data={dbTables.filter(tbl => !tbl.startsWith('import_')).map(tbl => {
                                    let type = "Ostalo";
                                    if (mainTables.includes(tbl)) type = "Glavna";
                                    else if (tbl.startsWith('import_')) type = "Backup";
                                    else if (tbl === 'app_import_history' || tbl === 'app_config' || tbl === 'sqlite_sequence') type = "Sistemska";
                                    return [tbl, type];
                                })}
                                title="Tabele u Bazi"
                                enableMapsExport={false}
                                rowAction={(row) => (
                                    <div className="flex gap-2 justify-end">
                                        <button onClick={() => openInSql(row[0])} className="text-blue-600 hover:text-blue-800 text-xs font-bold border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded transition">SQL</button>
                                        {row[1] !== 'Sistemska' && (
                                            <button
                                                onClick={() => {
                                                    const tableName = row[0];
                                                    if (mainTables.includes(tableName)) {
                                                        setConfirmModal({
                                                            isOpen: true,
                                                            title: "Ukloni iz Glavnih Tabela",
                                                            message: `Da li sigurno želite da uklonite tabelu "${tableName}" iz Glavnih tabela? Mapiranje će biti obrisano.`,
                                                            onConfirm: () => {
                                                                const newMainTables = mainTables.filter(t => t !== tableName);
                                                                setMainTables(newMainTables);
                                                                const newMappings = { ...mappings };
                                                                delete newMappings[tableName];
                                                                setMappings(newMappings);
                                                                const config = { mappings: newMappings, column_roles: columnRoles, main_tables: newMainTables };
                                                                db.exec(`UPDATE app_config SET value = '${JSON.stringify(config)}' WHERE key = 'mappings'`);
                                                                setSuccessMsg(`Tabela "${tableName}" uklonjena iz Glavnih tabela.`);
                                                                setConfirmModal({ isOpen: false, title: "", message: "", onConfirm: null });
                                                            }
                                                        });
                                                    } else {
                                                        // Promote to Glavna
                                                        const newMainTables = [...mainTables, tableName];
                                                        setMainTables(newMainTables);

                                                        // Auto-create mapping with multiple column name variants
                                                        let newMappings = { ...mappings };
                                                        if (!newMappings[tableName]) {
                                                            // Get table columns
                                                            const colRes = db.exec(`SELECT * FROM ${tableName} LIMIT 1`);
                                                            if (colRes.length > 0) {
                                                                const cols = colRes[0].columns;
                                                                newMappings[tableName] = {};

                                                                cols.forEach(col => {
                                                                    // Generate multiple variants for each column
                                                                    const variants = [
                                                                        col,                                        // original: vrsta
                                                                        col.charAt(0).toUpperCase() + col.slice(1), // capitalized: Vrsta
                                                                        col.replace(/_/g, ' '),                    // with spaces: kvalitet brojanja
                                                                        col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // title case: Kvalitet Brojanja
                                                                        col.charAt(0).toUpperCase() + col.slice(1).replace(/_/g, ' '), // Kvalitet brojanja
                                                                    ];

                                                                    // Remove duplicates and join
                                                                    const uniqueVariants = [...new Set(variants)].join(', ');
                                                                    newMappings[tableName][col] = uniqueVariants;
                                                                });
                                                            } else {
                                                                // No data, try PRAGMA
                                                                const pragmaRes = db.exec(`PRAGMA table_info(${tableName})`);
                                                                if (pragmaRes.length > 0) {
                                                                    newMappings[tableName] = {};
                                                                    pragmaRes[0].values.forEach(row => {
                                                                        const col = row[1];
                                                                        const variants = [
                                                                            col,
                                                                            col.charAt(0).toUpperCase() + col.slice(1),
                                                                            col.replace(/_/g, ' '),
                                                                            col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                                                                            col.charAt(0).toUpperCase() + col.slice(1).replace(/_/g, ' '),
                                                                        ];
                                                                        const uniqueVariants = [...new Set(variants)].join(', ');
                                                                        newMappings[tableName][col] = uniqueVariants;
                                                                    });
                                                                }
                                                            }
                                                        }

                                                        setMappings(newMappings);
                                                        const config = { mappings: newMappings, column_roles: columnRoles, main_tables: newMainTables };
                                                        db.exec(`UPDATE app_config SET value = '${JSON.stringify(config)}' WHERE key = 'mappings'`);
                                                        setSuccessMsg(`Tabela "${tableName}" postavljena kao Glavna sa automatskim mapiranjem varijanti naziva kolona.`);
                                                    }
                                                }}
                                                className="text-blue-600 hover:text-blue-800 text-xs font-bold ml-2"
                                            >
                                                {mainTables.includes(row[0]) ? '★' : '☆'}
                                            </button>
                                        )}
                                        {(row[1] === 'Backup' || row[1] === 'Ostalo') && (
                                            <button onClick={() => handleDropTable(row[0])} className="text-red-600 hover:text-red-800 text-xs font-bold border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1 rounded transition">Obriši</button>
                                        )}
                                    </div>
                                )}
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'settings' && tempMappings && (
                    <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center"><h2 className="text-lg font-bold text-gray-800">Podešavanje Mapiranja Kolona</h2><button onClick={handleSaveSettings} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg> Sačuvaj Podešavanja</button></div>
                        <div className="p-6">
                            <div className="mb-6"><label className="block text-sm font-medium text-gray-700 mb-2">Izaberi Tabelu za Mapiranje:</label><select value={settingsTable} onChange={(e) => setSettingsTable(e.target.value)} className="w-full md:w-1/3 p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm">
                                {Object.keys(mappings).map(t => <option key={t} value={t}>{t}</option>)}
                            </select><p className="text-xs text-gray-500 mt-2">Ovde definišeš koji se nazivi kolona iz CSV fajla mapiraju u koju kolonu baze. Odvoji nazive zarezom.</p></div>
                            <div className="overflow-hidden border border-gray-200 rounded-lg">
                                <table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider w-1/4">Kolona u Bazi</th><th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">CSV Alias-i (odvojeni zarezom)</th></tr></thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {Object.keys(tempMappings).map((col) => (
                                            <tr key={col} className="hover:bg-gray-50"><td className="px-6 py-4 font-mono text-blue-700 font-medium">{col}</td><td className="px-6 py-2"><input type="text" className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" value={tempMappings[col] || ""} onChange={(e) => handleMappingChange(col, e.target.value)} /></td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-4">
                                <h3 className="font-bold text-gray-700 mb-2">Konfiguracija Mape</h3>
                                <p className="text-xs text-gray-500 mb-4">Ručno odaberite kolone za Latitudu i Longitudu.</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-600 mb-1">Latituda Kolona</label>
                                        <select
                                            value={columnRoles[settingsTable]?.lat || ""}
                                            onChange={(e) => {
                                                const newRoles = { ...columnRoles };
                                                if (!newRoles[settingsTable]) newRoles[settingsTable] = {};
                                                newRoles[settingsTable].lat = e.target.value;
                                                setColumnRoles(newRoles);
                                            }}
                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        >
                                            <option value="">Automatska detekcija</option>
                                            {Object.keys(tempMappings).map(col => (
                                                <option key={col} value={col}>{col}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-600 mb-1">Longituda Kolona</label>
                                        <select
                                            value={columnRoles[settingsTable]?.lon || ""}
                                            onChange={(e) => {
                                                const newRoles = { ...columnRoles };
                                                if (!newRoles[settingsTable]) newRoles[settingsTable] = {};
                                                newRoles[settingsTable].lon = e.target.value;
                                                setColumnRoles(newRoles);
                                            }}
                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        >
                                            <option value="">Automatska detekcija</option>
                                            {Object.keys(tempMappings).map(col => (
                                                <option key={col} value={col}>{col}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'sql' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* SQL Console Section */}
                            <div className={`bg-white p-4 rounded-xl shadow-sm border border-gray-200 ${savedQueries.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
                                <div className="flex justify-between items-center mb-4">
                                    <label className="block text-sm font-bold text-gray-700">SQL Konzola</label>
                                    <button
                                        onClick={() => setIsQueryBuilderOpen(true)}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                                        </svg>
                                        Query Builder
                                    </button>
                                </div>
                                <div>
                                    <textarea
                                        className="sql-font w-full h-40 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="SELECT * FROM..."
                                    />
                                    <div className="mt-3 flex justify-end">
                                        <button
                                            onClick={() => execQuery()}
                                            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg font-medium"
                                        >
                                            Izvrši
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Saved Queries Section */}
                            {savedQueries.length > 0 && (
                                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                                    <h3 className="text-sm font-bold text-gray-700 mb-3">Sačuvani Upiti</h3>
                                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                                        {savedQueries.map(savedQuery => (
                                            <div
                                                key={savedQuery.id}
                                                className="group flex items-center justify-between p-2 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-gray-50 transition"
                                            >
                                                {editingQueryId === savedQuery.id ? (
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <input
                                                            type="text"
                                                            value={editingQueryName}
                                                            onChange={(e) => setEditingQueryName(e.target.value)}
                                                            onKeyPress={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    saveEditedQuery(savedQuery.id);
                                                                } else if (e.key === 'Escape') {
                                                                    cancelEditingQuery();
                                                                }
                                                            }}
                                                            className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                                            autoFocus
                                                        />
                                                        <button
                                                            onClick={() => saveEditedQuery(savedQuery.id)}
                                                            className="text-green-600 hover:text-green-800 text-xs font-bold"
                                                            title="Sačuvaj"
                                                        >
                                                            ✓
                                                        </button>
                                                        <button
                                                            onClick={cancelEditingQuery}
                                                            className="text-gray-600 hover:text-gray-800 text-xs font-bold"
                                                            title="Otkaži"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div 
                                                            className="font-medium text-sm text-gray-800 flex-1 truncate pr-2 cursor-pointer"
                                                            onClick={() => loadQuery(savedQuery)}
                                                        >
                                                            {savedQuery.name}
                                                        </div>
                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    startEditingQuery(savedQuery);
                                                                }}
                                                                className="text-blue-600 hover:text-blue-800 text-xs font-bold"
                                                                title="Izmeni naziv"
                                                            >
                                                                ✎
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    deleteQuery(savedQuery.id);
                                                                }}
                                                                className="text-red-600 hover:text-red-800 text-xs font-bold"
                                                                title="Obriši"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        {error && activeTab === 'sql' && (
                            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm">
                                <div className="flex items-start">
                                    <svg className="w-5 h-5 text-red-600 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    <div className="flex-1">
                                        <p className="text-red-700 font-medium text-sm">SQL Greška:</p>
                                        <p className="text-red-600 text-sm mt-1 font-mono">{error}</p>
                                    </div>
                                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        )}
                        {queryResults && (
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-sm font-bold text-gray-700">Rezultati Upita</h3>
                                    <button
                                        onClick={() => setShowSaveQueryDialog(true)}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
                                        </svg>
                                        Sačuvaj Upit
                                    </button>
                                </div>
                                {showSaveQueryDialog && (
                                    <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                        <div className="flex items-center gap-4">
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={queryName}
                                                    onChange={(e) => setQueryName(e.target.value)}
                                                    placeholder="Naziv upita..."
                                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                    onKeyPress={(e) => {
                                                        if (e.key === 'Enter') {
                                                            saveQuery();
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <button
                                                onClick={saveQuery}
                                                disabled={!queryName.trim() || !query.trim()}
                                                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
                                            >
                                                Sačuvaj
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowSaveQueryDialog(false);
                                                    setQueryName('');
                                                }}
                                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium"
                                            >
                                                Otkaži
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {queryResults.length === 0 ? (
                                    <div className="text-center py-8">
                                        <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                        </svg>
                                        <p className="text-gray-600 font-medium">Upit je uspešno izvršen, ali nije vratio rezultate.</p>
                                        <p className="text-gray-500 text-sm mt-2">Nema podataka koji odgovaraju uslovima upita.</p>
                                    </div>
                                ) : (
                                    queryResults.map((res, i) => {
                                        // Check if result has no data
                                        if (!res.values || res.values.length === 0) {
                                            return (
                                                <div key={i} className="mb-4">
                                                    <h3 className="text-sm font-bold text-gray-700 mb-2">Rezultat {i + 1}</h3>
                                                    <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                                                        <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                                        </svg>
                                                        <p className="text-gray-600 font-medium">Nema podataka</p>
                                                        <p className="text-gray-500 text-sm mt-2">Upit je uspešno izvršen, ali nije vratio rezultate.</p>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return (
                                            <DataTable
                                                key={i}
                                                columns={res.columns}
                                                data={res.values}
                                                title={`Rezultat ${i + 1}`}
                                                enableMapsExport={true}
                                            />
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                )}
            </main>
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ isOpen: false, title: "", message: "", onConfirm: null })}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
            />
            <QueryBuilderModal
                isOpen={isQueryBuilderOpen}
                onClose={() => setIsQueryBuilderOpen(false)}
                db={db}
                dbTables={dbTables}
                onGenerateQuery={(generatedQuery) => {
                    setQuery(generatedQuery);
                    setIsQueryBuilderOpen(false);
                    setTimeout(() => execQuery(generatedQuery), 100);
                }}
            />
        </div>
    );
}

export default App;
