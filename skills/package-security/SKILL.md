---
name: package-security
description: |
  Dependency safety checks for coding agents over x402 (USDC on Base), $0.003-0.02 per call: known vulnerabilities for the exact version you would install (npm, PyPI, Go, crates.io, Maven, NuGet, RubyGems, Packagist), a whole lockfile or requirements.txt scanned in one call, hallucinated and typosquatted package names caught before install, and npm package health. No account or API key. A call that fails is never charged.

  USE FOR:
  - Checking a package an LLM suggested before running npm install or pip install
  - "Is this version vulnerable?" for any package, with the fix version on your release line
  - Scanning a package-lock.json, package.json, requirements.txt or Pipfile.lock for known vulnerabilities
  - Catching dependencies that do not exist on the registry (hallucinated names) or imitate popular ones
  - Choosing between npm libraries, or scoring one before adding it

  TRIGGERS:
  - "is this package safe", "is it vulnerable", "CVE", "security advisory", "npm audit", "pip-audit", "OSV"
  - "check my dependencies", "scan package-lock", "scan requirements.txt", "audit dependencies"
  - "does this package exist", "typosquat", "hallucinated package", "slopsquatting"
  - "should I use axios or got", "is this package maintained", "package health"

  IMPORTANT: Use the exact URLs in the Quick Reference table. Never guess paths. To list everything: x402.discover_api_endpoints(url="https://pkgpulse.letom1176.workers.dev")
mcp:
  - x402
---

# Package security on pkgpulse (x402)

Pay-per-call dependency checks at `https://pkgpulse.letom1176.workers.dev`. Every endpoint answers an unpaid request with HTTP 402 and a price; the x402 MCP pays and retries for you. **The payment only settles when the call succeeds.** Advisories come from OSV.dev (GitHub Advisory Database, PyPA, Go, RustSec, OpenSSF malicious packages); registry facts from npm and PyPI.

## Setup

See [rules/getting-started.md](rules/getting-started.md) (one install command, then fund the wallet with USDC on Base).

## Quick Reference

| Task | Endpoint | Price | Input |
|------|----------|-------|-------|
| Known vulnerabilities for one package version | `https://pkgpulse.letom1176.workers.dev/api/vuln-check` | $0.003 | `?name=lodash&version=4.17.15` (`&ecosystem=pypi`, or `?purl=pkg:pypi/requests@2.19.0`) |
| Vulnerability scan of a lockfile or requirements.txt | `https://pkgpulse.letom1176.workers.dev/api/vuln-audit` | $0.01 | POST the file, or `?packages=lodash@4.17.15,pypi:requests==2.19.0` |
| Python package preflight (exists? lookalike? vulnerable?) | `https://pkgpulse.letom1176.workers.dev/api/pypi-check` | $0.003 | `?name=requests` (`&version=>=2.28`) |
| Audit a requirements.txt | `https://pkgpulse.letom1176.workers.dev/api/pypi-audit` | $0.01 | POST the file, or `?names=requests==2.19.0,numpy` |
| npm typosquat / hallucinated-name check | `https://pkgpulse.letom1176.workers.dev/api/typosquat-check` | $0.003 | `?name=expresss` |
| npm package health score (0-100) | `https://pkgpulse.letom1176.workers.dev/api/package-health` | $0.005 | `?name=express` |
| Pick between npm packages | `https://pkgpulse.letom1176.workers.dev/api/pick` | $0.01 | `?names=axios,got,undici` |
| Audit a package.json (existence, deprecation, install scripts, vulnerabilities) | `https://pkgpulse.letom1176.workers.dev/api/deps-audit` | $0.02 | POST package.json, or `?names=express,lodash` |

## When to Use What

| Situation | Use |
|-----------|-----|
| An LLM suggested `npm install X` and you have not seen X before | typosquat-check (catches names that do not exist or imitate popular packages) |
| An LLM suggested `pip install X` | pypi-check |
| About to pin, add or upgrade one dependency | vuln-check for that exact version or range |
| Reviewing a repository's dependencies | vuln-audit with the lockfile (covers every transitive package) |
| Python project with a requirements.txt | pypi-audit (existence + lookalikes + staleness + vulnerabilities) |
| Choosing between libraries | pick |

Ranges are resolved the way the package manager would: `^4.17.0` checks the release npm installs, `>=2.28,<3` the release pip installs. Go, crates.io, Maven, NuGet, RubyGems and Packagist are checked at the version you give (prefix items with `go:`, `crates:`, `maven:` ... in vuln-audit).

## Examples

One version:
```mcp
x402.fetch(url="https://pkgpulse.letom1176.workers.dev/api/vuln-check?name=lodash&version=4.17.15")
```
Returns `verdict` (`vulnerable` / `no_known_vulnerabilities` / `malicious` / `not_found` / `version_not_found`), a one-line `headline`, `counts` by severity, `upgrade_to`, and each advisory with `severity`, `cvss_score`, CVE `aliases` and `fixed_in`. Removed malicious releases (for example `event-stream@3.3.6`) come back as `malicious`.

A whole lockfile:
```mcp
x402.fetch(
  url="https://pkgpulse.letom1176.workers.dev/api/vuln-audit",
  method="POST",
  body=<the contents of package-lock.json>
)
```
Also accepts package.json, Pipfile.lock, `{"requirements": "<requirements.txt>"}` or `{"packages": ["lodash@4.17.15", "pypi:requests==2.19.0"]}`. Returns `summary`, `verdict`, `worst_offenders` and per-package results. Up to 200 packages per call; anything over the per-call lookup budget is listed as unresolved, never dropped silently.

Before a pip install:
```mcp
x402.fetch(url="https://pkgpulse.letom1176.workers.dev/api/pypi-check?name=reqeusts")
```
A name that is not on PyPI returns `verdict: "stop"` with the popular project it resembles.

## Errors

| Status | Meaning | Charged? |
|--------|---------|----------|
| 402 | Payment required (normal first response) | No |
| 400 | Bad input (invalid name, unsupported range syntax, empty body) | No |
| 503 | A registry or OSV was unavailable; retry shortly | No |

Results cover published advisories and registry facts only. "No known vulnerabilities" is not a guarantee of safety.
