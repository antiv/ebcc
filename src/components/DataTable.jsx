import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Papa from 'papaparse';
import Pagination from './Pagination';
import { PAGE_SIZE } from '../constants';
import { getLatLonIndices, parseCoordinate } from '../utils/helpers';

const DataTable = ({ columns, data, title, enableMapsExport = true, className = "", stickyHeader = false, rowAction = null, columnRoles = {}, stickyColumns = 0, onAlert = null }) => {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [sortCol, setSortCol] = useState(null);
    const [sortDir, setSortDir] = useState("ASC");
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('dataTableViewMode') || 'pagination');
    const [visibleRows, setVisibleRows] = useState(PAGE_SIZE);
    const scrollContainerRef = useRef(null);

    useEffect(() => { setPage(1); setSearch(""); setSortCol(null); setSortDir("ASC"); setVisibleRows(PAGE_SIZE); }, [data, columns]);

    useEffect(() => {
        localStorage.setItem('dataTableViewMode', viewMode);
        setVisibleRows(PAGE_SIZE);
    }, [viewMode]);

    useEffect(() => {
        setVisibleRows(PAGE_SIZE);
    }, [search, sortCol, sortDir]);

    const filteredData = useMemo(() => {
        if (!search) return data;
        const lowerSearch = search.toLowerCase();
        return data.filter(row => row.some(val => val !== null && String(val).toLowerCase().includes(lowerSearch)));
    }, [data, search]);

    const sortedData = useMemo(() => {
        if (sortCol === null) return filteredData;
        return [...filteredData].sort((a, b) => {
            const valA = a[sortCol];
            const valB = b[sortCol];
            if (valA === valB) return 0;
            if (valA === null) return 1;
            if (valB === null) return -1;
            const isNum = typeof valA === 'number' && typeof valB === 'number';
            let comparison = isNum ? valA - valB : String(valA).localeCompare(String(valB));
            return sortDir === "ASC" ? comparison : -comparison;
        });
    }, [filteredData, sortCol, sortDir]);

    const paginatedData = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return sortedData.slice(start, start + PAGE_SIZE);
    }, [sortedData, page]);

    const displayData = useMemo(() => {
        if (viewMode === 'pagination') return paginatedData;
        return sortedData.slice(0, visibleRows);
    }, [viewMode, paginatedData, sortedData, visibleRows]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container || viewMode !== 'infinite') return;

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            const scrollBottom = scrollHeight - scrollTop - clientHeight;

            if (scrollBottom < 100 && visibleRows < sortedData.length) {
                setVisibleRows(prev => Math.min(prev + PAGE_SIZE, sortedData.length));
            }
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [viewMode, visibleRows, sortedData.length]);

    const handleSort = (index) => {
        if (sortCol === index) setSortDir(sortDir === "ASC" ? "DESC" : "ASC");
        else { setSortCol(index); setSortDir("ASC"); }
    };

    const exportCSV = (mode) => {
        if (!filteredData || filteredData.length === 0) {
            const message = t('dataTable.noDataForExport');
            if (onAlert) {
                onAlert(message);
            } else {
                alert(message);
            }
            return;
        }
        let exportData = [];
        if (mode === 'standard') {
            exportData = filteredData.map(row => {
                let obj = {};
                columns.forEach((col, i) => {
                    if (col !== 'rowid') obj[col] = row[i];
                });
                return obj;
            });
        } else if (mode === 'google') {
            const { latIdx, lonIdx } = getLatLonIndices(columns, columnRoles);
            if (latIdx === -1 || lonIdx === -1) {
                const message = t('dataTable.latLonNotFound');
                if (onAlert) {
                    onAlert(message);
                } else {
                    alert(message);
                }
                return;
            }
            exportData = filteredData.map(row => {
                let obj = {};
                const lon = parseCoordinate(row[lonIdx]);
                const lat = parseCoordinate(row[latIdx]);
                obj["WKT"] = `POINT(${lon} ${lat})`;
                columns.forEach((col, i) => obj[col] = row[i]);
                return obj;
            });
        }
        const csv = Papa.unparse(exportData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${(title || 'export').replace(/\s+/g, '_')}_${mode}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Determine if we need scroll container with fixed height
    const needsScrollContainer = viewMode === 'infinite' || stickyHeader;
    // If className contains flex-1, we're in a flex container, otherwise use fixed height
    const isInFlexContainer = className && className.includes('flex-1');
    const containerStyle = needsScrollContainer && !isInFlexContainer ? { maxHeight: '600px' } : {};

    return (
        <div className={`bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col ${needsScrollContainer ? 'overflow-hidden min-h-0' : ''} ${className || 'mb-8'}`} style={containerStyle}>
            <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row gap-4 items-center justify-between bg-gray-50 flex-shrink-0">
                <div className="flex flex-col md:flex-row md:items-center gap-4 w-full">
                    <div className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2 whitespace-nowrap">
                        {title || t('dataTable.results')}
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">{filteredData.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => exportCSV('standard')} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition shadow-sm">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> {t('dataTable.exportCsv')}
                        </button>
                        {enableMapsExport && (
                            <button onClick={() => exportCSV('google')} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition shadow-sm">
                                <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg> {t('dataTable.exportMapsCsv')}
                            </button>
                        )}
                        <div className="border-l border-gray-300 h-6 mx-1"></div>
                        <button
                            onClick={() => setViewMode(viewMode === 'pagination' ? 'infinite' : 'pagination')}
                            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition shadow-sm"
                            title={viewMode === 'pagination' ? t('dataTable.switchToInfinite') : t('dataTable.switchToPagination')}
                        >
                            {viewMode === 'pagination' ? (
                                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path></svg> {t('dataTable.infiniteScroll')}</>
                            ) : (
                                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg> {t('dataTable.pagination')}</>
                            )}
                        </button>
                    </div>
                </div>
                <div className="relative w-full md:w-64 mt-2 md:mt-0">
                    <input type="text" placeholder={t('common.search')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
            </div>
            <div ref={scrollContainerRef} className={`overflow-x-auto custom-scroll ${needsScrollContainer ? 'flex-1 overflow-y-auto min-h-0' : ''}`}>
                <table className="min-w-full divide-y divide-gray-200 text-sm text-left relative">
                    <thead className={`bg-gray-50 ${stickyHeader || viewMode === 'infinite' ? 'sticky top-0 z-10 shadow-sm' : ''}`}>
                        <tr>
                            {columns.map((col, i) => {
                                const isSticky = i < stickyColumns;
                                const isLastSticky = i === stickyColumns - 1;
                                const leftOffset = i * 200; // Approximate column width, adjust if needed
                                return (
                                    <th 
                                        key={i} 
                                        onClick={() => handleSort(i)} 
                                        className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none group border-b border-gray-200 bg-gray-50 ${isSticky ? 'sticky z-20' : ''} ${isLastSticky ? 'border-r-2 border-gray-300' : ''}`}
                                        style={isSticky ? { left: `${leftOffset}px` } : {}}
                                    >
                                        <div className="flex items-center gap-1">{col} {sortCol === i ? <span className="text-blue-600">{sortDir === 'ASC' ? '▲' : '▼'}</span> : <span className="text-gray-300 opacity-0 group-hover:opacity-100 transition">▲</span>}</div>
                                    </th>
                                );
                            })}
                            {rowAction && <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-50 text-right">{t('common.actions')}</th>}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {displayData.length > 0 ? (
                            displayData.map((row, i) => (
                                <tr key={i} className="hover:bg-blue-50 transition-colors group/row">
                                    {row.map((val, j) => {
                                        const isSticky = j < stickyColumns;
                                        const isLastSticky = j === stickyColumns - 1;
                                        const leftOffset = j * 200; // Approximate column width, adjust if needed
                                        return (
                                            <td 
                                                key={j} 
                                                className={`px-6 py-3 whitespace-nowrap text-gray-700 max-w-xs overflow-hidden text-ellipsis ${isSticky ? 'sticky z-10 bg-white group-hover/row:bg-blue-50' : ''} ${isLastSticky ? 'border-r-2 border-gray-300' : ''}`}
                                                style={isSticky ? { left: `${leftOffset}px` } : {}}
                                                title={val}
                                            >
                                                {val === null ? <span className="text-gray-300 italic">null</span> : val}
                                            </td>
                                        );
                                    })}
                                    {rowAction && <td className="px-6 py-3 whitespace-nowrap text-right">{rowAction(row)}</td>}
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan={columns.length + (rowAction ? 1 : 0)} className="px-6 py-12 text-center text-gray-400">{t('common.noResults')}</td></tr>
                        )}
                        {viewMode === 'infinite' && visibleRows < sortedData.length && (
                            <tr><td colSpan={columns.length + (rowAction ? 1 : 0)} className="px-6 py-4 text-center text-gray-400 text-sm">{t('common.loadingData')}</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            {viewMode === 'pagination' ? (
                <div className="p-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between flex-shrink-0">
                    <div className="text-xs text-gray-500">{t('dataTable.showing', { start: Math.min((page - 1) * PAGE_SIZE + 1, filteredData.length), end: Math.min(page * PAGE_SIZE, filteredData.length), total: filteredData.length })}</div>
                    <Pagination currentPage={page} totalCount={filteredData.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
                </div>
            ) : (
                <div className="p-3 border-t border-gray-200 bg-gray-50 flex items-center justify-center flex-shrink-0">
                    <div className="text-xs text-gray-500">{t('dataTable.showingInfinite', { visible: Math.min(visibleRows, filteredData.length), total: filteredData.length })}</div>
                </div>
            )}
        </div>
    );
};

export default DataTable;
