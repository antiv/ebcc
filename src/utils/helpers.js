export const getLatLonIndices = (columns, overrides = {}) => {
    let latIdx = -1;
    if (overrides.lat && columns.includes(overrides.lat)) {
        latIdx = columns.indexOf(overrides.lat);
    } else {
        latIdx = columns.findIndex(c => /^latitud/i.test(c));
        if (latIdx === -1) latIdx = columns.findIndex(c => /latitud/i.test(c));
    }

    let lonIdx = -1;
    if (overrides.lon && columns.includes(overrides.lon)) {
        lonIdx = columns.indexOf(overrides.lon);
    } else {
        lonIdx = columns.findIndex(c => /^longitud/i.test(c));
        if (lonIdx === -1) lonIdx = columns.findIndex(c => /longitud/i.test(c));
    }

    return { latIdx, lonIdx };
};

/**
 * Parses coordinate value to decimal degrees format
 * Handles:
 * - Decimal format with E/N/W/S suffix: '45.78996 N' -> 45.78996
 * - DMS format: '45°33'47.42"' -> 45.563172, '20° 2'28.55" S' -> -20.041264
 */
export const parseCoordinate = (value) => {
    if (value === null || value === undefined || value === '') {
        return 0;
    }

    const str = String(value).trim();

    // Check if it's DMS format (contains °, ', and ")
    const dmsMatch = str.match(/^(-?\d+)[°\s]+(\d+)[\s']+([\d.]+)["\s]*([NSEW]?)$/i);
    if (dmsMatch) {
        const degrees = parseFloat(dmsMatch[1]);
        const minutes = parseFloat(dmsMatch[2]);
        const seconds = parseFloat(dmsMatch[3]);
        const direction = dmsMatch[4].toUpperCase();

        let decimal = degrees + minutes / 60 + seconds / 3600;

        // Make negative for S or W
        if (direction === 'S' || direction === 'W') {
            decimal = -decimal;
        }

        return decimal;
    }

    // Handle decimal format with E/N/W/S suffix
    const decimalMatch = str.match(/^(-?[\d.]+)\s*([NSEW]?)$/i);
    if (decimalMatch) {
        let decimal = parseFloat(decimalMatch[1]);
        const direction = decimalMatch[2].toUpperCase();

        // Make negative for S or W
        if (direction === 'S' || direction === 'W') {
            decimal = -Math.abs(decimal);
        } else if (direction === 'N' || direction === 'E') {
            decimal = Math.abs(decimal);
        }

        return decimal;
    }

    // Try to parse as plain number
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
};
