const EBCC_MAPPINGS = {
    shumske: {
        "ime_tacke": ["Ime tačke", "Ime tacke", "ime_tacke"],
        "latituda": ["Latituda", "Lat", "latituda"],
        "longituda": ["Longituda", "Lon", "longituda"],
        "planina": ["Planina", "Planina (dopisati)", "planina"],
        "datum": ["Datum", "datum"],
        "period_osmatranja": ["Period osmatranja", "period_osmatranja"],
        "vrsta": ["Vrsta", "vrsta"],
        "broj": ["Broj", "broj"],
        "ex_p_m_g_f": ["ex/p/m/g/f", "ex_p_m_g_f"],
        "atlas_kod": ["Atlas kod", "atlas_kod"],
        "dozivane_vrste": ["Dozivane vrste", "dozivane_vrste"],
        "tip_sume": ["Tip šume ", "Tip sume", "tip_sume"],
        "status_sume": ["Status šume", "Status sume", "status_sume"],
        "podrast": ["Podrast", "Podrast (nabrojati)", "podrast"],
        "napomena_o_stanistu": ["Napomena o staništu", "Napomena o stanistu", "napomena_o_stanistu"],
        "ekspozicija": ["Ekspozicija ", "Ekspozicija", "ekspozicija"],
        "oblacnost": ["Oblačnost", "Oblacnost", "oblacnost"],
        "vetar": ["Vetar", "vetar"],
        "temperatura": ["Temperatura", "temperatura"],
        "napomena": ["Napomena", "napomena"],
        "popisivaci": ["Popisivači", "Popisivaci", "popisivaci"]
    },
    bregunice: {
        "lokalitet": ["Lokalitet", "lokalitet"],
        "maks_broj_jedinki": ["Maks. broj jedinki", "maks_broj_jedinki"],
        "kvalitet_brojanja": ["Kvalitet brojanja", "kvalitet_brojanja"],
        "ukupan_broj_rupa_u_koloniji": ["Ukupan broj rupa u koloniji", "ukupan_broj_rupa_u_koloniji"],
        "broj_aktivnih_rupa_u_koloniji": ["Broj aktivnih rupa u koloniji", "broj_aktivnih_rupa_u_koloniji"],
        "kvalitet_brojanja_1": ["Kvalitet brojanja_1", "kvalitet_brojanja_1"],
        "datum": ["Datum", "datum"],
        "period_osmatranja": ["Period osmatranja", "period_osmatranja"],
        "latituda": ["Latituda", "latituda"],
        "longituda": ["Longituda", "longituda"],
        "staniste": ["Stanište", "Staniste", "staniste"],
        "ugrozavanje": ["Ugrožavanje", "Ugrozavanje", "ugrozavanje"],
        "temperatura": ["Temperatura", "temperatura"],
        "brzina_vetra": ["Brzina vetra", "brzina_vetra"],
        "napomena": ["Napomena", "napomena"],
        "popisivac": ["Popisivač", "Popisivac", "popisivac"]
    },
    naturalist: {
        "Latin name": ["Naučni naziv", "Latin name", "Naucni naziv"],
        "Date": ["Datum", "Date"],
        "Day": ["Dan", "Day"],
        "Month": ["Mesec", "Month"],
        "Year": ["Godina", "Year"],
        "Timing": ["Vreme", "Timing"],
        "Latitude (N)": ["Latituda (N)", "Latitude (N)"],
        "Longitude (E)": ["Longituda (E)", "Longitude (E)"],
        "Latitude (DMS)": ["Latituda (DMS)", "Latitude (DMS)"],
        "Longitude (DMS)": ["Longituda (DMS)", "Longitude (DMS)"],
        "Altitude": ["Nadmorska visina", "Altitude"],
        "Estimation": ["Procena", "Estimation"],
        "Number": ["Broj", "Number"],
        "Details": ["Detalji", "Details"],
        "Altas code": ["Atlas kod", "Altas code"],
        "Comment": ["Komentar", "Comment"],
        "Observer": ["Posmatrači", "Posmatraci", "Observer"]
    }
};

const BIODATA_MAPPINGS = {};

// Check environment mode - default to 'ebcc' for backward compatibility
const APP_MODE = import.meta.env.VITE_APP_MODE || 'ebcc';

export const DEFAULT_MAPPINGS = APP_MODE === 'biodata' ? BIODATA_MAPPINGS : EBCC_MAPPINGS;

export const PAGE_SIZE = 20;

const EBCC_SCHEMA = `
-- bregunice definition

CREATE TABLE IF NOT EXISTS bregunice (
    lokalitet NVARCHAR(50),
    maks_broj_jedinki INTEGER,
    kvalitet_brojanja NVARCHAR(50),
    ukupan_broj_rupa_u_koloniji INTEGER,
    broj_aktivnih_rupa_u_koloniji INTEGER,
    kvalitet_brojanja_1 NVARCHAR(50),
    datum NVARCHAR(50),
    period_osmatranja NVARCHAR(50),
    latituda REAL,
    longituda REAL,
    staniste VARCHAR(50),          -- Original: Stanište
    ugrozavanje VARCHAR(50),       -- Original: Ugrožavanje
    temperatura VARCHAR(50),
    brzina_vetra VARCHAR(50),
    napomena NVARCHAR(256),
    popisivac VARCHAR(128)         -- Original: Popisivač
);

-- naturalist definition

CREATE TABLE IF NOT EXISTS naturalist (
	"species" VARCHAR(50),
	Date VARCHAR(50),
	"Day" VARCHAR(50),
	"Month" VARCHAR(50),
	"Year" VARCHAR(50),
	Timing VARCHAR(50),
	"Latitude (N)" VARCHAR(50),
	"Longitude (E)" VARCHAR(50),
	"Latitude (DMS)" VARCHAR(50),
	"Longitude (DMS)" VARCHAR(50),
	Altitude VARCHAR(50),
	Estimation VARCHAR(50),
	"Number" VARCHAR(50),
	Details VARCHAR(50),
	"Altas code" VARCHAR(50),
	Comment VARCHAR(50),
	Observer VARCHAR(50)
);

-- shumske definition

CREATE TABLE IF NOT EXISTS shumske (
    ime_tacke VARCHAR(50),
    latituda REAL,
    longituda REAL,
    planina VARCHAR(50),            -- Original: "Planina (dopisati)"
    datum NVARCHAR(50),
    period_osmatranja NVARCHAR(50),
    vrsta VARCHAR(50),
    broj VARCHAR(50),
    ex_p_m_g_f VARCHAR(50),         -- Original: "ex/p/m/g/f"
    atlas_kod VARCHAR(50),
    dozivane_vrste VARCHAR(50),
    tip_sume VARCHAR(50),           -- Original: "Tip šume "
    status_sume VARCHAR(50),        -- Original: "Status šume"
    podrast VARCHAR(64),            -- Original: "Podrast (nabrojati)"
    napomena_o_stanistu VARCHAR(64),
    ekspozicija VARCHAR(50),
    oblacnost INTEGER,              -- Original: "Oblačnost"
    vetar INTEGER,
    temperatura INTEGER,
    napomena VARCHAR(50),
    popisivaci VARCHAR(50)          -- Original: "Popisivači"
);
`;

const BIODATA_SCHEMA = `
-- No default tables for biodata mode
-- Users will create their own tables dynamically
`;

export const INITIAL_SCHEMA = APP_MODE === 'biodata' ? BIODATA_SCHEMA : EBCC_SCHEMA;
