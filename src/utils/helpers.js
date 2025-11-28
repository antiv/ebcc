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
