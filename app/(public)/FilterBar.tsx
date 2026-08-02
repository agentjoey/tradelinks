import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  SIGNAL_TYPES,
  SIGNAL_TYPE_LABELS,
} from "../../src/domain/intelligence/taxonomy.js";
import type { PublicSearchFilters } from "../../src/public-intelligence/search.js";

const selectClass =
  "rounded-md border border-line bg-surface px-2.5 py-2.5 text-meta text-ink transition-colors duration-200 hover:border-linestrong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal sm:py-1.5";

/**
 * The /changes filter bar (mockup Surface 3): a plain GET form over the
 * allowed filter vocabulary — signal, platform, category, effective-date
 * range, q — so filtering works with JavaScript disabled. The active pool is
 * preserved in a hidden input; unknown parameters never enter the form.
 */
export function FilterBar({ filters }: { filters: PublicSearchFilters }) {
  return (
    <form
      action="/changes"
      method="get"
      aria-label="Filter changes"
      className="mt-4 flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="pool" value={filters.pool} />
      <label className="sr-only" htmlFor="filter-category">
        Category
      </label>
      <select id="filter-category" name="category" defaultValue={filters.category ?? ""} className={selectClass}>
        <option value="">All categories</option>
        {PRODUCT_CATEGORIES.filter((c) => c !== "ALL_PRODUCTS").map((category) => (
          <option key={category} value={category.toLowerCase().replace(/_/g, "-")}>
            {PRODUCT_CATEGORY_LABELS[category]}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="filter-platform">
        Platform
      </label>
      <select id="filter-platform" name="platform" defaultValue={filters.platform?.toLowerCase() ?? ""} className={selectClass}>
        <option value="">All platforms</option>
        <option value="amazon">Amazon US</option>
        <option value="shopify">Shopify US</option>
      </select>
      <label className="sr-only" htmlFor="filter-signal">
        Signal type
      </label>
      <select id="filter-signal" name="signal" defaultValue={filters.signal ?? ""} className={selectClass}>
        <option value="">All signals</option>
        {SIGNAL_TYPES.map((signal) => (
          <option key={signal} value={signal}>
            {SIGNAL_TYPE_LABELS[signal]}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="filter-from">
        Effective from
      </label>
      <input
        id="filter-from"
        name="from"
        type="date"
        defaultValue={filters.from ?? ""}
        aria-label="Effective from"
        className={selectClass}
      />
      <label className="sr-only" htmlFor="filter-to">
        Effective to
      </label>
      <input
        id="filter-to"
        name="to"
        type="date"
        defaultValue={filters.to ?? ""}
        aria-label="Effective to"
        className={selectClass}
      />
      <label className="sr-only" htmlFor="filter-q">
        Search title and summary
      </label>
      <input
        id="filter-q"
        name="q"
        type="search"
        placeholder="Search title or summary"
        defaultValue={filters.q ?? ""}
        className={`${selectClass} min-w-[12rem] flex-1`}
      />
      <button
        type="submit"
        className="rounded-md border border-line bg-surface px-3 py-2.5 text-meta font-medium text-ink transition-colors duration-200 hover:border-linestrong hover:text-signal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal sm:py-1.5"
      >
        Apply
      </button>
    </form>
  );
}
