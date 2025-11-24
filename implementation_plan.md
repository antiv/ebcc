# Implementation Plan - Empty Database Support

The goal is to allow users to start with a fresh, empty database or automatically initialize missing tables when loading an existing database.

## User Review Required

> [!NOTE]
> I will use the schema definitions from `tables.sql` provided by the user.

## Proposed Changes

### src

#### [MODIFY] [App.jsx](file:///Users/ivanantonijevic/development/temp/ebcc/src/App.jsx)
- Import the content of `tables.sql` (I will need to read it as a string).
- Extract table initialization logic into a helper function `initializeDatabase(db)`.
- In `initializeDatabase`, execute the SQL from `tables.sql` to create the main tables if they don't exist.
- Update `handleFileUpload` to use `initializeDatabase`.
- Add `handleCreateEmptyDb` function to create a new database and initialize it.
- Add "Start with Empty Database" button to the initial landing screen.

#### [NEW] [tables.js](file:///Users/ivanantonijevic/development/temp/ebcc/src/tables.js)
- Create a JS file to export the SQL string from `tables.sql` so it can be easily imported into `App.jsx`. Or I can just copy the content into a constant in `App.jsx` or `constants.js` if importing raw SQL is tricky with the current Vite setup without extra plugins. **Decision: I will copy the content to `src/constants.js` as a constant string `INITIAL_SCHEMA` to avoid build issues.**

#### [MODIFY] [constants.js](file:///Users/ivanantonijevic/development/temp/ebcc/src/constants.js)
- Add `INITIAL_SCHEMA` constant containing the SQL from `tables.sql`.

## Verification Plan

### Manual Verification
- **Start Empty**: Click the new button and verify that the dashboard loads with empty tables.
- **Check Tables**: Go to the "Database" tab and verify that `shumske`, `bregunice`, `naturalist` exist and have the correct columns (I can check this by trying to export or viewing the table info in SQL console).
- **Load Empty DB**: Load a physically empty `.db` file and verify tables are created.
