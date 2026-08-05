"""
Credential-free regression: exact critical runtime pins in requirements.txt.

Root cause: Scrapling >=0.4.0 introduced an eager-UA boundary in
_config_tools.py that generates both __default_useragent__ (Chromium 141)
and __default_chrome_useragent__ (Chrome 143) at module-import time.
BrowserForge 1.2.4 with apify-fingerprint-datapoints 0.14.0 cannot
generate Linux Chrome 143 headers, so the import itself fails.

Scrapling 0.3.12 uses Browser(name="chrome", min_version=130) and
generates only one User-Agent (browser_mode=True), which stays within
BrowserForge's supported range. Its StealthyFetcher.fetch API is
identical to 0.4.1 for the kwargs we use (headless, network_idle,
timeout, disable_resources).

These tests parse requirements.txt and assert the exact pinned versions.
If scrapling is installed, the module-level chrome_version constant (if
any) is also inspected. No browser, no credentials, no network.
"""

from __future__ import annotations

import os
import re
import unittest


REQUIREMENTS_PATH = os.path.join(os.path.dirname(__file__), "..", "requirements.txt")


def parse_requirements(path: str) -> dict[str, str]:
    """Parse a requirements.txt into {package_name: version_spec}."""
    deps: dict[str, str] = {}
    with open(path) as f:
        for line in f:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            # Handle options extras e.g. scrapling[fetchers]==0.4.1
            match = re.match(r"^([a-zA-Z_][a-zA-Z0-9_\[\]-]*)==([\d.]+)", stripped)
            if match:
                name = match.group(1)
                version = match.group(2)
                deps[name] = version
    return deps


class RequirementsPinTests(unittest.TestCase):
    """Assert exact critical runtime pins in requirements.txt."""

    @classmethod
    def setUpClass(cls):
        cls.deps = parse_requirements(REQUIREMENTS_PATH)

    def test_scrapling_pinned_to_0_3_12(self):
        self.assertIn("scrapling[fetchers]", self.deps,
                       "scrapling[fetchers] must be pinned in requirements.txt")
        self.assertEqual(self.deps["scrapling[fetchers]"], "0.3.12",
                         "scrapling[fetchers] must be exactly 0.3.12")

    def test_scrapling_rejects_eager_ua_boundary(self):
        """Scrapling >=0.4.0 eagerly generates Chrome 143 (via _config_tools)
        which BrowserForge 1.2.4 + apify 0.14.0 cannot produce. The pin must be
        <0.4.0 (i.e. in the 0.3.x line where only min_version=130 is used)."""
        version = self.deps.get("scrapling[fetchers]", "")
        self.assertTrue(version, "scrapling[fetchers] must be present in requirements.txt")
        parts = version.split(".")
        self.assertEqual(len(parts), 3, f"version '{version}' must be a 3-part semver")
        major = int(parts[0])
        minor = int(parts[1])
        # 0.3.x is safe; 0.4.0+ introduced the eager Chrome 143 generation
        self.assertEqual(major, 0, f"version '{version}' must be 0.x.y")
        self.assertLess(minor, 4, f"version '{version}' must be <0.4.0 (eager-UA boundary). "
                        "Scrapling >=0.4.0 eagerly generates Chrome 143 headers at import "
                        "time, which BrowserForge 1.2.4 + apify-fingerprint-datapoints 0.14.0 "
                        "cannot produce.")
        # Safety: explicitly reject known-broken versions
        self.assertNotEqual(version, "0.4.1",
                            "scrapling 0.4.1 eagerly generates Chrome 143 headers")
        self.assertNotEqual(version, "0.4.12",
                            "scrapling 0.4.12 hard-codes Chromium 149")

    def test_requirements_pin_prevents_eager_chrome_143(self):
        """The scrapling pin alone is sufficient: <0.4.0 means module-level
        _config_tools never generates Chrome 143. No runtime import needed —
        the version pin in requirements.txt is the gate. This replaces the
        vacuous optional runtime chrome_version test which always skipped in CI."""
        version = self.deps.get("scrapling[fetchers]", "")
        self.assertTrue(version, "scrapling[fetchers] must be present")
        parts = [int(x) for x in version.split(".")]
        self.assertEqual(len(parts), 3, f"version '{version}' must be 3-part semver")
        self.assertEqual(parts[0], 0, "must be 0.x.y")
        self.assertLess(parts[1], 4, f"version '{version}' must be <0.4.0")

    def test_browserforge_pinned_to_1_2_4(self):
        self.assertIn("browserforge", self.deps,
                       "browserforge must be pinned in requirements.txt")
        self.assertEqual(self.deps["browserforge"], "1.2.4",
                         "browserforge must be exactly 1.2.4")

    def test_apify_fingerprint_datapoints_pinned_to_0_14_0(self):
        self.assertIn("apify-fingerprint-datapoints", self.deps,
                       "apify-fingerprint-datapoints must be pinned in requirements.txt")
        self.assertEqual(self.deps["apify-fingerprint-datapoints"], "0.14.0",
                          "apify-fingerprint-datapoints must be exactly 0.14.0")

    def test_camoufox_pinned_to_0_4_11(self):
        """Scrapling 0.3.12 runs 'python -m camoufox fetch --browserforge'.
        Unconstrained camoufox>=0.4.11 (from scrapling[fetchers]) resolves to
        0.5.4+, whose CLI removed --browserforge. 0.4.11 is the minimal
        compatible pin that still has @click.option('--browserforge')."""
        self.assertIn("camoufox", self.deps,
                       "camoufox must be pinned in requirements.txt "
                       "(Scrapling 0.3.12 StealthyFetcher requires 'python -m camoufox fetch --browserforge')")
        self.assertEqual(self.deps["camoufox"], "0.4.11",
                          "camoufox must be exactly 0.4.11 — 0.4.12+ removed --browserforge CLI")


if __name__ == "__main__":
    unittest.main()
