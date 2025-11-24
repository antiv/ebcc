# Walkthrough - Empty Database Support

I have implemented the ability to start with an empty database or initialize missing tables in an existing database.

## Changes

### src

#### [constants.js](file:///Users/ivanantonijevic/development/temp/ebcc/src/constants.js)
- Added `INITIAL_SCHEMA` constant containing the SQL definitions for `bregunice`, `naturalist`, and `shumske` tables.

#### [App.jsx](file:///Users/ivanantonijevic/development/temp/ebcc/src/App.jsx)
- Added `initializeDatabase` function to:
    - Execute `INITIAL_SCHEMA` to create main tables if they don't exist.
    - Create `app_import_history` and `app_config` tables.
    - Initialize default mappings.
- Updated `handleFileUpload` to use `initializeDatabase`.
- Added `handleCreateEmptyDb` to create a new in-memory database and initialize it.
- Added "Započni sa Praznom Bazom" button to the landing screen.

## Verification Results

### Automated Tests
- None (this is a UI/Logic change).

### Manual Verification
1.  **Start with Empty Database**:
    - Open the app.
    - Click "Započni sa Praznom Bazom".
    - Verify that the dashboard loads.
    - Go to "Baza" tab and check that `shumske`, `bregunice`, `naturalist` tables exist.
2.  **Load Existing Database**:
    - Load a database file.
    - Verify that if tables were missing, they are now created.
