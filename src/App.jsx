import React, { useState, useEffect, useMemo, useRef } from 'react';
import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import Papa from 'papaparse';
import { DEFAULT_MAPPINGS, INITIAL_SCHEMA } from './constants';
import DataTable from './components/DataTable';

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

        // 2. Init Config
        newDb.exec(`CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT);`);
        const configRes = newDb.exec("SELECT value FROM app_config WHERE key = 'mappings'");
        if (configRes.length > 0) setMappings(JSON.parse(configRes[0].values[0][0]));
        else {
            const stmt = newDb.prepare("INSERT INTO app_config (key, value) VALUES (?, ?)");
            stmt.run(['mappings', JSON.stringify(DEFAULT_MAPPINGS)]);
            stmt.free();
            setMappings(DEFAULT_MAPPINGS);
        }
        refreshImportLog(newDb);
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
        if (activeTab === 'database') fetchDbTables();
    }, [activeTab, db]);

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

    useEffect(() => { if (mappings && settingsTable) setTempMappings(JSON.parse(JSON.stringify(mappings[settingsTable] || {}))); }, [mappings, settingsTable]);
    const handleMappingChange = (dbCol, val) => { setTempMappings(prev => ({ ...prev, [dbCol]: val.split(",").map(s => s.trim()).filter(s => s !== "") })); };
    const saveSettings = () => {
        if (!db) return;
        try {
            const newMappings = { ...mappings, [settingsTable]: tempMappings };
            setMappings(newMappings);
            db.exec("BEGIN TRANSACTION");
            const stmt = db.prepare("UPDATE app_config SET value = ? WHERE key = 'mappings'");
            stmt.run([JSON.stringify(newMappings)]);
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
            setViewerColumns(cols);
            const dataRes = db.exec(`SELECT * FROM ${viewerTable}`);
            setViewerData(dataRes.length > 0 ? dataRes[0].values : []);
        } catch (err) { if (err.message.includes("no such table")) { setViewerData([]); setViewerColumns([]); } else setError("Greška pri učitavanju tabele: " + err.message); } finally { setViewerLoading(false); }
    };
    useEffect(() => { if (activeTab === 'viewer') fetchViewerData(); }, [activeTab, viewerTable, db]);

    const handleCsvUpload = (e) => { setCsvFile(e.target.files[0]); setSuccessMsg(null); setError(null); };
    const processImport = (overrideTableName = null, overrideMappings = null) => {
        const tableToUse = overrideTableName || targetTable;
        const mappingsToUse = overrideMappings || mappings;
        if (!db || !csvFile || !tableToUse) return;
        const checkRes = db.exec(`SELECT count(*) as cnt FROM app_import_history WHERE filename = '${csvFile.name}' AND target_table = '${tableToUse}'`);
        if (checkRes[0].values[0][0] > 0) { setError(`UPOZORENJE: Fajl '${csvFile.name}' je već uvezen u tabelu '${tableToUse}'!`); return; }
        setIsProcessing(true);
        Papa.parse(csvFile, {
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

        Papa.parse(fileToParse, {
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
                    stmt.run([JSON.stringify(updatedMappings)]);
                    stmt.free();
                    db.exec("COMMIT");

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
    };

    const handleDownloadDb = () => { if (!db) return; const data = db.export(); const blob = new Blob([data], { type: 'application/x-sqlite3' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName || 'database_updated.db'; a.click(); };

    // Ažurirana execQuery da prihvata SQL argument
    const execQuery = (sqlToRun = query) => {
        if (!db || !sqlToRun) return;
        try {
            const res = db.exec(sqlToRun);
            setQueryResults(res);
            setError(null);
        } catch (err) {
            setError(err.message);
            setQueryResults(null);
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
                        {Object.keys(mappings).map(tbl => (
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
                        <DataTable data={viewerData} columns={viewerColumns} title={`Pregled: ${viewerTable}`} enableMapsExport={true} className="flex-1 shadow-sm border border-gray-200 rounded-xl" stickyHeader={true} />
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
                                        <button onClick={() => openInSql(row[0])} className="text-blue-600 hover:text-blue-800 text-xs font-bold border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded transition">SQL</button>
                                        <button onClick={() => handleDropTable(row[0])} className="text-red-600 hover:text-red-800 text-xs font-bold border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1 rounded transition">Obriši</button>
                                    </div>
                                )}
                            />
                        </div>

                        <div>
                            <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg> Sve Tabele</h3>
                            <DataTable
                                columns={["Naziv Tabele", "Tip"]}
                                data={dbTables.map(tbl => {
                                    let type = "Ostalo";
                                    if (Object.keys(mappings).includes(tbl)) type = "Glavna";
                                    else if (tbl.startsWith('import_')) type = "Backup";
                                    else if (tbl === 'app_import_history' || tbl === 'app_config' || tbl === 'sqlite_sequence') type = "Sistemska";
                                    return [tbl, type];
                                })}
                                title="Sve Tabele u Bazi"
                                enableMapsExport={false}
                                rowAction={(row) => (
                                    <div className="flex gap-2 justify-end">
                                        <button onClick={() => openInSql(row[0])} className="text-blue-600 hover:text-blue-800 text-xs font-bold border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded transition">SQL</button>
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
                        <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center"><h2 className="text-lg font-bold text-gray-800">Podešavanje Mapiranja Kolona</h2><button onClick={saveSettings} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg> Sačuvaj Podešavanja</button></div>
                        <div className="p-6">
                            <div className="mb-6"><label className="block text-sm font-medium text-gray-700 mb-2">Izaberi Tabelu za Mapiranje:</label><select value={settingsTable} onChange={(e) => setSettingsTable(e.target.value)} className="w-full md:w-1/3 p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm">
                                {Object.keys(mappings).map(t => <option key={t} value={t}>{t}</option>)}
                            </select><p className="text-xs text-gray-500 mt-2">Ovde definišeš koji se nazivi kolona iz CSV fajla mapiraju u koju kolonu baze. Odvoji nazive zarezom.</p></div>
                            <div className="overflow-hidden border border-gray-200 rounded-lg">
                                <table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider w-1/4">Kolona u Bazi</th><th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">CSV Alias-i (odvojeni zarezom)</th></tr></thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {Object.keys(tempMappings).map((col) => (
                                            <tr key={col} className="hover:bg-gray-50"><td className="px-6 py-4 font-mono text-blue-700 font-medium">{col}</td><td className="px-6 py-2"><input type="text" className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" value={tempMappings[col].join(", ")} onChange={(e) => handleMappingChange(col, e.target.value)} /></td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'sql' && (
                    <div className="space-y-6">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200"><label className="block text-sm font-bold text-gray-700 mb-2">Napredni SQL Upit</label><textarea className="sql-font w-full h-40 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="SELECT * FROM..."></textarea><div className="mt-3 flex justify-end"><button onClick={() => execQuery()} className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg font-medium">Izvrši</button></div></div>
                        {queryResults && queryResults.map((res, i) => (<DataTable key={i} columns={res.columns} data={res.values} title={`Rezultat ${i + 1}`} enableMapsExport={true} />))}
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;
