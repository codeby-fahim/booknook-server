# BookNook Server

> REST API backend for **BookNook** — a community library where readers can list books, browse the catalogue, borrow titles, and track their reading history.

<p>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white" />
  <img alt="Express" src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white" />
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white" />
  <img alt="Vercel" src="https://img.shields.io/badge/Deployed%20on-Vercel-000000?logo=vercel&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-blue" />
</p>

---

## Table of Contents

- [Overview](#overview)
- [Live API](#live-api)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Authentication](#authentication)
- [API Reference](#api-reference)
- [Data Models](#data-models)
- [Error Handling](#error-handling)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Author](#author)

---

## Overview

BookNook Server is a lightweight, stateless REST API built with **Express 5** and the native **MongoDB** driver. It powers the BookNook front end by exposing endpoints for managing a shared book catalogue and per-user borrowing workflows.

The API is split into two layers:

| Layer | Responsibility |
| --- | --- |
| **Books** | Create, list, update, and remove books from the catalogue. |
| **Borrows** | Borrow a book, list active loans, and return a book while keeping inventory in sync. |

All write operations and every user-scoped read are protected by **JWT verification** against the identity provider's JWKS endpoint, so the API never stores passwords or session state.

---

## Live API

- **Base URL:** `https://booknook-server-drab.vercel.app`
- **Health check:** [`GET /`](https://booknook-server-drab.vercel.app) → `Welcome to booknook server`
- **Frontend / auth provider:** Better Auth instance (configured via `BETTER_AUTH_URL`)

```bash
curl https://booknook-server-drab.vercel.app/all-books
```

---

## Key Features

- 📚 **Full book catalogue** — add books, fetch the full list, or fetch a single title by its ID.
- 🆕 **New arrivals** — a dedicated endpoint returns the six most recently added books.
- 👤 **Personal library** — owners can read, edit, and delete only the books they added.
- 🔁 **Borrow & return workflow** — availability is decremented atomically on borrow and restored on return.
- 🚫 **Duplicate protection** — a reader cannot borrow the same book twice while it is still out.
- 🔐 **Stateless JWT auth** — tokens are verified with `jose` against a remote JWKS set; no secrets or sessions are stored per user.
- ⚡ **Serverless-ready** — deployed on Vercel with a single Node.js entry point.
- 🧩 **Consistent JSON responses** — predictable success flags, messages, and HTTP status codes.

---

## Tech Stack

| Category | Technology |
| --- | --- |
| Runtime | Node.js (ES Modules) |
| Framework | Express 5 |
| Database | MongoDB Atlas (official `mongodb` driver) |
| Auth | JWT verification via `jose` + remote JWKS (Better Auth) |
| Config | `dotenv` |
| CORS | `cors` |
| Hosting | Vercel Serverless Functions |

---

## Architecture

```
Client (React) ──▶ Express API ──▶ MongoDB Atlas
                   │
                   └─ verifyToken middleware
                        └─▶ GET {BETTER_AUTH_URL}/api/auth/jwks
```

Request flow:

1. The client signs in with the auth service and receives an access token.
2. The client sends `Authorization: Bearer <token>` on protected requests.
3. `verifyToken` resolves the JWKS, verifies the token signature, and forwards the request.
4. The route handler performs the MongoDB operation and returns JSON.

---

## Getting Started

### Prerequisites

- Node.js **18 or newer**
- A MongoDB Atlas cluster (or a local MongoDB instance)
- A running Better Auth instance exposing `/api/auth/jwks`

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/codeby-fahim/booknook-server.git

# 2. Move into the project
cd booknook-server

# 3. Install dependencies
npm install

# 4. Create your environment file
cp .env.example .env
```

Fill in `.env` with your values (see [Environment Variables](#environment-variables)), then start the server:

```bash
node index.js
```

```
server is running on port 5000
successfully connected to MongoDB!
```

### Suggested scripts

Add these to `package.json` for convenience:

```json
{
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  }
}
```

---

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URL` | ✅ | MongoDB connection string. The API uses the `booknook` database. |
| `BETTER_AUTH_URL` | ✅ | Base URL of the auth service. The JWKS is fetched from `${BETTER_AUTH_URL}/api/auth/jwks`. |
| `PORT` | ❌ | Port for local development (default: `5000`). |

> **Note:** `.env.example` currently labels the auth variable as `CLIENT_URL`, while the code reads `BETTER_AUTH_URL`. Use `BETTER_AUTH_URL` or update both files to match.

`.env` example:

```env
MONGODB_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
BETTER_AUTH_URL=http://localhost:3000
PORT=5000
```

---

## Authentication

Protected routes require a bearer token issued by the auth service:

```http
Authorization: Bearer <access_token>
```

- Tokens are verified against a cached remote JWKS (`createRemoteJWKSet` + `jwtVerify`).
- Missing, malformed, or invalid tokens return **401 Unauthorized**.
- Expired or unverifiable tokens are rejected before any database work happens.

Endpoints marked 🔒 in the [API Reference](#api-reference) require this header.

---

## API Reference

**Base URL:** `https://booknook-server-drab.vercel.app`

### Books

#### `GET /`

Health check. Returns a plain-text welcome message.

#### `POST /add-books` 🔒

Add a new book to the catalogue.

**Request body**

```json
{
  "title": "Clean Code",
  "author": "Robert C. Martin",
  "image": "https://example.com/clean-code.jpg",
  "category": "Software Engineering",
  "description": "A handbook of agile software craftsmanship.",
  "availableCopies": 3,
  "addedBy": {
    "name": "Fahim",
    "email": "fahim@example.com"
  },
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-15T10:00:00.000Z"
}
```

**Response** — the MongoDB insert result (`acknowledged`, `insertedId`).

#### `GET /all-books`

Public. Returns every book, newest first (sorted by `createdAt` descending).

#### `GET /all-books/:id`

Public. Returns a single book by its MongoDB `_id`.

#### `GET /arrival-books`

Public. Returns the **6** most recently added books.

#### `GET /my-books/:email` 🔒

Returns all books added by the given email (`addedBy.email`).

#### `PATCH /my-books/:email` 🔒

Update a book owned by the given email.

```json
{
  "bookId": "65f1c2a9e4b0a1b2c3d4e5f6",
  "title": "Clean Code (2nd Edition)",
  "availableCopies": 5
}
```

`_id`, `addedBy`, and `createdAt` are ignored if sent, so ownership and creation time cannot be spoofed. If `bookId` is omitted, the first book matching the owner filter is updated.

**Response** — the MongoDB update result.

#### `DELETE /my-books/:email` 🔒

Remove a book owned by the given email.

```json
{
  "bookId": "65f1c2a9e4b0a1b2c3d4e5f6"
}
```

⚠️ If `bookId` is omitted, only the first matching book is deleted. Always send `bookId` from the client.

### Borrows

#### `POST /borrows/:email` 🔒

Borrow one copy of a book for the given user.

```json
{
  "bookId": "65f1c2a9e4b0a1b2c3d4e5f6"
}
```

**Behaviour**

- Rejects invalid / missing `bookId` → `400`
- Rejects a duplicate active borrow by the same user → `400`
- Decrements `availableCopies` atomically with the filter `availableCopies: { $gt: 0 }`
- Creates a borrow record with `status: "borrowed"`

**Success — `201 Created`**

```json
{
  "success": true,
  "message": "Book borrowed successfully.",
  "data": { "acknowledged": true, "insertedId": "..." }
}
```

#### `GET /my-borrows/:email` 🔒

Returns the user's **active** borrows (`status: "borrowed"`), most recent first.

```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "bookId": "...",
      "userEmail": "fahim@example.com",
      "bookInfo": { "title": "Clean Code", "author": "...", "image": "..." },
      "borrowedAt": "2026-01-16T08:12:00.000Z",
      "returnedAt": null,
      "status": "borrowed"
    }
  ]
}
```

#### `PATCH /my-borrows/:email/:borrowId` 🔒

Return a book and restore inventory.

**Behaviour**

- Rejects an invalid `borrowId` → `400`
- Returns `404` if no active borrow record matches
- Sets `status: "returned"` and `returnedAt`
- Increments the book's `availableCopies` by one

**Success**

```json
{
  "success": true,
  "message": "Book returned successfully."
}
```

### Endpoint summary

| Method | Endpoint | Auth | Description |
| --- | --- | :---: | --- |
| `GET` | `/` | — | Health check |
| `POST` | `/add-books` | 🔒 | Add a book |
| `GET` | `/all-books` | — | List all books |
| `GET` | `/all-books/:id` | — | Get one book |
| `GET` | `/arrival-books` | — | Six newest books |
| `GET` | `/my-books/:email` | 🔒 | Books added by a user |
| `PATCH` | `/my-books/:email` | 🔒 | Update an owned book |
| `DELETE` | `/my-books/:email` | 🔒 | Delete an owned book |
| `POST` | `/borrows/:email` | 🔒 | Borrow a book |
| `GET` | `/my-borrows/:email` | 🔒 | List active borrows |
| `PATCH` | `/my-borrows/:email/:borrowId` | 🔒 | Return a book |

---

## Data Models

### `books`

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | ObjectId | Primary key |
| `title` | string | Book title |
| `author` | string | Author name |
| `image` | string | Cover image URL |
| `category` | string | Genre / category |
| `description` | string | Short synopsis |
| `availableCopies` | number | Decremented on borrow, incremented on return |
| `addedBy` | object | `{ name, email }` of the owner |
| `createdAt` | Date | Used for sorting |
| `updatedAt` | Date | Updated on borrow / return / edit |

### `borrows`

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | ObjectId | Primary key |
| `bookId` | ObjectId | Reference to `books._id` |
| `userEmail` | string | Borrower email |
| `bookInfo` | object | Denormalised `{ title, author, image }` snapshot |
| `borrowedAt` | Date | Loan start |
| `returnedAt` | Date \| null | Loan end |
| `status` | string | `"borrowed"` or `"returned"` |

---

## Error Handling

| Status | Meaning |
| --- | --- |
| `200` | Request succeeded |
| `201` | Borrow record created |
| `400` | Invalid ID, duplicate borrow, unavailable book, or failed return |
| `401` | Missing or invalid bearer token |
| `404` | No matching borrow record |
| `500` | Token verification failure or unexpected server/database error |

Error payloads from the borrow routes follow a consistent shape:

```json
{
  "success": false,
  "message": "You have already borrowed this book."
}
```

---

## Deployment

The project ships with a `vercel.json` that routes every request to `index.js` as a serverless function.

```bash
# Install the CLI once
npm i -g vercel

# Deploy
vercel --prod
```

Remember to add `MONGODB_URL` and `BETTER_AUTH_URL` to the Vercel project's **Environment Variables** before deploying.

---

## Roadmap

- [ ] Pagination and search/filtering for `/all-books`
- [ ] Centralised error-handling middleware
- [ ] Request validation with a schema library
- [ ] Role-based access (admin vs. member)
- [ ] Automated tests with Vitest / Supertest
- [ ] Rating and review endpoints

---

## Author

**Fahim** — [@codeby-fahim](https://github.com/codeby-fahim)

- Repository: [github.com/codeby-fahim/booknook-server](https://github.com/codeby-fahim/booknook-server.git)
- Live API: [booknook-server-drab.vercel.app](https://booknook-server-drab.vercel.app)

---

<p align="center"><sub>Built with Express &amp; MongoDB — happy reading 📖</sub></p>
