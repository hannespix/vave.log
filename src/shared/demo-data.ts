/** Public facts only. Operational figures are separately seeded as fictional data.
 * Keep this versioned manifest identical to private.demo_manifest() in its migration.
 * Full provenance and uncertainty notes: docs/research/vave-public-research.md. */
export type DemoLocale = 'en'|'de'|'zh';
export type DemoLabels = Record<DemoLocale,string>;
export interface DemoStudio { id:string; name:string; city:string; country:string; source_url:string }
export interface DemoProject { code:string; name:string; client:string; year:number; location:string; types:string[]; summary:string; source_url:string }
export interface DemoPerson { name:string; role:string; source_url:string }
export interface DemoManifest { version:string; researched_at:string; disclosure:DemoLabels; studios:DemoStudio[]; projects:DemoProject[]; people:DemoPerson[]; phases:DemoLabels[]; sources:string[] }
export interface DemoWorkspace { workspace_id:string; created_by:string; request_id:string; locale:DemoLocale; manifest_version:string; manifest:DemoManifest; created_at:string; archived_at:string|null }
export const DEMO_MANIFEST:DemoManifest = {
  "version": "vave-public-2026-10-13.1",
  "researched_at": "2026-10-13",
  "disclosure": {
    "en": "Public portfolio references. All operational and financial figures are fictional demo data.",
    "de": "Öffentliche Portfolio-Referenzen. Alle betrieblichen und finanziellen Angaben sind fiktive Demodaten.",
    "zh": "项目资料来自公开作品集。所有运营和财务数据均为虚构的演示数据。"
  },
  "studios": [
    {
      "id": "frankfurt",
      "name": "Frankfurt",
      "city": "Frankfurt am Main",
      "country": "Germany",
      "source_url": "https://www.vave.studio/contact/"
    },
    {
      "id": "shanghai",
      "name": "Shanghai",
      "city": "Shanghai",
      "country": "China",
      "source_url": "https://www.vave.studio/contact/"
    },
    {
      "id": "shenzhen",
      "name": "Shenzhen",
      "city": "Shenzhen",
      "country": "China",
      "source_url": "https://www.vave.studio/contact/"
    },
    {
      "id": "dubai",
      "name": "Dubai",
      "city": "Dubai",
      "country": "United Arab Emirates",
      "source_url": "https://www.vave.studio/contact/"
    },
    {
      "id": "imagination-shanghai",
      "name": "Imagination Shanghai",
      "city": "Shanghai",
      "country": "China",
      "source_url": "https://www.vave.studio/contact/"
    },
    {
      "id": "imagination-shenzhen",
      "name": "Imagination Shenzhen",
      "city": "Shenzhen",
      "country": "China",
      "source_url": "https://www.vave.studio/contact/"
    },
    {
      "id": "digital-singapore",
      "name": "Digital Singapore",
      "city": "Singapore",
      "country": "Singapore",
      "source_url": "https://www.vave.studio/contact/"
    },
    {
      "id": "digital-shanghai",
      "name": "Digital Shanghai",
      "city": "Shanghai",
      "country": "China",
      "source_url": "https://www.vave.studio/contact/"
    }
  ],
  "projects": [
    {
      "code": "MYM26",
      "name": "MY MUSEUM",
      "client": "Sinovac Life Sciences",
      "year": 2026,
      "location": "Beijing, China",
      "types": [
        "Art Installation",
        "Museum",
        "Visitor Center"
      ],
      "summary": "Immersive museum connecting life science, art and personal reflection.",
      "source_url": "https://www.vave.studio/project/my-museum/"
    },
    {
      "code": "ICOM25",
      "name": "WEAVING A VERSATILE FUTURE",
      "client": "Dubai Culture Arts Authority",
      "year": 2025,
      "location": "Dubai, UAE",
      "types": [
        "Event",
        "Fair"
      ],
      "summary": "Spatial design and interactive cultural experiences for ICOM Dubai 2025.",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/"
    },
    {
      "code": "LEAP25",
      "name": "stc at LEAP25",
      "client": "stc",
      "year": 2025,
      "location": "Riyadh, KSA",
      "types": [
        "Fair"
      ],
      "summary": "Technology exhibition arranged as a city of themed digital districts.",
      "source_url": "https://www.vave.studio/project/stc-at-leap25/"
    },
    {
      "code": "BAL25",
      "name": "Induction Field",
      "client": "Bailian Group",
      "year": 2025,
      "location": "Shanghai, China",
      "types": [
        "Fair",
        "Retail"
      ],
      "summary": "The bálancing exhibition booth connecting retail, art and technology at CIIE.",
      "source_url": "https://www.vave.studio/project/the-balancing/"
    },
    {
      "code": "DATA18",
      "name": "DATA IN MOTION",
      "client": "Accenture",
      "year": 2018,
      "location": "Kronberg, Germany",
      "types": [
        "Showroom",
        "Visitor Center"
      ],
      "summary": "A responsive media installation visualizing data at Accenture's campus.",
      "source_url": "https://www.vave.studio/project/data-in-motion/"
    },
    {
      "code": "META22",
      "name": "META CUBE EXPERIENCE",
      "client": "SAP",
      "year": 2022,
      "location": "Hanover, Germany",
      "types": [
        "Fair",
        "Interactive"
      ],
      "summary": "An interactive cube installation explaining industrial digital processes at Hannover Messe.",
      "source_url": "https://www.vave.studio/project/meta-cube-experience/"
    },
    {
      "code": "POR16",
      "name": "THE FUTURE OF PERFORMANCE",
      "client": "Porsche AG",
      "year": 2016,
      "location": "Berlin, Germany",
      "types": [
        "Exhibition",
        "Showroom"
      ],
      "summary": "Temporary Porsche brand exhibition at the Volkswagen Group's Drive forum.",
      "source_url": "https://www.vave.studio/project/the-future-of-performance/"
    },
    {
      "code": "DB23",
      "name": "ZUKUNFT NAHVERKEHR",
      "client": "DB Regio",
      "year": 2023,
      "location": "Berlin, Germany",
      "types": [
        "Event",
        "Exhibition"
      ],
      "summary": "An introductory exhibition journey about the future of regional mobility.",
      "source_url": "https://www.vave.studio/project/zukunft-nahverkehr-db/"
    }
  ],
  "people": [
    {
      "name": "Tobias Geisler",
      "role": "Co-Founder & CEO",
      "source_url": "https://www.vave.studio/fra/tobias-geisler-to-be-jury-chair-of-2026-adc-awards/"
    },
    {
      "name": "Haijie Hu",
      "role": "Co-Founder",
      "source_url": "https://www.vave.studio/sha/hu-haijie-attend-caas-dalu-forum-make-people-feel/"
    },
    {
      "name": "Christian Rösner",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/"
    },
    {
      "name": "Dustin Stupp",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/"
    },
    {
      "name": "Matthias Sütterlin",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/"
    },
    {
      "name": "Whan Lee",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/"
    }
  ],
  "phases": [
    {
      "en": "Research & Strategy",
      "de": "Recherche & Strategie",
      "zh": "研究与策略"
    },
    {
      "en": "Design & Planning",
      "de": "Design & Planung",
      "zh": "设计与规划"
    },
    {
      "en": "Production & Supervision",
      "de": "Produktion & Begleitung",
      "zh": "制作与监督"
    }
  ],
  "sources": [
    "https://www.vave.studio/",
    "https://www.vave.studio/contact/",
    "https://www.vave.studio/culture/",
    "https://www.vave.studio/approach/",
    "https://www.vave.studio/imprint/",
    "https://www.vave.studio/project/my-museum/",
    "https://www.vave.studio/project/weaving-a-versatile-future/",
    "https://www.vave.studio/project/stc-at-leap25/",
    "https://www.vave.studio/project/the-balancing/",
    "https://www.vave.studio/project/data-in-motion/",
    "https://www.vave.studio/project/meta-cube-experience/",
    "https://www.vave.studio/project/the-future-of-performance/",
    "https://www.vave.studio/project/zukunft-nahverkehr-db/",
    "https://www.vave.studio/fra/tobias-geisler-to-be-jury-chair-of-2026-adc-awards/",
    "https://www.vave.studio/sha/hu-haijie-attend-caas-dalu-forum-make-people-feel/",
    "https://www.vave.studio/imprint/"
  ]
};
