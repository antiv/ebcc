import React, { useState, useEffect, useRef } from 'react';

const Autocomplete = ({ options, value, onChange, placeholder = "Unesite tekst...", className = "" }) => {
    const [inputValue, setInputValue] = useState(value || '');
    const [filteredOptions, setFilteredOptions] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const inputRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        setInputValue(value || '');
    }, [value]);

    useEffect(() => {
        if (inputValue === '') {
            setFilteredOptions(options);
        } else {
            const filtered = options.filter(opt =>
                opt.toLowerCase().includes(inputValue.toLowerCase())
            );
            setFilteredOptions(filtered);
        }
        setIsOpen(true);
    }, [inputValue, options]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e) => {
        const newValue = e.target.value;
        setInputValue(newValue);
        onChange(newValue);
        setHighlightedIndex(-1);
    };

    const handleSelect = (option) => {
        setInputValue(option);
        onChange(option);
        setIsOpen(false);
        inputRef.current?.blur();
    };

    const handleKeyDown = (e) => {
        if (!isOpen || filteredOptions.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev < filteredOptions.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => (prev > 0 ? prev - 1 : -1));
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
                    handleSelect(filteredOptions[highlightedIndex]);
                } else if (filteredOptions.length === 1) {
                    handleSelect(filteredOptions[0]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                break;
            default:
                break;
        }
    };

    const handleClear = (e) => {
        e.stopPropagation();
        setInputValue('');
        onChange('');
        setIsOpen(false);
        inputRef.current?.focus();
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="w-full p-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
                {inputValue && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                )}
            </div>
            {isOpen && filteredOptions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {filteredOptions.map((option, index) => (
                        <div
                            key={option}
                            onClick={() => handleSelect(option)}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            className={`px-4 py-2 cursor-pointer text-sm ${
                                index === highlightedIndex
                                    ? 'bg-blue-100 text-blue-900'
                                    : 'hover:bg-gray-100 text-gray-700'
                            }`}
                        >
                            {option}
                        </div>
                    ))}
                </div>
            )}
            {isOpen && filteredOptions.length === 0 && inputValue && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
                    <div className="px-4 py-2 text-sm text-gray-500">Nema rezultata</div>
                </div>
            )}
        </div>
    );
};

export default Autocomplete;

