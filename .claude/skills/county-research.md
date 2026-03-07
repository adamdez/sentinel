# /county-research — Research County Data Sources

Research free/public data sources for a target county. Every new market needs its GIS portal, assessor website, recorder portal, and open data catalog mapped out before we can effectively acquire in that county.

## Arguments
The user will provide a county name and state (e.g., "Bonner County ID", "Latah County ID").

## What to do

1. **GIS Portal** — Search for the county's public ArcGIS REST services:
   - Common patterns: `gis.[county].org`, `maps.[county].org`, `[county].maps.arcgis.com`
   - Look for MapServer endpoints with parcel/assessor layers
   - Test query: `?where=1=1&outFields=*&resultRecordCount=1&f=json`
   - Document: URL, available fields, query format, rate limits

2. **Assessor/Treasurer Website** — Find:
   - Property search tool (by APN, address, owner name)
   - Tax payment/delinquency lookup
   - Assessment roll downloads (bulk CSV/Excel)
   - Parcel maps
   - Document format for API-style queries vs HTML scraping

3. **Recorder/Clerk** — Find:
   - Document recording search (deeds, liens, mortgages)
   - Court record portal (divorces, bankruptcies, probate)
   - Guest/public access URLs
   - Search parameters available (name, date range, document type)

4. **State-Level Resources** — Check:
   - State GIS clearinghouse (e.g., Idaho IDWR for ID counties)
   - State court system (mycourts.idaho.gov for ID, courts.wa.gov for WA)
   - Secretary of State (business entity search)
   - Tax commission / Department of Revenue

5. **Open Data Catalog** — Look for:
   - ArcGIS Hub / Open Data site
   - Socrata / CKAN data portals
   - Downloadable datasets (CSV, GeoJSON, Shapefile)
   - API endpoints with no auth required

6. **Document findings** — Produce a structured report:
   ```
   COUNTY: [Name], [State]

   GIS PORTAL:
   - URL: [url]
   - Layers: [list with IDs]
   - Fields: [key fields available]
   - Query format: [example query]

   ASSESSOR:
   - Search URL: [url]
   - Bulk download: [url or "not available"]
   - APN format: [format]

   RECORDER:
   - Search URL: [url]
   - Guest access: [yes/no + url]
   - Document types: [list]

   COURT RECORDS:
   - Portal: [url]
   - County code/ID: [value]

   INTEGRATION PRIORITY: [HIGH/MED/LOW]
   Recommended next steps: [what to build]
   ```

7. **Update code if actionable** — If endpoints are found:
   - Add to `src/lib/county-data.ts` (new query functions)
   - Update `isCountySupported()` and `getCountyData()`
   - Add FIPS code to `src/lib/attom.ts` if not already present
   - Update CLAUDE.md Known Free Data Sources section
   - Add court URLs to `src/lib/crawlers/court-docket-crawler.ts`

## Target counties (from CLAUDE.md)
Spokane (WA), Kootenai (ID), Bonner (ID), Latah (ID), Whitman (WA), Lincoln (WA), Stevens (WA)
