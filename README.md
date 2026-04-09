# 📘 Smart Academic Management System (CCS)

## 📌 Project Overview

An Integrated Smart Academic Management System with Data Analytics for:

1. Thesis/Capstone Archiving and HTE
2. Faculty Requirement Submission
3. Class List and Student Violation Management
4. Laboratory Time-In/Out Monitoring

Built using **Electron.js, Node.js, and MySQL (XAMPP)**.

---

# 🚀 Getting Started

## 🧰 Prerequisites

Make sure you have the following installed:

* [Node.js](https://nodejs.org/) (v18 or higher recommended)
* npm (comes with Node.js)
* Git
* XAMPP (for MySQL database)

---

## 📥 Clone the Repository

```bash
git clone https://github.com/SmartAcademicBSIT3B/smart-academic-system-ccs.git
cd smart-academic-system-ccs
```

---

## 📦 Install Dependencies

```bash
npm install
```

👉 This will install all required packages including Electron.

---

# ⚠️ Windows PowerShell Fix (npm not working)

If you encounter this error:

```
npm.ps1 cannot be loaded because running scripts is disabled on this system
```

This happens because PowerShell blocks script execution by default.

---

## ✅ Solution (Recommended)

1. Open **PowerShell as Administrator**
2. Run the following command:

```bash
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

3. Type:

```bash
Y
```

4. Restart your terminal

---

## ▶️ Then run again:

```bash
npm install
npm start
```

---

## 🟡 Alternative (Temporary Fix)

If you don’t want to change system settings:

```bash
Set-ExecutionPolicy Bypass -Scope Process
```

👉 This only works for the current session

---

## 🟢 Alternative (Easiest)

You can also use:

* Command Prompt (cmd)
* Git Bash

Instead of PowerShell, then run:

```bash
npm install
npm start
```

---

## 🔐 Note

This is safe and commonly used for development.
It only allows locally created scripts to run.

---


## ▶️ Run the Application

```bash
npm start
```

👉 This will launch the Electron desktop app.

---

# 🛠️ Project Structure

```
electron/        → Main process (Electron backend)
renderer/        → Frontend UI
services/        → Business logic
database/        → Database files
assets/          → Images and static files
```

---

# 👨‍💻 Development Workflow

## 🔄 Pull Latest Changes

Before starting work:

```bash
git pull origin main
```

---

## 🌿 Create a Feature Branch

Each module should have its own branch:

```bash
git checkout -b feature/archive-module
```

Other examples:

* feature/faculty-module
* feature/class-module
* feature/time-module

---

## ✏️ Make Changes & Commit

```bash
git add .
git commit -m "M1: Add archive dashboard UI"
```

---

## ⬆️ Push Your Branch

```bash
git push -u origin feature/archive-module
```

---

## 🔀 Create Pull Request (IMPORTANT)

1. Go to the GitHub repository
2. Click **"Compare & pull request"**
3. Add description of your changes
4. Submit for review

---

## 🔁 Updating Your Branch

If main branch has updates:

```bash
git checkout main
git pull origin main
git checkout feature/archive-module
git merge main
```

---

# ⚠️ Important Notes

* ❌ Do NOT upload `node_modules/`
* ✅ Always run `npm install` after pulling changes
* ✅ Use meaningful commit messages (e.g., `M1: Add upload feature`)
* ✅ Work on your assigned module only

---

# 👥 Contributors

* Module 1: Thesis/Capstone Archiving (Your Name)
* Module 2: Faculty System
* Module 3: Class & Violations
* Module 4: Time Monitoring

---

# 📊 Future Features

* Data Analytics Dashboard
* Advanced Search & Filtering
* Report Generation
* Role-Based Access Control

---
