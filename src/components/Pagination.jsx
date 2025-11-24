import React from 'react';

const Pagination = ({ currentPage, totalCount, pageSize, onPageChange }) => {
    const totalPages = Math.ceil(totalCount / pageSize);
    if (totalPages <= 1) return null;

    const getPageNumbers = () => {
        const delta = 1;
        const range = [];
        const rangeWithDots = [];
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
                range.push(i);
            }
        }
        let l;
        for (let i of range) {
            if (l) {
                if (i - l === 2) rangeWithDots.push(l + 1);
                else if (i - l !== 1) rangeWithDots.push('...');
            }
            rangeWithDots.push(i);
            l = i;
        }
        return rangeWithDots;
    };

    return (
        <div className="flex items-center gap-1 select-none">
            <button onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 text-gray-600 bg-white transition min-w-[32px] flex items-center justify-center">&lt;</button>
            {getPageNumbers().map((page, index) => (
                <button key={index} onClick={() => typeof page === 'number' && onPageChange(page)} disabled={page === '...'} className={`px-3 py-1 border rounded text-sm min-w-[32px] h-[30px] flex items-center justify-center transition ${page === currentPage ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-sm' : 'border-transparent bg-transparent text-gray-400 cursor-default hover:text-gray-400'}`}>{page}</button>
            ))}
            <button onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 text-gray-600 bg-white transition min-w-[32px] flex items-center justify-center">&gt;</button>
        </div>
    );
};

export default Pagination;
