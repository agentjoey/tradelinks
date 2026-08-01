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

    def test_scrapling_module_no_eager_chrome_143(self):
        """If scrapling is installed, its fingerprints.py must not expose a
        chrome_version >= 143 (the eager-UA boundary). Skip if not installed."""
        try:
            import scrapling
        except ImportError:
            self.skipTest("scrapling not installed in this test environment")
        version_attr = getattr(scrapling, '__version__', None)
        if version_attr:
            version_parts = version_attr.split(".")
            if len(version_parts) >= 2:
                major = int(version_parts[0])
                minor = int(version_parts[1])
                if major == 0 and minor >= 4:
                    self.fail(
                        f"Scrapling {version_attr} installed, which introduced the "
                        f"eager-UA boundary. Must use 0.3.x."
                    )
        # Inspect fingerprints module for chrome_version constant
        try:
            import scrapling.engines.toolbelt.fingerprints as fp
            chrome_ver = getattr(fp, 'chrome_version', None)
            if chrome_ver is not None:
                self.assertLess(
                    chrome_ver, 143,
                    f"scrapling.engines.toolbelt.fingerprints.chrome_version={chrome_ver} "
                    f"exceeds BrowserForge 1.2.4 max (142). Eager Chrome {chrome_ver} UA "
                    f"generation in _config_tools will fail at import time."
                )
        except ImportError:
            pass  # 0.3.x may not have the submodule or chrome_version constant

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


if __name__ == "__main__":
    unittest.main()
