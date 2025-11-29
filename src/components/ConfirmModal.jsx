import React from 'react';
import { useTranslation } from 'react-i18next';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, type = 'confirm' }) => {
    const { t } = useTranslation();
    if (!isOpen) return null;

    const isAlert = type === 'alert';
    const handleConfirm = () => {
        if (onConfirm) onConfirm();
        if (onClose) onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md animate-fade-in overflow-hidden">
                <div className="p-6 border-b border-gray-200 bg-gray-50 flex items-center gap-3">
                    <div className={`p-2 rounded-full ${isAlert ? 'bg-blue-100' : 'bg-red-100'}`}>
                        {isAlert ? (
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        ) : (
                            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                            </svg>
                        )}
                    </div>
                    <h3 className="text-lg font-bold text-gray-800">{title || (isAlert ? t('modals.notification') : t('common.confirm'))}</h3>
                </div>

                <div className="p-6">
                    <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{message}</p>
                </div>

                <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                    {!isAlert && (
                        <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium transition text-sm">{t('common.cancel')}</button>
                    )}
                    <button onClick={handleConfirm} className={`px-4 py-2 ${isAlert ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'} text-white rounded-lg font-medium shadow-md transition transform active:scale-95 text-sm`}>
                        {isAlert ? t('common.ok') : t('common.confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
