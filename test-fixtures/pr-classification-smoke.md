# PR classification smoke-test fixture

This file exists only to provide a small, safe pull request for testing DeciLabel against a real GitHub repository.

Scenario: CSV export splits a quoted field containing a comma into multiple columns.

Expected behavior: quoted CSV fields remain intact when exported.

No application code is changed. Close this pull request after the smoke test.