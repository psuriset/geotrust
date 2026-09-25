# Third-party notices

GeoTrust code and its authored synthetic fixtures are MIT licensed. Production inventory geometry is not committed. Phase 3 commits an acquisition manifest containing public service metadata. Locally acquired data and evidence exports retain separate dataset terms.

- GeoLibre is MIT, copyright 2026 Qiusheng Wu. The repository contains a pinned copy of its plugin type declarations solely as a contract-test snapshot. The GeoLibre host is not bundled.
- Turf and Zod are MIT. Their transitive code is included in the plugin bundle where required.
- MapLibre GL JS is BSD-3-Clause with additional included-code notices. It is used by the development preview; the plugin uses the host's map instance instead of embedding a second MapLibre runtime.
- fflate is MIT and used at build/test time to package the ZIP.
- Build/test tools have separate upstream licenses, recorded in the npm lock and installed packages.

The build collects full installed production-dependency license texts into THIRD_PARTY_LICENSES.txt, included in the plugin ZIP and copied beside the demo. This intentionally includes a superset of plugin dependencies so the local preview is covered too. LICENSE files from the exact lock take precedence over this summary. No paid mapping SDK, online basemap, data service or model weight is distributed.

GeoLibre's MIT notice for the contract snapshot follows.

Copyright (c) 2026 Qiusheng Wu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Phase 3 uses public Census TIGERweb data (Census public-domain policy) and NC OneMap hospitals/potential-shelter layers (NC OneMap data-sharing terms and retained service metadata). See [source rights and interpretation](docs/phase-3.md#data-snapshot-and-rights). Software MIT licensing does not relabel these sources or remove their disclaimers. Source geometry is not evidence of operational availability.
