"""
Credential-free regression: exact critical runtime pins in requirements.txt.

The production scraper failed because Scrapling 0.4.12 hard-codes Chromium 149
and BrowserForge 1.2.4 with apify-fingerprint-datapoints 0.14.0 cannot generate
Linux Chrome 149 headers. Scrapling 0.4.1 hard-codes Chromium 141 and its
critical dependency trio imports successfully in an isolated environment.

These tests parse requirements.txt and assert the exact pinned versions. They
require no browser, no credentials, and no network access.
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

    def test_scrapling_pinned_to_0_4_1(self):
        self.assertIn("scrapling[fetchers]", self.deps,
                       "scrapling[fetchers] must be pinned in requirements.txt")
        self.assertEqual(self.deps["scrapling[fetchers]"], "0.4.1",
                         "scrapling[fetchers] must be exactly 0.4.1")
        # Safety: must NOT pin to 0.4.12 (broken Chromium 149)
        self.assertNotEqual(self.deps["scrapling[fetchers]"], "0.4.12",
                            "scrapling 0.4.12 hard-codes Chromium 149 which is broken with BrowserForge 1.2.4")

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
