# PC Remote

<p align="center">
  <b>Remote Management & Control System for Windows PCs via Mobile App and Web Interface</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v20%2B-brightgreen?logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/pnpm-v10%2B-orange?logo=pnpm" alt="pnpm">
  <img src="https://img.shields.io/badge/Fastify-v4-blue?logo=fastify" alt="Fastify">
  <img src="https://img.shields.io/badge/React_Native-Expo_SDK_55-61DAFB?logo=react" alt="React Native Expo">
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
</p>

---

## 📌 Overview

**PC Remote** is a powerful monorepo system designed to securely monitor, control, and manage Windows PCs remotely. Featuring real-time WebSocket communication, dynamic device pairing via QR codes, usage statistics, system metrics monitoring, power management, and strict parental/curfew controls — accessible right from your smartphone or browser.

---

## ✨ Key Features

- **⚡ Power & Session Controls**: Instant Shutdown, Reboot, Lock, Sleep, and Hibernate commands.
- **📊 Real-time Hardware Monitoring**: Live metrics for CPU usage, RAM allocation, storage/disk status, and active Windows user sessions.
- **📷 Remote Screen & Screenshot Capture**: Take quick desktop screenshots directly from the mobile application.
- **🔊 Media & Audio Control**: Mute, adjust volume, and control system audio remotely.
- **⏳ Usage Limits & Curfew Restrictions**: Set daily time limits, schedule operating hours, enforce bedtime curfews, and request session extension bonus time.
- **🔐 Secure Device Pairing**: Secure QR code scanning pairing mechanism using JWT authentication and time-limited registration secrets.
- **💻 Windows System Tray Companion**: PowerShell & WinSW integrated tray app allowing local password protection and manual pairing reset.

---

## 🏗 Architecture

```mermaid
graph TD
    subgraph Mobile ["📱 Mobile App (Expo / React Native)"]
        MA[React Native UI]
        QR[QR Code Scanner]
        ST[Zustand State & Axios]
    end

    subgraph Cloud ["☁️ Backend API & Realtime Server"]
        API[Fastify REST API]
        SIO[Socket.IO Server]
        PR[Prisma ORM]
        DB[(PostgreSQL 16)]
        API --> PR --> DB
        SIO <--> API
    end

    subgraph Agent ["🖥️ Windows PC Agent"]
        AG[Node.js Agent Service]
        HTTP[Local HTTP Server :3535]
        TRAY[Windows System Tray tray.ps1]
        AG <--> HTTP <--> TRAY
    end

    MA -- REST API / HTTPS --> API
    MA -- Realtime Controls --> SIO
    AG -- WebSocket / Socket.IO --> SIO
```

### Pairing Sequence

1. **Agent Startup**: The Windows Agent starts up, generates a unique `deviceId` + `secret`, and presents a QR Code in terminal or via local tray web view (`http://127.0.0.1:3535/qr`).
2. **Mobile Scan**: The mobile app scans the QR code containing `{ deviceId, secret }`.
3. **Authorization**: The app submits `POST /api/devices/:id/bind` to bind the machine to the user's account.
4. **Realtime Link**: The Backend grants an `agentToken`, enabling persistent real-time Socket.IO communication between backend and Windows Agent.

---

## 🛠 Tech Stack

| Domain | Technologies & Libraries |
| --- | --- |
| **Monorepo Management** | `pnpm` workspaces, TypeScript ESM |
| **Backend Service** | Node.js (v20+ / v24 recommended), Fastify 4, Prisma 5, Socket.IO 4, Winston |
| **Database** | PostgreSQL 16, Adminer (Web GUI) |
| **Windows Agent** | Node.js, esbuild CJS bundle, `pkg` binary compiler, WinSW Windows Service |
| **Mobile Client** | React Native 0.83, Expo SDK 55, Zustand, Axios, `expo-camera` |
| **DevOps & CI/CD** | Docker & Docker Compose, GitHub Actions, EAS local build, Inno Setup 6 |

---

## 📁 Repository Structure

```
pc-remote/
├── apps/
│   ├── backend/         # Fastify API Server + Prisma Schema + Socket.IO handlers
│   ├── agent/           # Windows Agent service (Node.js → agent.exe)
│   └── mobile/          # Cross-platform mobile app (React Native + Expo SDK 55)
├── packages/
│   └── shared/          # Shared TypeScript interfaces & validation schemas
├── installer/
│   ├── installer.iss    # Inno Setup Windows installer compiler script
│   └── tray.ps1         # Windows PowerShell system tray menu companion
├── manifests/
│   └── Hobbs1210.PCRemoteAgent.yaml # Winget package manifest definition
├── docker-compose.yml   # Dev PostgreSQL 16 + Adminer containers
├── build-apk.ps1        # PowerShell automated Android APK builder script
└── build-installer.ps1  # PowerShell Windows setup installer compiler script
```

---

## 💻 Agent Installation

You can install the PC Remote Agent on any Windows PC using **Windows Package Manager (Winget)** or the standalone setup installer.

### 1. Install via Winget (Recommended)

To install the latest published release of PC Remote Agent via Winget:

```cmd
winget install Hobbs1210.PCRemoteAgent
```

#### Silent / Unattended Installation
To install silently without interactive wizard prompts:

```cmd
winget install Hobbs1210.PCRemoteAgent --silent
```

