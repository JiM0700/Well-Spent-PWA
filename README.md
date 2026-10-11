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

Run the local data and transaction smoke checks with `npm test`.

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

Use Quick add or Add transaction on Home. A saved transaction appears in the activity list and totals after IndexedDB confirms the write. Search filters title, category, notes, tags, and amount. Bills, trends, custom categories, pasted payment review, theme, digest preferences, and local backup controls are available in the four main screens. Digest notifications only run while the app is open and browser permission is granted.
