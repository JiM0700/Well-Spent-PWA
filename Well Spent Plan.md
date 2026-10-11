# Well Spent: PWA and Backup Compatibility

Well Spent is an offline-first iOS expense and budget tracker. It stores transactions, recurring bills, custom categories, and budget preferences locally. The iOS app has no cloud service: its **Settings → Backup** export is the portable data boundary for a future PWA. The PWA should read and write this JSON vault so users can move a backup between the two apps.

## Application features

The PWA project should account for the full Well Spent experience, adapting native-only features to suitable browser equivalents:

- **Overview and budgeting:** dashboard with today's and recent spending, monthly envelope/budget progress, remaining daily runway, weekly pacing, category breakdowns, and recent transaction activity. The budget cycle can start on a user-selected day of the month.
- **Transactions:** manually add, quick-add, edit, delete, categorize, date, tag, and annotate expenses. Income and refunds are supported alongside expenses. The iOS app also supports UPI/SMS transaction parsing, duplicate detection, and pending transaction review/approval.
- **Categories:** built-in categories plus user-created categories with a name, icon, and color. Deleting a custom category reassigns its existing transactions to Other.
- **Recurring bills:** create and manage monthly fixed commitments, assign categories and due days, and toggle their current paid state.
- **Trends and inspection:** compare spending across time horizons and custom date ranges; view spending trajectories, category outflow, budget comparisons, and the transaction ledger for selected periods.
- **Search and navigation:** search/filter transactions and bills, including by category; navigate between the overview, trends, bills, and settings.
- **Reminders and system integrations:** configurable daily or monthly spending digests; Siri/App Intents for logging expenses, checking daily allowance or envelope status, undoing the last transaction, and parsing/logging UPI SMS; URL-based UPI capture; pending UPI Live Activities and Dynamic Island/Lock Screen surfaces; Spotlight search integration.
- **Preferences and privacy:** system/light/dark appearance, haptics, sound effects, optional Face ID/Touch ID/device passcode lock, local JSON backup restore, and delete-all-data controls. All finance data is stored on-device in the current app; no account, server sync, telemetry, or cloud dependency is present.

The PWA cannot reproduce iOS-only surfaces such as Dynamic Island, ActivityKit, Siri intents, or native biometric APIs directly. Preserve the underlying workflows where possible with browser notifications, installable offline UI, platform authentication where available, and clear fallbacks. These platform integrations are not part of the JSON data contract unless their underlying transaction or preference fields are listed below.

## Build specification

### Main screens and user flows

Use four primary destinations: **Home**, **Bills**, **Trends**, and **Settings**. On narrow screens, use a persistent bottom navigation bar; on wider screens, a compact sidebar or top navigation is suitable. Keep create/edit flows reachable from every relevant list and support browser back navigation.

- **Home:** show a selectable Today / Week / Month horizon, headline spend and remaining runway, budget progress, and useful context such as top category and recent comparison. Show unpaid bills due within seven days. Provide quick add and full transaction entry, transaction search, and a newest-first feed grouped by date. Each transaction can be edited or deleted. Offer undo after deletion where feasible. Include a prominent review action for pending UPI captures if the PWA supports importing/parsing them.
- **Add/edit transaction:** collect title, amount, category, date, expense-or-income direction, notes, and tags. Require a non-empty title, a valid finite amount greater than zero, a valid date, and a known category (preserve unknown/custom category IDs). Quick add should prioritize amount and category with minimal taps; full entry exposes all fields. Editing must keep the existing `id` and `sourceIdentifier`.
- **Bills:** list recurring bills by next due date, show amount/category/due day and paid status, and support add, edit, delete, and paid/unpaid toggle. Show due-soon bills on Home. Paid status is just a current toggle in the existing data model.
- **Trends:** allow Today, Week, Month, Quarter, Year, and custom date range views. Show total outflow, comparisons, a spending chart, category outflow, and a ledger that can be narrowed by chart bucket/category. Income should remain visible in transaction history but is excluded from spending totals and category outflow.
- **Search:** search transaction title, category, notes, tags, and displayed whole-number amount. Filter by category and amount bands: under 500, 500–2,000 inclusive, and above 2,000 (currently rupee thresholds in iOS). Return newest first and allow opening a result for edit.
- **Settings:** edit monthly budget and cycle start day (1–28); manage custom category name/icon/color; choose system/light/dark theme; toggle haptics/sounds where supported; configure a daily or monthly spending digest, time, and monthly day; import/export JSON vault; and delete all data behind a clear destructive confirmation. Digest time and day are not included in the current JSON vault schema, so treat them as PWA-local preferences unless the iOS schema is deliberately extended. Do not claim browser biometric protection unless it is actually implemented and tested on that platform.

