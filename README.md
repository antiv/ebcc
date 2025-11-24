# BioData Manager

BioData Manager is a web-based application for managing biological data stored in SQLite databases. It runs entirely in the browser using `sql.js`, allowing for secure and fast data manipulation without a backend server.

## Features

- **Database Management**:
  - Load local SQLite (`.db`, `.sqlite`, `.sqlite3`) files.
  - View and manage tables.
  - Export the modified database.

- **Data Viewing**:
  - Interactive data tables with pagination, sorting, and filtering.
  - Specialized views for 'shumske', 'naturalist', and 'bregunice' tables.
  - Export data to CSV.
  - Export data to "Maps CSV" format (WKT) for geospatial visualization.

- **Data Import**:
  - Import data from CSV files.
  - Customizable column mapping between CSV and database tables.
  - Validation of column matching before import.
  - Transaction-based imports for data integrity.

- **Import History & Undo**:
  - Track all data imports.
  - Undo imports to revert changes (restores data from backup tables).

- **SQL Console**:
  - Execute custom SQL queries directly against the database.
  - View query results in interactive tables.

- **Settings**:
  - Configure and save column mappings for different tables.

## Technologies

- **Frontend**: React, Vite
- **Database**: sql.js (SQLite in the browser)
- **CSV Parsing**: PapaParse
- **Styling**: Tailwind CSS (via utility classes)

## Getting Started

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Run the development server**:
    ```bash
    npm run dev
    ```

3.  **Build for production**:
    ```bash
    npm run build
    ```

## Usage

1.  Open the application in your browser.
2.  Click "Izaberi Fajl Baze" to load your SQLite database file.
3.  Use the navigation tabs to switch between Dashboard, Viewer, Import, Database, SQL Console, and Settings.
