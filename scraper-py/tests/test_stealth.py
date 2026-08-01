"""
Credential-free regression: scrape_stealth calls StealthyFetcher.fetch
without the redundant extra_flags argument while preserving headless,
network_idle, timeout, and disable_resources.

Scrapling 0.3.12 StealthyFetcher (Camoufox/Firefox) does not need extra_flags;
the headless/network_idle/timeout/disable_resources kwargs are sufficient.
The extra_flags argument was removed to avoid a tuple/list bug in the old
0.4.1 path and is not re-introduced for 0.3.12.

These tests use standard-library unittest.mock so they do not require a
browser, credentials, or network access.
"""

from __future__ import annotations

import os
import sys
import types
import unittest
from unittest.mock import MagicMock


def _ensure_scraper_path():
    """Add the scraper-py directory to sys.path so imports work without ambient PYTHONPATH."""
    scraper_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if scraper_dir not in sys.path:
        sys.path.insert(0, scraper_dir)


class ScrapeStealthContractTests(unittest.TestCase):
    """Verify scrape_stealth passes the correct kwargs to StealthyFetcher.fetch."""

    def setUp(self):
        self.url = "https://example.com/products"
        self.selectors = {
            "item": "article",
            "title": "h2",
            "link": "a",
        }

    @staticmethod
    def _install_fake_scrapling() -> MagicMock:
        """Install a fake scrapling.fetchers.StealthyFetcher into sys.modules
        so that 'from scrapling.fetchers import StealthyFetcher' succeeds."""
        fetchers = types.ModuleType("scrapling.fetchers")
        scrapling = types.ModuleType("scrapling")
        scrapling.__path__ = []     # hint it's a package
        scrapling.fetchers = fetchers
        # _StealthyFetcher is the MagicMock that will receive .fetch() calls
        sf = MagicMock()
        sf.fetch = MagicMock()
        sf.fetch.return_value = sf
        sf.css.return_value = []
        del sf.adaptive
        fetchers.StealthyFetcher = sf
        sys.modules["scrapling"] = scrapling
        sys.modules["scrapling.fetchers"] = fetchers
        return sf

    @staticmethod
    def _uninstall_fake_scrapling():
        sys.modules.pop("scrapling.fetchers", None)
        sys.modules.pop("scrapling", None)

    @staticmethod
    def _import_fresh_stealth():
        """Import (or re-import) scrapers.stealth so it picks up the mock."""
        _ensure_scraper_path()
        if "scrapers.stealth" in sys.modules:
            del sys.modules["scrapers.stealth"]
        import scrapers.stealth  # type: ignore
        return scrapers.stealth

    def _call_with_mock(self):
        """Call scrape_stealth with the fake scrapling installed. Returns the
        StealthyFetcher.fetch call kwargs."""
        fake_sf = self._install_fake_scrapling()
        try:
            stealth = self._import_fresh_stealth()
            stealth.scrape_stealth(self.url, self.selectors)
        finally:
            self._uninstall_fake_scrapling()
        return fake_sf.fetch.call_args.kwargs

    def test_fetch_called_without_extra_flags(self):
        call_kwargs = self._call_with_mock()
        self.assertNotIn("extra_flags", call_kwargs,
                         "extra_flags must NOT be passed to StealthyFetcher.fetch "
                         "(Scrapling 0.3.12 StealthyFetcher does not need extra_flags)")

    def test_fetch_preserves_headless(self):
        call_kwargs = self._call_with_mock()
        self.assertIn("headless", call_kwargs)
        self.assertTrue(call_kwargs["headless"], "headless must be True")

    def test_fetch_preserves_network_idle(self):
        call_kwargs = self._call_with_mock()
        self.assertIn("network_idle", call_kwargs)
        self.assertTrue(call_kwargs["network_idle"], "network_idle must be True")

    def test_fetch_preserves_timeout(self):
        call_kwargs = self._call_with_mock()
        self.assertIn("timeout", call_kwargs)
        self.assertEqual(call_kwargs["timeout"], 90000, "timeout must be 90000")

    def test_fetch_preserves_disable_resources(self):
        call_kwargs = self._call_with_mock()
        self.assertIn("disable_resources", call_kwargs)
        self.assertTrue(call_kwargs["disable_resources"], "disable_resources must be True")


if __name__ == "__main__":
    unittest.main()