### Calculation and date rules

Use the device's local calendar and timezone for day, week, month, and cycle boundaries. Use half-open ranges `[start, end)` for period filtering to avoid double counting boundary timestamps. The iOS billing cycle starts on the configured day and begins at local midnight; the selected start day is capped at 28 so it exists in every month. A current cycle includes all expense transactions from its start through the next cycle start.

- Only `isExpense === true` contributes to spending, budget, runway, category outflow, and spending trends. Income remains a positive amount and has `isExpense === false`.
- Current cycle spend is the sum of expenses in the cycle. Remaining cycle budget is `max(0, monthlyBudget - cycleSpend)`; progress is capped at 100% and is zero when the budget is zero.
- Days elapsed includes today and is at least one. Days remaining including today is at least one. The safe daily runway is `max(0, monthlyBudget - (cycleSpend - todaySpend)) / daysRemainingIncludingToday`; today's remaining runway is `max(0, dailyRunway - todaySpend)`.
- Average daily spend is cycle spend divided by elapsed cycle days. Projected cycle-end spend is current cycle spend plus average daily spend times the number of remaining days (excluding today).
- Weekly boundaries start Monday at local midnight. The weekly target is monthly budget divided by the number of days in the current budget cycle, multiplied by seven. Previous-week comparisons use the preceding Monday-to-Monday interval.
- Upcoming bill due dates use the bill's day in the current month, capped to that month's final day; if that date has passed, the next due date is in the following month. “Due soon” means unpaid and zero through seven days away, inclusive.
- Quarter/year/custom trend buckets should be calendar based. For ranges other than the active budget cycle, present comparisons using equivalent calendar periods and label the comparison clearly. The iOS Trends view supports different granularities; the PWA should keep displayed totals and bucket contents consistent.

These formulas describe current `ExpenseStore` behavior. When a formula is not explicitly specified by the iOS app (for example, custom-range comparison baselines), choose and document a consistent rule in the PWA rather than silently presenting unlike periods as equivalent.

### Local data, backup, and failure behavior

The PWA must remain usable offline after its first successful load. Use an installable web app manifest and service worker to cache the application shell. Store user records locally (for example, IndexedDB); browser local storage is suitable only for small preferences. Save each user change promptly and handle storage quota or write failures with a visible message. Do not send finance data to a server by default.

Import is a whole-vault restore, not a merge. Parse and validate the entire file before replacing current records; on error, retain existing data and identify the problem. Warn before replacing a non-empty vault. Export a complete snapshot, use a recognizable JSON filename, and preserve IDs and unknown fields where possible. Make the backup control available in browser share/download flows. Explain that a backup file contains sensitive financial records and is not encrypted by this format. The current iOS delete-all action clears transactions, bills, and custom categories; decide explicitly whether the PWA should also clear preferences and communicate that behavior before confirmation.

For duplicate prevention, treat `id` as the primary key. When ingesting a UPI transaction with a non-empty `sourceIdentifier`, do not add a second transaction with the same source identifier; instead offer to review the existing record. Importing a vault should preserve duplicate records already present unless the user chooses a cleanup action.

### Browser equivalents and limits

Implement optional UPI/SMS capture as paste/import parsing with a confirmation screen; browser permissions do not provide the iOS app's general SMS-reading or clipboard monitoring behavior. Do not silently read the clipboard. Browser notifications can provide daily/monthly digests only after permission and may be limited by browser/platform support. App shortcuts can use PWA shortcuts and share targets where supported. Replace Siri/App Intents, Spotlight, URL schemes, widgets, Live Activities, and Dynamic Island with web navigation, share handling, and in-app pending review. Keep core expense, budget, bill, trend, search, and backup workflows complete without these integrations.

### Quality and acceptance criteria