#### Install directly from Remote GitHub Repository
To install on any computer directly referencing your GitHub repository manifest (without needing to clone):

```cmd
winget install --manifest https://raw.githubusercontent.com/Hobbs1210/pc-remote/main/manifests/Hobbs1210.PCRemoteAgent.yaml
```

#### Install from Local Repository Manifest
To test or install from a local repository manifest file:

```cmd
winget install --manifest ./manifests/Hobbs1210.PCRemoteAgent.yaml
```

### 2. Standalone Windows Installer (`.exe`)

Download `pc-remote-agent-setup.exe` directly from the [GitHub Releases](https://github.com/Hobbs1210/pc-remote/releases) page and run the installer.

---

## 🚀 Quick Start Guide

### Prerequisites

- **Node.js**: v20.x or higher (v24 recommended)
- **Package Manager**: `pnpm` (`npm install -g pnpm`)
- **Docker**: Docker Desktop (for database containers)
- **Git**

### 1. Installation

Clone the repository and install all monorepo dependencies:

```bash
git clone https://github.com/Hobbs1210/pc-remote.git
cd pc-remote
pnpm install
```

### 2. Database Setup

Spin up PostgreSQL 16 and Adminer GUI using Docker Compose:

```bash
docker compose up -d
```
- **PostgreSQL**: `localhost:5432` (`user: pcremote`, `pass: pcremote`, `db: pc_remote`)
- **Adminer Web Interface**: `http://localhost:8080`

### 3. Run Backend API

Create `apps/backend/.env`:

```env
DATABASE_URL="postgresql://pcremote:pcremote@localhost:5432/pc_remote"
JWT_SECRET="your-32-character-secret-key-here"
JWT_REFRESH_SECRET="your-refresh-secret-key-here"
NODE_ENV="development"
LOG_LEVEL="debug"
PORT=3000
```

Apply database migrations and start development server:

```bash
cd apps/backend
pnpm db:push
pnpm dev
```
The API server will listen on `http://localhost:3000`.

### 4. Run Windows Agent

Create `apps/agent/.env`:

```env
SERVER_URL="http://localhost:3000"
```

Start the agent in development mode:

```bash
cd apps/agent
pnpm dev
```

*Note: The agent will output a terminal QR code for mobile binding upon launch.*

Useful CLI flags:
```bash
node dist/agent.cjs --reset              # Reset device binding & generate fresh QR code
node dist/agent.cjs --set-password <pwd> # Set system tray password protection
```

### 5. Run Mobile App

```bash
cd apps/mobile
pnpm start
# Or launch directly from root:
pnpm dev:mobile
```

Scan the QR code with **Expo Go** on your mobile device (ensure your phone and computer are on the same local Wi-Fi network).

---

## ⚙️ Environment Variables Reference

### Backend (`apps/backend/.env`)

| Variable | Description | Example |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://pcremote:pcremote@localhost:5432/pc_remote` |
| `JWT_SECRET` | Secret key for access tokens (min. 32 chars) | `super_secret_jwt_key_32_chars_long` |
| `JWT_REFRESH_SECRET` | Secret key for refresh tokens | `super_secret_refresh_token_key_here` |
| `NODE_ENV` | Environment mode | `development` / `production` |
| `LOG_LEVEL` | Logging verbosity | `debug` / `info` / `error` |
| `PORT` | HTTP Server Port | `3000` |

### Agent (`apps/agent/.env`)

| Variable | Description | Default |
| --- | --- | --- |
| `SERVER_URL` | Backend server base URL | `http://localhost:3000` |

---

## 📦 Building Artifacts

### 1. Windows Installer (`.exe`)

Requires [Inno Setup 6](https://jrsoftware.org/isdl.php) installed on your Windows environment.

```powershell
# Bundle & package the agent binary
cd apps/agent
pnpm bundle
pnpm package:win
cd ../..

# Compile the installer executable
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\installer.iss
```
Output artifact: `installer/output/pc-remote-agent-setup.exe`

### 2. Android APK (`.apk`)

Automated via PowerShell script using local Docker EAS build:

```powershell
.\build-apk.ps1 -ExpoToken 'YOUR_EXPO_TOKEN'
```
Output artifact: `apps/mobile/build/app.apk`

### 3. Winget Package Manifest

To validate the Winget manifest locally:

```cmd
winget validate --manifest ./manifests/Hobbs1210.PCRemoteAgent.yaml
```

For detailed build instructions, see [BUILD.md](BUILD.md).

---

## 🧪 Testing & Quality Assurance

Run the test suite across all workspace packages:

```bash
# Run all tests (requires Docker container for backend tests)
pnpm install && docker compose up -d && pnpm test

# Run package specific tests
pnpm --filter mobile test
pnpm --filter backend test
pnpm --filter agent test
```

For detailed test coverage and testing documentation, see [TESTING.md](TESTING.md).

---

## 📖 Related Documentation

- 🛠 **[BUILD.md](BUILD.md)** — Step-by-step guide for local APK and Windows installer builds.
- 🧪 **[TESTING.md](TESTING.md)** — Test runner commands, test status, and coverage reports.
- 🤖 **[CLAUDE.md](CLAUDE.md)** — Developer notes, code conventions, and AI assistant guidelines.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more details.
