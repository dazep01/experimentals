# ForgeEdit - *Integrated with [GitMoire](https://dazep01.github.io/experimentals/apps/gitmoire.html)*

> A browser-native development workflow for building, staging, committing, and shipping projects directly from the web.

ForgeEdit and GitMoire together create a lightweight development environment that runs entirely in the browser. No desktop IDEs, no local Git installation, and no constant switching between editors, terminals, GitHub pages, and deployment tools.

---

## Overview

**ForgeEdit** is a project-oriented code editor powered by IndexedDB.

**GitMoire** is a GitHub workspace with AI-assisted workflows, staging, commits, repository synchronization, and source control management.

Together they provide a complete development workflow:

```text
ForgeEdit
    ↓
Edit Files
    ↓
Send to GitMoire
    ↓
Stage Changes
    ↓
Commit
    ↓
Push to GitHub
```

Everything happens inside the browser.

---

## Why?

Traditional workflows often require multiple tools:

```text
Code Editor
    ↓
Terminal
    ↓
Git Commands
    ↓
GitHub
    ↓
Deployment
```

Or on mobile:

```text
Editor App
    ↓
Browser
    ↓
GitHub
    ↓
Upload
    ↓
Commit
```

ForgeEdit + GitMoire simplifies this into a single environment.

```text
ForgeEdit
    ↕
GitMoire
```

No Git CLI.

No VS Code dependency.

No Codespaces dependency.

No backend server.

No cloud synchronization service.

---

## Architecture

### ForgeEdit

Responsible for:

* Project editing
* File management
* Project explorer
* Tabs
* Markdown editing
* Code editing
* Local project persistence

Storage:

```text
IndexedDB
└── ForgeEditDB
```

---

### GitMoire

Responsible for:

* Repository synchronization
* GitHub integration
* Staging files
* Commit workflows
* AI-assisted operations
* Branch management

Storage:

```text
localStorage
└── GitMoire_v1
```

---

### Bridge Layer

The integration layer between both applications.

```text
ForgeEditDB
      │
      ▼
ForgeEdit_To_GitMoire
      │
      ▼
GitMoire
```

Selected files are exported from IndexedDB and temporarily stored in a lightweight bridge payload.

Example:

```json
[
  {
    "name": "src/app.js",
    "content": "console.log('Hello World');"
  }
]
```

GitMoire automatically imports these files into its staging area.

---

## Workflow

### 1. Create or edit files

Work normally inside ForgeEdit.

Projects remain stored locally inside IndexedDB.

---

### 2. Send files

Click:

```text
⇄ Send to GitMoire
```

Select one or more files.

ForgeEdit exports them to the bridge storage.

---

### 3. Stage automatically

Open GitMoire.

Files appear immediately inside:

```text
Staged Files
```

No manual upload required.

---

### 4. Commit

Commit staged files through GitMoire.

```text
Commit
    ↓
Push
    ↓
GitHub
```

---

## Features

### ForgeEdit

* Project Explorer
* IndexedDB Storage
* Markdown Editor
* Code Editor
* Multiple Tabs
* File Tree
* PWA Support
* Offline-first Design

### GitMoire

* GitHub Repository Sync
* Branch Management
* Commit Operations
* Staged Files Workflow
* AI Integration
* Context Files
* Local Credential Storage
* Session Persistence

### Integration

* File Selection Modal
* Multi-file Transfer
* Browser-native Bridge
* Zero Backend Dependency
* Zero Server Requirement
* Cross-Application Workflow

---

## Design Philosophy

ForgeEdit and GitMoire intentionally remain separate applications.

Instead of creating one massive application that does everything, each tool focuses on a single responsibility.

```text
ForgeEdit
= Editing Workspace

GitMoire
= Source Control Workspace

Bridge
= Workflow Layer
```

This keeps the architecture modular, maintainable, and easier to evolve.

---

## Technical Notes

### ForgeEdit Storage

```text
IndexedDB
Database: ForgeEditDB
```

### GitMoire Storage

```text
localStorage
Key: GitMoire_v1
```

### Integration Bridge

```text
localStorage
Key: ForgeEdit_To_GitMoire
```

### Data Flow

```text
ForgeEdit
    ↓
IndexedDB
    ↓
Bridge Storage
    ↓
GitMoire
    ↓
Staged Files
    ↓
GitHub
```

---

## Vision

A browser should be capable of hosting a complete development environment.

ForgeEdit and GitMoire explore that idea through a fully client-side workflow that enables project creation, editing, version control, and GitHub publishing without leaving the browser.

No installation.

No backend.

Just build.
