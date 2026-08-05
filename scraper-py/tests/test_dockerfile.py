"""
Credential-free regression: Dockerfile must be deployable for Scrapling 0.3.12.

Scrapling 0.3.12 StealthyFetcher uses Camoufox/Firefox, not Chromium/Patchright.
The Dockerfile must:
  1. Run scrapling install fail-closed (no || true)
  2. Include a build-time import smoke for StealthyFetcher
  3. Document Camoufox/Firefox as the browser runtime
  4. Not redundantly install Patchright Chromium

These tests parse the Dockerfile as plain text. No browser, no credentials,
no network.
"""

from __future__ import annotations

import os
import re
import unittest


DOCKERFILE_PATH = os.path.join(os.path.dirname(__file__), "..", "Dockerfile")


def read_lines(path: str) -> list[str]:
    with open(path) as f:
        return f.readlines()


class DockerfileRegressionTests(unittest.TestCase):
    """Assert Dockerfile is deployable with Scrapling 0.3.12 StealthyFetcher."""

    @classmethod
    def setUpClass(cls):
        cls.lines = read_lines(DOCKERFILE_PATH)
        cls.text = "".join(cls.lines)

    def test_scrapling_install_fail_closed(self):
        """RUN scrapling install must NOT be followed by || true.
        A deployable image must fail if the browser cannot be installed."""
        for line in self.lines:
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if "scrapling install" in stripped and "|| true" in stripped:
                self.fail(
                    "scrapling install is not fail-closed in Dockerfile. "
                    "Remove '|| true' so a browser-installation failure "
                    "stops the build."
                )

    def test_build_time_stealthyfetcher_import_smoke(self):
        """The Dockerfile must contain a build-time import smoke for
        StealthyFetcher so the image build fails if the fetcher cannot
        be imported (e.g. wrong BrowserForge / apify datapoints)."""
        full_text = self.text
        has_import_smoke = bool(
            re.search(
                r'python\s+-c\s+["\']from scrapling\.fetchers import StealthyFetcher',
                full_text,
            )
        )
        self.assertTrue(
            has_import_smoke,
            "Dockerfile must include a build-time import smoke: "
            "RUN python -c \"from scrapling.fetchers import StealthyFetcher\""
        )

    def test_camoufox_firefox_browser_documented(self):
        """Dockerfile comments must reference Camoufox/Firefox as the browser
        runtime for Scrapling 0.3.12 StealthyFetcher, not Chromium/Patchright."""
        comment_lines = [l for l in self.lines if l.strip().startswith("#")]
        comment_text = "\n".join(comment_lines)
        has_camoufox = bool(
            re.search(r"[Cc]amoufox|[Ff]irefox", comment_text)
        )
        self.assertTrue(
            has_camoufox,
            "Dockerfile comments must document Camoufox/Firefox as the browser "
            "runtime (Scrapling 0.3.12 StealthyFetcher uses Camoufox/Firefox, "
            "not Chromium/Patchright)."
        )

    def test_no_patchright_install_chromium(self):
        """The redundant patchright install chromium must be absent.
        Scrapling 0.3.12 StealthyFetcher does not use Patchright/Chromium."""
        for line in self.lines:
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if "patchright install chromium" in stripped:
                self.fail(
                    "Dockerfile contains redundant 'patchright install chromium'. "
                    "Scrapling 0.3.12 StealthyFetcher uses Camoufox/Firefox, "
                    "not Patchright/Chromium. Remove this line."
                )


if __name__ == "__main__":
    unittest.main()
