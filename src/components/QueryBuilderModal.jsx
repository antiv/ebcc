import React, { useState } from 'react';
import QueryBuilder from './QueryBuilder';

const QueryBuilderModal = ({ isOpen, onClose, db, dbTables, onGenerateQuery }) => {
    const [currentQuery, setCurrentQuery] = useState('');

    const handleGenerate = (sql) => {
        setCurrentQuery(sql);
    };

    const handleExecute = () => {
        if (currentQuery && onGenerateQuery) {
            onGenerateQuery(currentQuery);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col animate-fade-in">
                <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="text-xl font-bold text-gray-800">Query Builder</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <QueryBuilder
                        db={db}
                        dbTables={dbTables}
                        onGenerateQuery={handleGenerate}
                    />
                </div>
                {currentQuery && (
                    <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
                        <button
                            onClick={() => {
                                setCurrentQuery('');
                            }}
                            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium"
                        >
                            Obriši
                        </button>
                        <button
                            onClick={handleExecute}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
                        >
                            Izvrši Upit
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default QueryBuilderModal;

