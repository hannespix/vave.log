# VAVE public research for an example agency workspace

Research date: 2026-10-13 (UTC). Scope: public information on VAVE's official website. This is a factual seed recommendation, not a reconstruction of its private operations. All eight selected projects have a directly inspected official case-study page. No accounts were created, forms submitted, private contact details collected, or images copied.

## Seed boundary

Use public names, published project metadata and explicitly attributed roles as factual context. Any hours, bookings, deadlines, project status, rates, budgets, costs, margin, invoices, payment status or staffing assumptions in an interactive sample must be marked fictional. Historical project years must remain separate from a simulated planning period.

Suggested persistent disclosure: **Public portfolio references. All operational and financial figures are fictional demo data.**

Store provenance on each seeded entity. Keep `portfolioYear` separate from `demoStartDate`. Public credits do not establish current employment type, office assignment, availability, commercial authority or account permissions. Do not populate real invoice recipient or issuer tax/bank details from this research.

## Organization, studios and brand

The official contact page lists eight offices, across five city names. The culture page describes an international, interdisciplinary organization of more than 100 people across eight studios; that is a public self-description, not an independently audited headcount. Sources: [Contact](https://www.vave.studio/contact/), [Culture](https://www.vave.studio/culture/).

```json
{
  "organization": {
    "displayName": "VAVE",
    "website": "https://www.vave.studio/",
    "specialism": "Space Experience Design",
    "sourceUrl": "https://www.vave.studio/"
  },
  "studios": [
    { "id": "frankfurt", "name": "Frankfurt", "city": "Frankfurt am Main", "country": "Germany" },
    { "id": "shanghai", "name": "Shanghai", "city": "Shanghai", "country": "China" },
    { "id": "shenzhen", "name": "Shenzhen", "city": "Shenzhen", "country": "China" },
    { "id": "dubai", "name": "Dubai", "city": "Dubai", "country": "United Arab Emirates" },
    { "id": "imagination-shanghai", "name": "Imagination Shanghai", "city": "Shanghai", "country": "China" },
    { "id": "imagination-shenzhen", "name": "Imagination Shenzhen", "city": "Shenzhen", "country": "China" },
    { "id": "digital-singapore", "name": "Digital Singapore", "city": "Singapore", "country": "Singapore" },
    { "id": "digital-shanghai", "name": "Digital Shanghai", "city": "Shanghai", "country": "China" }
  ],
  "studioSourceUrl": "https://www.vave.studio/contact/",
  "verifiedAt": "2026-10-13"
}
```

Only city-level locations are recommended for operational seed data. The contact and imprint pages show different street addresses for Dubai and Imagination Shanghai, potentially reflecting office versus registration locations; this research does not resolve which address serves which purpose. The culture page additionally shows Riyadh and a Riyadh recruiting section, but it is not among the eight contact-page offices. Do not add a ninth established studio from that alone. Sources: [Contact](https://www.vave.studio/contact/), [Imprint](https://www.vave.studio/imprint/), [Culture](https://www.vave.studio/culture/).

Brand observations (editorial interpretation): concise, energetic, future-oriented, emotionally driven, international, and playful. Short uppercase headlines coexist with precise case-study metadata. Use clear action verbs and a restrained expressive headline; keep financial controls literal and calm. The homepage's three-word statement is “MAKE PEOPLE FEEL.” Its work spans exhibitions, museums, showrooms, interactive installations, retail and fairs. Source: [Home](https://www.vave.studio/).

The official service structure can inform optional project phases: Research & Strategy; Design & Planning; Production & Supervision. The approach page also describes strategy, conceptual design, integration of media/technology, spatial planning and project management. These are published capabilities, not evidence of actual timesheet categories. Source: [Approach](https://www.vave.studio/approach/).

## Eight project seed recommendations

Each `portfolioYear`, client label and location below comes from the page's structured case-study header. Descriptions are short paraphrases. Client names are portfolio labels, not verified billing-entity names. Source URLs are part of the suggested object so the interface can provide a direct provenance link.

```json
[
  {
    "id": "portfolio-my-museum",
    "name": "MY MUSEUM",
    "clientName": "Sinovac Life Sciences",
    "portfolioYear": 2026,
    "location": "Beijing, China",
    "types": ["Art Installation", "Museum", "Visitor Center"],
    "summary": "Immersive museum connecting life science, art and personal reflection.",
    "sourceUrl": "https://www.vave.studio/project/my-museum/",
    "sourceNotes": "The header names Sinovac Life Sciences; credits use Sinovac Group. The page reports opening in May 2026.",
    "provenance": "official_public_portfolio",
    "operationalMetrics": "fictional_demo_only"
  },
  {
    "id": "portfolio-weaving-versatile-future",
    "name": "WEAVING A VERSATILE FUTURE",
    "clientName": "Dubai Culture Arts Authority",
    "portfolioYear": 2025,
    "location": "Dubai, UAE",
    "types": ["Event", "Fair"],
    "summary": "Spatial design and interactive cultural experiences for ICOM Dubai 2025.",
    "sourceUrl": "https://www.vave.studio/project/weaving-a-versatile-future/",
    "sourceNotes": "Credits spell the client Dubai Culture & Arts Authority. ICOM is separately credited as event organizer.",
    "provenance": "official_public_portfolio",
    "operationalMetrics": "fictional_demo_only"
  },
  {
    "id": "portfolio-stc-leap25",
    "name": "stc at LEAP25",
    "clientName": "stc",
    "portfolioYear": 2025,
    "location": "Riyadh, KSA",
    "types": ["Fair"],
    "summary": "Technology exhibition arranged as a city of themed digital districts.",
    "sourceUrl": "https://www.vave.studio/project/stc-at-leap25/",
    "sourceNotes": "VAVE credits cover concept, design, research, storytelling and supervision; external construction/content suppliers are separately named.",
    "provenance": "official_public_portfolio",
    "operationalMetrics": "fictional_demo_only"
  },
  {
    "id": "portfolio-induction-field",
    "name": "Induction Field",
    "clientName": "Bailian Group",
    "portfolioYear": 2025,
    "location": "Shanghai, China",
    "types": ["Fair", "Retail"],
    "summary": "The bálancing exhibition booth connecting retail, art and technology at CIIE.",
    "sourceUrl": "https://www.vave.studio/project/the-balancing/",
    "sourceNotes": "The page identifies the 8th China International Import Expo and its November 5, 2025 opening.",
    "provenance": "official_public_portfolio",
    "operationalMetrics": "fictional_demo_only"
  },
  {
    "id": "portfolio-data-in-motion",
    "name": "DATA IN MOTION",
    "clientName": "Accenture",
    "portfolioYear": 2018,
    "location": "Kronberg, Germany",
    "types": ["Showroom", "Visitor Center"],
    "summary": "A responsive media installation visualizing data at Accenture's campus.",
    "sourceUrl": "https://www.vave.studio/project/data-in-motion/",
    "sourceNotes": "The case study describes a foyer media wall, media corridor and responsive overhead LED ring.",
    "provenance": "official_public_portfolio",
    "operationalMetrics": "fictional_demo_only"
  },
  {
    "id": "portfolio-meta-cube",
    "name": "META CUBE EXPERIENCE",
    "clientName": "SAP",
    "portfolioYear": 2022,
    "location": "Hanover, Germany",
    "types": ["Fair", "Interactive"],
    "summary": "An interactive cube installation explaining industrial digital processes at Hannover Messe.",
    "sourceUrl": "https://www.vave.studio/project/meta-cube-experience/",
    "sourceNotes": "Header and body both identify the 2022 trade-show context.",
    "provenance": "official_public_portfolio",
    "operationalMetrics": "fictional_demo_only"
  },
  {
    "id": "portfolio-future-of-performance",
    "name": "THE FUTURE OF PERFORMANCE",
    "clientName": "Porsche AG",
    "portfolioYear": 2016,
    "location": "Berlin, Germany",
    "types": ["Exhibition", "Showroom"],
    "summary": "Temporary Porsche brand exhibition at the Volkswagen Group's Drive forum.",
    "sourceUrl": "https://www.vave.studio/project/the-future-of-performance/",
    "sourceNotes": "The page describes a three-month exhibition connecting the brand's history with future performance.",
    "provenance": "official_public_portfolio",
    "operationalMetrics": "fictional_demo_only"
  },
  {
    "id": "portfolio-zukunft-nahverkehr",
    "name": "ZUKUNFT NAHVERKEHR",
    "clientName": "DB Regio",
    "portfolioYear": 2023,
    "location": "Berlin, Germany",
    "types": ["Event", "Exhibition"],
    "summary": "An introductory exhibition journey about the future of regional mobility.",
    "sourceUrl": "https://www.vave.studio/project/zukunft-nahverkehr-db/",
    "sourceNotes": "VAVE describes the work as a prologue to the fair event, developed with DB Regio.",
    "provenance": "official_public_portfolio",
    "operationalMetrics": "fictional_demo_only"
  }
]
```

## Six public leadership profiles

The imprint lists Christian Rösner, Dustin Stupp, Matthias Sütterlin and Whan Lee as Associate Partners of VAVE Germany GmbH. It also lists Tobias Geisler and Christian Rösner as its representatives. Project credits below are project-specific, not an assertion of each person's current organization-wide job title. No private contact details or biographies are included.

```json
[
  {
    "name": "Tobias Geisler",
    "publicRole": "Co-Founder & CEO",
    "roleScope": "VAVE; official news dated 2026-03-30",
    "sourceUrl": "https://www.vave.studio/fra/tobias-geisler-to-be-jury-chair-of-2026-adc-awards/",
    "publishedProjectCredit": { "projectId": "portfolio-weaving-versatile-future", "role": "Creative Director", "sourceUrl": "https://www.vave.studio/project/weaving-a-versatile-future/" }
  },
  {
    "name": "Haijie Hu",
    "publicRole": "Co-Founder",
    "roleScope": "VAVESTUDIO; official news dated 2025-03-25",
    "sourceUrl": "https://www.vave.studio/sha/hu-haijie-attend-caas-dalu-forum-make-people-feel/",
    "nameVariantsOnSite": ["Hu Haijie", "Hu, Haijie"],
    "publishedProjectCredit": { "projectId": "portfolio-my-museum", "role": "Creative Director", "sourceUrl": "https://www.vave.studio/project/my-museum/" }
  },
  {
    "name": "Christian Rösner",
    "publicRole": "Associate Partner",
    "roleScope": "VAVE Germany GmbH",
    "sourceUrl": "https://www.vave.studio/imprint/",
    "publishedProjectCredit": { "projectId": "portfolio-my-museum", "role": "Project Manager", "sourceUrl": "https://www.vave.studio/project/my-museum/" }
  },
  {
    "name": "Dustin Stupp",
    "publicRole": "Associate Partner",
    "roleScope": "VAVE Germany GmbH",
    "sourceUrl": "https://www.vave.studio/imprint/",
    "publishedProjectCredit": { "projectId": "portfolio-stc-leap25", "role": "Creative Director", "sourceUrl": "https://www.vave.studio/project/stc-at-leap25/" }
  },
  {
    "name": "Matthias Sütterlin",
    "publicRole": "Associate Partner",
    "roleScope": "VAVE Germany GmbH",
    "sourceUrl": "https://www.vave.studio/imprint/",
    "publishedProjectCredit": { "projectId": "portfolio-my-museum", "role": "Art Director", "sourceUrl": "https://www.vave.studio/project/my-museum/" }
  },
  {
    "name": "Whan Lee",
    "publicRole": "Associate Partner",
    "roleScope": "VAVE Germany GmbH",
    "sourceUrl": "https://www.vave.studio/imprint/",
    "publishedProjectCredit": { "projectId": "portfolio-my-museum", "role": "Art Director", "sourceUrl": "https://www.vave.studio/project/my-museum/" }
  }
]
```

For all six profiles, leave actual cost rate, billing rate, contractual hours, employment type, home studio and current availability unknown. If a demonstration requires those fields, label them per-record as synthetic, or use separate fictional role-based demo people instead. A public leadership profile should not grant application admin privileges.

## Uncertainties and exclusions

- **Reflect Tomorrow is excluded from the default eight.** Its subtitle refers to the Venice Architecture Biennale 2023, but its metadata and credits say 2022. The page is insufficient to establish a single delivery year or whether the concept was realized. Source: [Reflect Tomorrow](https://www.vave.studio/project/reflect-tomorrow/).
- **Office versus registration address:** discrepancies noted above are preserved, not silently normalized. Use only city-level studios until the organization supplies its intended operational address.
- **Riyadh:** recruiting/culture presence does not establish an additional office beyond the official eight-location contact list.
- **Client entity names:** portfolio labels do not establish contractual counterparty, invoice address, VAT ID, billing contact, or whether a direct client versus intermediary relationship applied. Sinovac and Dubai Culture labels vary between headers and credits; preserve the aliases as notes.
- **Dates:** a portfolio year is not a start/end schedule, contract date, financial year or evidence that the project remains active. Historical work should not be presented as current work without a demo label.
- **Roles:** founder and partner statements are public claims as retrieved; a historical project credit proves only that the website attributes that credit, not an ongoing employment contract or present-day hierarchy.
- **Unknown private operations:** no actual revenue, client fees, expenses, budgets, margins, rates, salaries, individual workload, capacity, contracts, invoices, payments, pipeline or utilization was established. Do not estimate them from project size, client prominence or headcount.
- **Asset reuse:** this research supplies original short summaries and factual names. It does not provide a license to reproduce portfolio photographs, videos, illustrations, biographies or long website passages. Use text references and direct links in the demo.

## Practical first-run recommendation

Create an optional, clearly labeled sample workspace containing the eight project references, eight public studio labels and six public leadership profiles. Keep operations empty by default or activate a visibly fictional scenario separately. Suggested phase templates follow the three published service groups, but all assigned effort is sample data. Offer **Start with sample data** and **Start empty**; ensure deleting the sample removes only its tagged records. These are product recommendations inferred from the researched portfolio, not statements about VAVE's current software or business processes.

## Source index

All inspected sources are official VAVE pages, accessed 2026-10-13. The content is self-published and subject to change. Project metadata was checked on the direct page, not inferred from search snippets.

| Source | Facts used |
| --- | --- |
| https://www.vave.studio/ | Positioning, broad work categories, short brand statement |
| https://www.vave.studio/contact/ | Eight listed offices and city locations |
| https://www.vave.studio/culture/ | Founder story, public scale claim, culture, Riyadh caveat |
| https://www.vave.studio/approach/ | Three service groups and capabilities |
| https://www.vave.studio/imprint/ | Associate partner names; entity/office-address distinctions |
| https://www.vave.studio/work/ | Portfolio index and direct case-study links |
| https://www.vave.studio/project/my-museum/ | Project metadata, May 2026 opening, selected role credits |
| https://www.vave.studio/project/weaving-a-versatile-future/ | Project metadata, ICOM context, selected role credit |
| https://www.vave.studio/project/stc-at-leap25/ | Project metadata, scope and selected role credit |
| https://www.vave.studio/project/the-balancing/ | Induction Field metadata and CIIE context |
| https://www.vave.studio/project/data-in-motion/ | Accenture installation metadata and summary |
| https://www.vave.studio/project/meta-cube-experience/ | SAP installation metadata and context |
| https://www.vave.studio/project/the-future-of-performance/ | Porsche exhibition metadata and context |
| https://www.vave.studio/project/zukunft-nahverkehr-db/ | DB Regio exhibition metadata and context |
| https://www.vave.studio/fra/tobias-geisler-to-be-jury-chair-of-2026-adc-awards/ | Tobias Geisler's publicly stated Co-Founder & CEO role |
| https://www.vave.studio/sha/hu-haijie-attend-caas-dalu-forum-make-people-feel/ | Haijie Hu's publicly stated Co-Founder role |
| https://www.vave.studio/project/reflect-tomorrow/ | Excluded candidate with conflicting year/context |