- Layout works on mobile and desktop, supports keyboard operation, visible focus, screen readers, and reduced-motion preferences.
- Every core workflow works offline after installation, and records survive reloads and browser restarts.
- A vault exported by the PWA restores in the current iOS app, and an iOS-exported vault restores in the PWA without changing IDs, dates, direction, categories, amounts, or bill state.
- Invalid imports and storage failures leave the user's existing data intact and explain how to recover.
- Confirmed deletions, edits, category reassignment, search filters, bill due dates, and spending totals update immediately and consistently across screens.

### Out of scope until separately designed

There is no user account, server API, cross-device synchronization, multi-user sharing, or merge protocol in the current application. Do not add cloud sync implicitly. If it is added later, define authentication, encryption, conflict resolution, deletion propagation, and recovery separately from this backup format.

## Backup format

The exported file is UTF-8 JSON, currently named `well_spent_vault.json`. Its top-level shape is:

```json
{
  "expenses": [
    {
      "id": "stable-transaction-id",
      "title": "Coffee",
      "amount": 280.0,
      "category": "food",
      "date": 770000000.0,
      "notes": "",
      "isExpense": true,
      "tags": [],
      "sourceIdentifier": "upi:412345678901"
    }
  ],
  "monthlyBudget": 50000.0,
  "cycleStartDay": 1,
  "customCategories": [
    { "id": "pets", "displayName": "Pets", "sfSymbol": "pawprint.fill", "colorHex": "#8E6CEF", "isCustom": true }
  ],
  "summaryEnabled": true,
  "summaryPeriod": "daily",
  "recurringBills": [
    { "id": "stable-bill-id", "title": "Internet", "amount": 999.0, "category": "utilities", "dueDay": 5, "isPaid": false }
  ],
  "appThemeMode": "system",
  "biometricsEnabled": false,
  "hapticsEnabled": true,
  "soundsEnabled": true
}
```

The example values are illustrative. The current iOS export uses the default Swift `JSONEncoder` date strategy: `date` is a number of **seconds since 2001-01-01T00:00:00Z** (Apple's reference date), not Unix seconds or an ISO string. When importing into JavaScript, convert with `new Date((seconds + 978307200) * 1000)`; when exporting for iOS, subtract `978307200` from Unix seconds. Preserve fractional seconds where present.

## Field meanings and compatibility rules

- `expenses` is the complete transaction list. Amounts are decimal major currency units (for example, `280.0` means ₹280 in the app's current Indian context). The app rounds values to two decimal places internally. Store amounts as decimal values and avoid binary-float arithmetic for calculations.
- `isExpense` distinguishes spending (`true`) from income/refunds (`false`). Keep the sign in `amount` non-negative; direction is represented by this flag.
- `category` is usually a built-in category ID string: `food`, `transport`, `utilities`, `entertainment`, `health`, `shopping`, `housing`, `investment`, or `other`. A custom category is encoded as an object with `id`, `displayName`, `sfSymbol`, `colorHex`, and `isCustom`. The separate `customCategories` array preserves custom category definitions and their presentation metadata.
- `id` is the record identity. Preserve it across edits and imports. `sourceIdentifier` is optional provenance/deduplication data (often an imported UPI reference); do not treat it as the record ID.
- `recurringBills` records monthly commitments. `dueDay` is a day of month and `isPaid` is the current stored paid toggle; there is no payment history in this model.
- Budget and cycle preferences are `monthlyBudget` and `cycleStartDay`. Other settings are optional preferences. Biometric gating is device-specific and should not be relied on as portable security.
- Older valid vaults may omit fields. The iOS decoder supplies defaults for absent arrays and settings, and older expenses may omit `sourceIdentifier`. Keep unknown fields when practical so future versions can round-trip data they do not yet understand.

## PWA implementation guidance

Treat the JSON vault as the cross-app interchange contract. Support importing existing files and exporting the same top-level structure with the same key names, category representation, amount semantics, and Apple reference-date encoding. Keep transaction and bill IDs stable. Validate before replacing local data, show a useful import error, and let the user download/export a fresh backup. The PWA can use its own offline storage internally, but should translate at the import/export boundary. There is no account, server API, synchronization protocol, or cloud merge behavior in the current iOS project; backups are whole snapshots, so concurrent edits require an explicit merge strategy if synchronization is added later.

For the source of truth, see `ExpenseStore.PersistedData`, `ExpenseStore.exportJsonVault()` / `importJsonVault()`, and the `Expense`, `ExpenseCategory`, and `RecurringBill` Codable models.
