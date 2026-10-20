# Well Spent PWA

A React and Vite spending tracker with a private local vault. Records stay in this browser profile; there is no account, telemetry, or server sync.

## Develop

Requires Node.js 22.12+ and npm. In this folder:

```sh
npm install
npm run dev
```

Open <http://localhost:8000>. Vite uses port 8000 so records from the previous local server remain on the same browser origin. Build and preview the installable offline PWA with:

```sh
npm run build
npm run preview
```

Serve through Vite (`npm run dev` or `npm run preview`). Opening the project’s `index.html` directly or serving this source folder with `python3 -m http.server` sends uncompiled JSX and will not start React. If an old server owns port 8000, stop it before starting Vite. You can also serve the built `dist/` folder with any static server.

Run the storage, transaction, analytics, and screen rendering checks with `npm test`.

Deploy the contents of `dist/` over HTTPS. The production build includes a service worker that caches the React app shell and generated assets. After an update, open the app online once so the new service worker can install. The old plain JavaScript app is retained at `legacy/app.js` for reference only.

## Deploy with GitHub Pages

The workflow at `.github/workflows/deploy-pages.yml` builds the app and deploys `dist/` whenever a commit is pushed to `main`. It can also be started from the Actions tab with **Run workflow**.

1. Create a GitHub repository and push this project's `main` branch to it.
2. Either open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**, or let the workflow enable Pages by adding a `PAGES_ENABLEMENT_TOKEN` repository secret under **Settings → Secrets and variables → Actions**. That token must belong to a repository administrator and have permission to enable Pages: use a classic PAT with the `repo` scope, or a fine-grained PAT with **Pages: Read and write** and **Administration: Read and write** for this repository.
3. Open **Actions** and run **Deploy to GitHub Pages**, or push to `main`. The workflow deploys `dist/`. When it succeeds, the site URL appears in the deployment job and in **Settings → Pages**.

The Vite build uses relative asset paths so it works at either a repository Pages URL or a root Pages URL. GitHub Pages serves the app over HTTPS. The app stores transactions in the visitor's browser; uploading code does not upload anyone's vault. A Pages URL is a different browser origin from `localhost:8000`, so existing local records will not appear there automatically. Export a JSON backup from the old URL and restore it on the Pages URL if you want those records there. Keep that backup private because exported JSON is unencrypted.

## Existing data and backups

The React app reads the same IndexedDB database (`well-spent-local`), store (`data`), and `vault` key as the previous PWA. It also reads the previous AES-GCM encrypted envelope. Do not clear site data during migration. The app is tied to its web origin, so use the same URL and browser profile to keep existing records.

Settings can export, share, and restore the iOS-compatible `well_spent_vault.json` format. Restore validates the whole file and asks before replacing existing records. Exported JSON backups are **not encrypted**, even when the on-device vault has a passphrase. Keep a private copy; clearing browser data removes local records.

A passphrase encrypts the local IndexedDB vault with PBKDF2-SHA-256 and AES-256-GCM. The app locks on reload, when you choose **Lock now**, or after two minutes in a hidden tab. A lost passphrase cannot be recovered; reset the device vault and restore a JSON backup.

## Use

The rebuilt interface has five screens: Overview, Transactions, Insights, Bills & subscriptions, and Settings. Use **Add transaction** to record an expense or income/refund. Amount, title, category, and date are presented together; notes and tags are optional. You can also paste a payment message and review its details before saving. Existing pending payment reviews remain available on Overview.

Transactions supports search, category and direction filters, date periods, editing, and deletion with undo. Search all records with **⌘/Ctrl K**, or press **N** outside an input to add a transaction. Large ledgers load progressively.

Insights includes an interactive spending line, category ring, income/expense bars, weekday averages, a 12-week spending calendar, cumulative budget pace, and a cycle-end estimate. Forecasts use recorded spending to date. No-spend days mean days without recorded expenses. Current budget pace and the calendar show their own clearly labeled periods. Chart points support keyboard arrows and selection to filter the ledger.

Bills track recurring monthly commitments and paid status. Marking a bill paid does not add a transaction; log its payment separately to include it in spending. Use **Start a new bill cycle** to reset paid statuses when needed.

Settings contains budget and cycle controls, light/dark/automatic appearance, categories, JSON backups, encryption, and local data deletion. The app follows the system’s reduced motion preference. Notifications, vibration, and sound effects have been removed from the interface and runtime. Existing vault fields and backup formats remain compatible; the redesign does not migrate or seed records.
