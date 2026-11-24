# Coding Workshop - Frontend Code

## Overview

This folder contains React frontend application with hello world example.

## Prerequisites

- React - JavaScript library for building user interfaces
- React Router - Client-side routing for React
- Material UI - Comprehensive UI component library

## Structure

```
coding-workshop-participant/
├── frontend/              # React frontend
│   ├── public/              # Public assets
│   ├── src/                 # Source code
│   │   ├── pages/             # Page components
│   │   ├── components/        # Reusable components
│   │   ├── services/          # API client
│   │   └── App.js             # Main app
│   ├── .env.sample          # React environment variables
│   ├── eslint.config.js     # ESLint JS tool configuration
│   ├── index.html           # Landing page
│   ├── package.json         # App metadata with dependencies
│   ├── README.md            # Frontend guide (YOU ARE HERE)
│   └── vite.config.js       # Vite build tool configuration
├── ...
```

## ACME Projects application

React 19 + Material UI 9 single-page app for the project management platform.

### Features

| Page          | What it answers |
| ------------- | --------------- |
| Dashboard     | Status of every project, at-risk projects with reasons, budget consumed vs planned, current resource load, deliverables blocked by dependencies, upcoming/overdue deliverables |
| Projects      | Search + filter (status, priority, risk — synced to the URL), CRUD, detail page with deliverables / team / budget tabs |
| Deliverables  | Search + filter (project, status, owner, overdue), CRUD with dependency picker, detail page with the full upstream/downstream dependency chain |
| Resources     | Per-person utilisation on any date with over-allocation alerts, allocation CRUD |
| Budget        | Consumption per project, spend ledger with date/category filters |
| Users         | Admin-only account and role management |

### Design decisions

- **Auth**: JWT stored in `localStorage`; the API client refreshes an expired access token
  once and retries, otherwise signs the user out with a clear message.
- **RBAC in the UI**: permissions come from the backend (`/auth/me`), and `can(action)`
  hides buttons the role cannot use. The backend still enforces every rule.
- **Responsive**: `react-responsive` breakpoints switch tables to cards, the side
  navigation to a drawer, and dialogs to full-screen on phones.
- **Reuse**: one `FormDialog` (field-config driven, client + server validation),
  one `DataView` (table/cards), one `useCrud` hook for create/edit/delete flows.
- **HashRouter**: deep links and refreshes work on static S3/CloudFront hosting without
  rewrite rules.

### Structure

```
src/
├── components/   # AppLayout, DataView, FormDialog, FilterBar, StatusChip, ProgressBar, ...
├── context/      # AuthContext (user, can()), NotificationContext (toasts)
├── hooks/        # useApi, useCrud, useLookups, useDebounce, useResponsive
├── pages/        # one file per screen + fields.js (form definitions)
├── services/     # api.js (HTTP client), resources.js (endpoint clients)
├── test/         # Vitest setup and render helpers
└── utils/        # formatting and option lists
```

### Scripts

```sh
npm run dev            # dev server on :3000 (normally via ./bin/start-dev.sh)
npm run lint           # ESLint
npm test               # Vitest + React Testing Library
npm run test:coverage  # with coverage
npm run build          # production build to dist/
```

## Usage

### Local Development

To run your application locally:

```sh
./bin/start-dev.sh
```

To view your application, open the browser and navigate to `http://localhost:3000`.

### Cloud Deployment

To deploy your frontend to AWS:

```sh
./bin/deploy-frontend.sh
```

To view your application, open the browser and navigate to CloudFront URL.

## Clean Up

To remove all deployed resources (including frontend):

```sh
./bin/cleanup-environment.sh
```

**Warning**: This removes all infra resources. Cannot be undone.
