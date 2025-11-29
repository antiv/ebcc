import React, { useState, useEffect } from 'react';
import Autocomplete from './Autocomplete';

const AGGREGATE_FUNCTIONS = [
    { value: '', label: 'Nema' },
    { value: 'COUNT', label: 'COUNT' },
    { value: 'SUM', label: 'SUM' },
    { value: 'AVG', label: 'AVG' },
    { value: 'MAX', label: 'MAX' },
    { value: 'MIN', label: 'MIN' }
];

const JOIN_TYPES = [
    { value: 'INNER', label: 'INNER JOIN' },
    { value: 'LEFT', label: 'LEFT JOIN' },
    { value: 'RIGHT', label: 'RIGHT JOIN' }
];

const QueryBuilder = ({ db, dbTables, onGenerateQuery }) => {
    const [mainTable, setMainTable] = useState('');
    const [selectedColumns, setSelectedColumns] = useState([]);
    const [joins, setJoins] = useState([]);
    const [whereConditions, setWhereConditions] = useState([]);
    const [groupByColumns, setGroupByColumns] = useState([]);
    const [orderByColumns, setOrderByColumns] = useState([]);
    const [tableColumns, setTableColumns] = useState({});
    const [generatedSQL, setGeneratedSQL] = useState('');

    // Removed auto-selection of first table - user must manually select

    useEffect(() => {
        if (db && mainTable) {
            loadTableColumns(mainTable);
        }
    }, [db, mainTable]);

    const loadTableColumns = (tableName) => {
        if (!db || !tableName) return;
        try {
            const res = db.exec(`PRAGMA table_info("${tableName}")`);
            if (res.length > 0) {
                const cols = res[0].values.map(row => row[1]);
                setTableColumns(prev => ({ ...prev, [tableName]: cols }));
            }
        } catch (e) {
            console.error('Error loading columns:', e);
        }
    };

    const addColumn = () => {
        setSelectedColumns([...selectedColumns, {
            id: Date.now(),
            table: mainTable,
            column: '',
            alias: '',
            aggregate: '',
            distinct: false
        }]);
    };

    const removeColumn = (id) => {
        setSelectedColumns(selectedColumns.filter(col => col.id !== id));
    };

    const updateColumn = (id, field, value) => {
        setSelectedColumns(selectedColumns.map(col => {
            if (col.id === id) {
                const updated = { ...col, [field]: value };
                if (field === 'table') {
                    loadTableColumns(value);
                    updated.column = '';
                }
                return updated;
            }
            return col;
        }));
    };

    const addJoin = () => {
        setJoins([...joins, {
            id: Date.now(),
            type: 'INNER',
            table: '',
            onLeftTable: mainTable,
            onLeft: '',
            onRight: ''
        }]);
    };

    const removeJoin = (id) => {
        setJoins(joins.filter(join => join.id !== id));
    };

    const updateJoin = (id, field, value) => {
        setJoins(joins.map(join => {
            if (join.id === id) {
                const updated = { ...join, [field]: value };
                if (field === 'table') {
                    loadTableColumns(value);
                }
                return updated;
            }
            return join;
        }));
    };

    const addWhereCondition = () => {
        setWhereConditions([...whereConditions, {
            id: Date.now(),
            table: mainTable,
            column: '',
            operator: '=',
            value: '',
            logic: 'AND'
        }]);
    };

    const removeWhereCondition = (id) => {
        setWhereConditions(whereConditions.filter(cond => cond.id !== id));
    };

    const updateWhereCondition = (id, field, value) => {
        setWhereConditions(whereConditions.map(cond => {
            if (cond.id === id) {
                const updated = { ...cond, [field]: value };
                if (field === 'table') {
                    loadTableColumns(value);
                    updated.column = '';
                }
                return updated;
            }
            return cond;
        }));
    };

    const addGroupBy = () => {
        setGroupByColumns([...groupByColumns, {
            id: Date.now(),
            table: mainTable,
            column: ''
        }]);
    };

    const removeGroupBy = (id) => {
        setGroupByColumns(groupByColumns.filter(gb => gb.id !== id));
    };

    const updateGroupBy = (id, field, value) => {
        setGroupByColumns(groupByColumns.map(gb => {
            if (gb.id === id) {
                const updated = { ...gb, [field]: value };
                if (field === 'table') {
                    loadTableColumns(value);
                    updated.column = '';
                }
                return updated;
            }
            return gb;
        }));
    };

    const addOrderBy = () => {
        setOrderByColumns([...orderByColumns, {
            id: Date.now(),
            table: mainTable,
            column: '',
            direction: 'ASC'
        }]);
    };

    const removeOrderBy = (id) => {
        setOrderByColumns(orderByColumns.filter(ob => ob.id !== id));
    };

    const updateOrderBy = (id, field, value) => {
        setOrderByColumns(orderByColumns.map(ob => {
            if (ob.id === id) {
                const updated = { ...ob, [field]: value };
                if (field === 'table') {
                    loadTableColumns(value);
                    updated.column = '';
                }
                return updated;
            }
            return ob;
        }));
    };

    const generateSQL = () => {
        if (!mainTable) return '';

        // SELECT clause
        let selectParts = [];
        if (selectedColumns.length === 0) {
            selectParts.push('*');
        } else {
            selectedColumns.forEach(col => {
                if (!col.column) return;
                let part = '';
                if (col.distinct) part += 'DISTINCT ';
                if (col.aggregate) {
                    part += `${col.aggregate}(${col.table ? `"${col.table}"."${col.column}"` : `"${col.column}"`})`;
                } else {
                    part += col.table ? `"${col.table}"."${col.column}"` : `"${col.column}"`;
                }
                if (col.alias) {
                    part += ` AS "${col.alias}"`;
                }
                selectParts.push(part);
            });
        }
        const selectClause = `SELECT ${selectParts.join(', ')}`;

        // FROM clause
        const fromClause = `FROM "${mainTable}"`;

        // JOIN clauses
        const joinClauses = joins
            .filter(join => join.table && join.onLeft && join.onRight)
            .map(join => {
                const leftTable = join.onLeftTable || mainTable;
                const leftCol = join.onLeft.trim();
                const rightTable = join.table;
                const rightCol = join.onRight.trim();
                return `${join.type} JOIN "${rightTable}" ON "${leftTable}"."${leftCol}" = "${rightTable}"."${rightCol}"`;
            })
            .join(' ');

        // WHERE clause
        const whereParts = whereConditions
            .filter(cond => cond.column && cond.value !== '')
            .map((cond, idx) => {
                const logic = idx > 0 ? ` ${cond.logic} ` : '';
                const colRef = cond.table ? `"${cond.table}"."${cond.column}"` : `"${cond.column}"`;
                let value;
                if (cond.operator === 'IN') {
                    // Handle IN clause - expect comma-separated values
                    const values = cond.value.split(',').map(v => v.trim()).filter(v => v);
                    const formattedValues = values.map(v => {
                        const numVal = Number(v);
                        return isNaN(numVal) ? `'${v.replace(/'/g, "''")}'` : numVal;
                    });
                    value = `(${formattedValues.join(', ')})`;
                } else {
                    const numVal = Number(cond.value);
                    value = isNaN(numVal) || cond.value.trim() === '' ? `'${cond.value.replace(/'/g, "''")}'` : numVal;
                }
                return `${logic}${colRef} ${cond.operator} ${value}`;
            });
        const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join('')}` : '';

        // GROUP BY clause
        const groupByParts = groupByColumns
            .filter(gb => gb.column)
            .map(gb => gb.table ? `"${gb.table}"."${gb.column}"` : `"${gb.column}"`);
        const groupByClause = groupByParts.length > 0 ? `GROUP BY ${groupByParts.join(', ')}` : '';

        // ORDER BY clause
        const orderByParts = orderByColumns
            .filter(ob => ob.column)
            .map(ob => {
                const colRef = ob.table ? `"${ob.table}"."${ob.column}"` : `"${ob.column}"`;
                return `${colRef} ${ob.direction}`;
            });
        const orderByClause = orderByParts.length > 0 ? `ORDER BY ${orderByParts.join(', ')}` : '';

        const sql = [selectClause, fromClause, joinClauses, whereClause, groupByClause, orderByClause]
            .filter(part => part !== '')
            .join(' ');

        return sql;
    };

    const handleGenerate = () => {
        const sql = generateSQL();
        setGeneratedSQL(sql);
        if (onGenerateQuery && sql) {
            onGenerateQuery(sql);
        }
    };

    useEffect(() => {
        // Auto-generate SQL preview when configuration changes
        if (mainTable) {
            const sql = generateSQL();
            setGeneratedSQL(sql);
        } else {
            setGeneratedSQL('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mainTable, selectedColumns, joins, whereConditions, groupByColumns, orderByColumns]);

    const getAllTables = () => {
        const tables = [mainTable, ...joins.map(j => j.table)].filter(Boolean);
        return [...new Set(tables)];
    };

    return (
        <div className="space-y-6">
            {/* Main Table Selection */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <label className="block text-sm font-bold text-gray-700 mb-2">Glavna Tabela</label>
                <Autocomplete
                    options={dbTables}
                    value={mainTable}
                    onChange={(value) => {
                        setMainTable(value);
                        // Only load columns if the table exists in dbTables
                        if (value && dbTables.includes(value)) {
                            loadTableColumns(value);
                        }
                    }}
                    placeholder="Unesite naziv tabele..."
                    className="w-full"
                />
                {mainTable && !dbTables.includes(mainTable) && (
                    <p className="text-xs text-red-600 mt-1">Tabela "{mainTable}" ne postoji u bazi.</p>
                )}
            </div>

            {/* Selected Columns */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-bold text-gray-700">Izabrana Polja</label>
                    <button
                        onClick={addColumn}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium"
                    >
                        + Dodaj Polje
                    </button>
                </div>
                {selectedColumns.length === 0 && (
                    <p className="text-sm text-gray-500 italic">Nema izabranih polja. Koristiće se * (sva polja).</p>
                )}
                {selectedColumns.map(col => (
                    <div key={col.id} className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                            <Autocomplete
                                options={[mainTable, ...joins.filter(j => j.table).map(j => j.table)].filter(Boolean)}
                                value={col.table}
                                onChange={(value) => {
                                    updateColumn(col.id, 'table', value);
                                    if (value) {
                                        loadTableColumns(value);
                                    }
                                }}
                                placeholder="Tabela..."
                                className="p-0"
                            />
                            <select
                                value={col.column}
                                onChange={(e) => updateColumn(col.id, 'column', e.target.value)}
                                className="p-2 border border-gray-300 rounded text-sm"
                            >
                                <option value="">Izaberi kolonu...</option>
                                {(tableColumns[col.table || mainTable] || []).map(colName => (
                                    <option key={colName} value={colName}>{colName}</option>
                                ))}
                            </select>
                            <select
                                value={col.aggregate}
                                onChange={(e) => updateColumn(col.id, 'aggregate', e.target.value)}
                                className="p-2 border border-gray-300 rounded text-sm"
                            >
                                {AGGREGATE_FUNCTIONS.map(func => (
                                    <option key={func.value} value={func.value}>{func.label}</option>
                                ))}
                            </select>
                            <input
                                type="text"
                                placeholder="Alias (opciono)"
                                value={col.alias}
                                onChange={(e) => updateColumn(col.id, 'alias', e.target.value)}
                                className="p-2 border border-gray-300 rounded text-sm"
                            />
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-600 flex items-center gap-1">
                                    <input
                                        type="checkbox"
                                        checked={col.distinct}
                                        onChange={(e) => updateColumn(col.id, 'distinct', e.target.checked)}
                                        className="rounded"
                                    />
                                    DISTINCT
                                </label>
                                <button
                                    onClick={() => removeColumn(col.id)}
                                    className="text-red-600 hover:text-red-800 text-sm font-bold"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* JOINs */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-bold text-gray-700">Join Tabele</label>
                    <button
                        onClick={addJoin}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium"
                    >
                        + Dodaj Join
                    </button>
                </div>
                {joins.map((join, joinIndex) => {
                    // Get all available tables for left side (main table + previous joins)
                    const availableLeftTables = [mainTable, ...joins.slice(0, joinIndex).map(j => j.table)].filter(Boolean);
                    const leftTable = join.onLeftTable || mainTable;
                    const rightTable = join.table;
                    
                    return (
                        <div key={join.id} className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                                <select
                                    value={join.type}
                                    onChange={(e) => updateJoin(join.id, 'type', e.target.value)}
                                    className="p-2 border border-gray-300 rounded text-sm"
                                >
                                    {JOIN_TYPES.map(jt => (
                                        <option key={jt.value} value={jt.value}>{jt.label}</option>
                                    ))}
                                </select>
                                <Autocomplete
                                    options={dbTables.filter(t => t !== mainTable)}
                                    value={join.table}
                                    onChange={(value) => {
                                        updateJoin(join.id, 'table', value);
                                        if (value && dbTables.includes(value)) {
                                            loadTableColumns(value);
                                        }
                                    }}
                                    placeholder="Izaberi tabelu..."
                                    className="p-0"
                                />
                                <select
                                    value={leftTable}
                                    onChange={(e) => {
                                        updateJoin(join.id, 'onLeftTable', e.target.value);
                                        updateJoin(join.id, 'onLeft', '');
                                    }}
                                    className="p-2 border border-gray-300 rounded text-sm"
                                >
                                    {availableLeftTables.map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                                <select
                                    value={join.onLeft}
                                    onChange={(e) => updateJoin(join.id, 'onLeft', e.target.value)}
                                    className="p-2 border border-gray-300 rounded text-sm"
                                    disabled={!leftTable}
                                >
                                    <option value="">Kolona...</option>
                                    {(tableColumns[leftTable] || []).map(col => (
                                        <option key={col} value={col}>{col}</option>
                                    ))}
                                </select>
                                <select
                                    value={join.onRight}
                                    onChange={(e) => updateJoin(join.id, 'onRight', e.target.value)}
                                    className="p-2 border border-gray-300 rounded text-sm"
                                    disabled={!rightTable}
                                >
                                    <option value="">Kolona...</option>
                                    {(tableColumns[rightTable] || []).map(col => (
                                        <option key={col} value={col}>{col}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => removeJoin(join.id)}
                                    className="text-red-600 hover:text-red-800 text-sm font-bold px-2"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* WHERE Conditions */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-bold text-gray-700">WHERE Uslovi</label>
                    <button
                        onClick={addWhereCondition}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium"
                    >
                        + Dodaj Uslov
                    </button>
                </div>
                {whereConditions.map((cond, idx) => (
                    <div key={cond.id} className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                            {idx > 0 && (
                                <select
                                    value={cond.logic}
                                    onChange={(e) => updateWhereCondition(cond.id, 'logic', e.target.value)}
                                    className="p-2 border border-gray-300 rounded text-sm"
                                >
                                    <option value="AND">AND</option>
                                    <option value="OR">OR</option>
                                </select>
                            )}
                            <Autocomplete
                                options={[mainTable, ...joins.filter(j => j.table).map(j => j.table)].filter(Boolean)}
                                value={cond.table}
                                onChange={(value) => {
                                    updateWhereCondition(cond.id, 'table', value);
                                    if (value) {
                                        loadTableColumns(value);
                                    }
                                }}
                                placeholder="Tabela..."
                                className="p-0"
                            />
                            <select
                                value={cond.column}
                                onChange={(e) => updateWhereCondition(cond.id, 'column', e.target.value)}
                                className="p-2 border border-gray-300 rounded text-sm"
                            >
                                <option value="">Izaberi kolonu...</option>
                                {(tableColumns[cond.table || mainTable] || []).map(colName => (
                                    <option key={colName} value={colName}>{colName}</option>
                                ))}
                            </select>
                            <select
                                value={cond.operator}
                                onChange={(e) => updateWhereCondition(cond.id, 'operator', e.target.value)}
                                className="p-2 border border-gray-300 rounded text-sm"
                            >
                                <option value="=">=</option>
                                <option value="!=">!=</option>
                                <option value=">">&gt;</option>
                                <option value="<">&lt;</option>
                                <option value=">=">&gt;=</option>
                                <option value="<=">&lt;=</option>
                                <option value="LIKE">LIKE</option>
                                <option value="IN">IN</option>
                            </select>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Vrednost"
                                    value={cond.value}
                                    onChange={(e) => updateWhereCondition(cond.id, 'value', e.target.value)}
                                    className="p-2 border border-gray-300 rounded text-sm flex-1"
                                />
                                <button
                                    onClick={() => removeWhereCondition(cond.id)}
                                    className="text-red-600 hover:text-red-800 text-sm font-bold"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* GROUP BY */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-bold text-gray-700">GROUP BY</label>
                    <button
                        onClick={addGroupBy}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium"
                    >
                        + Dodaj Kolonu
                    </button>
                </div>
                {groupByColumns.map(gb => (
                    <div key={gb.id} className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-2">
                        <Autocomplete
                            options={[mainTable, ...joins.filter(j => j.table).map(j => j.table)].filter(Boolean)}
                            value={gb.table}
                            onChange={(value) => {
                                updateGroupBy(gb.id, 'table', value);
                                if (value) {
                                    loadTableColumns(value);
                                }
                            }}
                            placeholder="Tabela..."
                            className="p-0"
                        />
                        <select
                            value={gb.column}
                            onChange={(e) => updateGroupBy(gb.id, 'column', e.target.value)}
                            className="p-2 border border-gray-300 rounded text-sm flex-1"
                        >
                            <option value="">Izaberi kolonu...</option>
                            {(tableColumns[gb.table || mainTable] || []).map(colName => (
                                <option key={colName} value={colName}>{colName}</option>
                            ))}
                        </select>
                        <button
                            onClick={() => removeGroupBy(gb.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-bold"
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>

            {/* ORDER BY */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-bold text-gray-700">ORDER BY</label>
                    <button
                        onClick={addOrderBy}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium"
                    >
                        + Dodaj Kolonu
                    </button>
                </div>
                {orderByColumns.map(ob => (
                    <div key={ob.id} className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-2">
                        <Autocomplete
                            options={[mainTable, ...joins.filter(j => j.table).map(j => j.table)].filter(Boolean)}
                            value={ob.table}
                            onChange={(value) => {
                                updateOrderBy(ob.id, 'table', value);
                                if (value) {
                                    loadTableColumns(value);
                                }
                            }}
                            placeholder="Tabela..."
                            className="p-0"
                        />
                        <select
                            value={ob.column}
                            onChange={(e) => updateOrderBy(ob.id, 'column', e.target.value)}
                            className="p-2 border border-gray-300 rounded text-sm flex-1"
                        >
                            <option value="">Izaberi kolonu...</option>
                            {(tableColumns[ob.table || mainTable] || []).map(colName => (
                                <option key={colName} value={colName}>{colName}</option>
                            ))}
                        </select>
                        <select
                            value={ob.direction}
                            onChange={(e) => updateOrderBy(ob.id, 'direction', e.target.value)}
                            className="p-2 border border-gray-300 rounded text-sm"
                        >
                            <option value="ASC">ASC</option>
                            <option value="DESC">DESC</option>
                        </select>
                        <button
                            onClick={() => removeOrderBy(ob.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-bold"
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>

            {/* SQL Preview */}
            {generatedSQL && (
                <div className="bg-gray-900 text-green-400 p-4 rounded-xl shadow-sm border border-gray-700">
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-bold text-gray-300">Generisani SQL Upit</label>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(generatedSQL);
                                alert('SQL upit kopiran u clipboard!');
                            }}
                            className="text-xs text-gray-400 hover:text-gray-200"
                        >
                            Kopiraj
                        </button>
                    </div>
                    <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">{generatedSQL}</pre>
                </div>
            )}

            {/* Generate Button */}
            <div className="flex justify-end gap-2">
                <button
                    onClick={handleGenerate}
                    disabled={!mainTable || !generatedSQL}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white py-2 px-6 rounded-lg font-medium text-sm"
                >
                    Generiši SQL Upit
                </button>
            </div>
        </div>
    );
};

export default QueryBuilder;

