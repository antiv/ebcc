import React, { useState, useEffect } from 'react';

const EditRowModal = ({ isOpen, onClose, onSave, columns, initialData }) => {
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (isOpen && initialData) {
            // Initialize form data with initialData
            // initialData is an array of values corresponding to columns
            const data = {};
            columns.forEach((col, index) => {
                data[col] = initialData[index];
            });
            setFormData(data);
        }
    }, [isOpen, initialData, columns]);

    const handleChange = (col, value) => {
        setFormData(prev => ({ ...prev, [col]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    const formatLabel = (text) => {
        if (!text) return "";
        return text
            .replace(/_/g, " ")
            .replace(/([A-Z])/g, " $1") // Add space before capital letters (camelCase)
            .trim()
            .replace(/^\w/, (c) => c.toUpperCase()); // Capitalize first letter
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in">
                <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="text-xl font-bold text-gray-800">Izmeni Red</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {columns.map((col) => {
                            if (col === 'rowid') return null; // Don't edit rowid
                            return (
                                <div key={col}>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">{formatLabel(col)}</label>
                                    <input
                                        type="text"
                                        value={formData[col] === null ? '' : formData[col]}
                                        onChange={(e) => handleChange(col, e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition"
                                    />
                                </div>
                            );
                        })}
                    </div>
                </form>

                <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium transition">Otkaži</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-md transition transform active:scale-95">Sačuvaj Izmene</button>
                </div>
            </div>
        </div>
    );
};

export default EditRowModal;
