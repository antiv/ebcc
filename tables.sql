-- bregunice definition

CREATE TABLE bregunice (
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

CREATE TABLE naturalist (
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

CREATE TABLE shumske (
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