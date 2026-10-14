/** Public facts only. Operational figures are separately seeded as fictional data.
 * Keep this versioned manifest identical to private.demo_manifest() in its migration.
 * Full provenance and uncertainty notes: docs/research/vave-public-research.md. */
export type DemoLocale = 'en'|'de'|'zh';
export type DemoLabels = Record<DemoLocale,string>;
export interface DemoStudio { id:string; name:string; city:string; country:string; source_url:string }
export interface DemoProject { code:string; name:string; client:string; year:number; location:string; types:string[]; summary:string; source_url:string }
export interface DemoPerson { name:string; role:string; source_url:string; origin?:'public'|'fictional'; studio?:string; kind?:'employee'|'freelancer' }
export interface DemoManifest { version:string; researched_at:string; disclosure:DemoLabels; studios:DemoStudio[]; projects:DemoProject[]; people:DemoPerson[]; fictional_projects?:{code:string;name:string;client:string}[]; phases:DemoLabels[]; sources:string[] }
export interface DemoWorkspace { workspace_id:string; created_by:string; request_id:string; locale:DemoLocale; manifest_version:string; manifest:DemoManifest; created_at:string; archived_at:string|null; experience_version?:number }
export const DEMO_MANIFEST:DemoManifest = {
  "version": "vave-full-2026-10-14.2",
  "researched_at": "2026-10-14",
  "disclosure": {
    "en": "Public project credits are historical context, not a current employment roster. All demo roles, assignments, time and financial details are fictional. DEMO — DO NOT PAY.",
    "de": "Öffentliche Projekt-Credits sind historischer Kontext, keine aktuelle Personalliste. Alle Demorollen, Aufgaben, Zeiten und Finanzangaben sind fiktiv. DEMO — NICHT BEZAHLEN.",
    "zh": "公开项目署名仅为历史资料，并非当前员工名单。所有演示角色、任务、工时及财务资料均为虚构。DEMO — 演示文件，请勿付款。"
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
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Haijie Hu",
      "role": "Co-Founder",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Christian Rösner",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Dustin Stupp",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Matthias Sütterlin",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Whan Lee",
      "role": "Associate Partner",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Ou Zhiwen",
      "role": "Shenzhen entity representative / strategy",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Yin Shuaibo",
      "role": "Imagination Shanghai entity representative / strategy",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Wang Ling",
      "role": "Imagination Shenzhen entity representative",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Irwan Kassim",
      "role": "Digital Singapore entity representative",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Sankalp Sharma",
      "role": "Dubai entity legal representative",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Charles Lo",
      "role": "VAVE DIGITAL Partner & General Manager",
      "source_url": "https://www.vave.studio/sha/hu-haijie-charles-lo-deliver-lectures-at-school-of-design-ecnu/",
      "origin": "public"
    },
    {
      "name": "Xiaorong Li",
      "role": "Website editorial",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Victoria Cocco",
      "role": "Website editorial",
      "source_url": "https://www.vave.studio/imprint/",
      "origin": "public"
    },
    {
      "name": "Wang Zuting",
      "role": "Project management",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Xiong Li",
      "role": "Content planning",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Shao Minmei",
      "role": "Content planning",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Zhao Gun",
      "role": "Content planning",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Ge Yanhan",
      "role": "Content planning",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Li Ziyao",
      "role": "Concept design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Zhou Junlei",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Chen Zhuang",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Lin Zhiqi",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Guo Wenchao",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Ou Xiang",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Tang Jinlin",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Wang Youying",
      "role": "Communication design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Liu Luo",
      "role": "Communication design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Lin Shunkang",
      "role": "Communication design",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Jerry Zhang",
      "role": "VAVE DIGITAL software development",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Tab Liu",
      "role": "VAVE DIGITAL software development",
      "source_url": "https://www.vave.studio/project/my-museum/",
      "origin": "public"
    },
    {
      "name": "Phil Püschel",
      "role": "Project management",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Wenqian Luo",
      "role": "Design direction",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Peter Mülling",
      "role": "Concept design",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Hussein Nabolsi",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Zi Yi Chua",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Katja Mikhalenka",
      "role": "Schematic design",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Soorim Kim",
      "role": "Communication design",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Abdul Zakaria",
      "role": "Communication design / digital content management",
      "source_url": "https://www.vave.studio/project/weaving-a-versatile-future/",
      "origin": "public"
    },
    {
      "name": "Vincent Kropp",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/stc-at-leap25/",
      "origin": "public"
    },
    {
      "name": "Giulia Arienzo",
      "role": "Space design",
      "source_url": "https://www.vave.studio/project/stc-at-leap25/",
      "origin": "public"
    },
    {
      "name": "Guifang Du",
      "role": "Communication design",
      "source_url": "https://www.vave.studio/project/stc-at-leap25/",
      "origin": "public"
    },
    {
      "name": "Gavin Wong",
      "role": "Project management",
      "source_url": "https://www.vave.studio/project/the-balancing/",
      "origin": "public"
    },
    {
      "name": "Zhao Boxuan",
      "role": "Schematic design",
      "source_url": "https://www.vave.studio/project/the-balancing/",
      "origin": "public"
    },
    {
      "name": "Wu Yue",
      "role": "Schematic design",
      "source_url": "https://www.vave.studio/project/the-balancing/",
      "origin": "public"
    },
    {
      "name": "Lydia Li",
      "role": "Schematic design",
      "source_url": "https://www.vave.studio/project/the-balancing/",
      "origin": "public"
    },
    {
      "name": "Guo Shuyao",
      "role": "Schematic design",
      "source_url": "https://www.vave.studio/project/the-balancing/",
      "origin": "public"
    },
    {
      "name": "Oly Wang",
      "role": "Communication design",
      "source_url": "https://www.vave.studio/project/the-balancing/",
      "origin": "public"
    },
    {
      "name": "Liu Shuo",
      "role": "Communication design",
      "source_url": "https://www.vave.studio/project/the-balancing/",
      "origin": "public"
    },
    {
      "name": "Elena Weber",
      "role": "Finance & Operations Lead",
      "studio": "Frankfurt",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Yun Qiao",
      "role": "Narrative Designer",
      "studio": "Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Mei Song",
      "role": "Spatial Designer",
      "studio": "Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Aisha Rahman",
      "role": "Senior Project Manager",
      "studio": "Dubai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Lina Wen",
      "role": "Exhibition Producer",
      "studio": "Imagination Shanghai",
      "kind": "freelancer",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Alex Ren",
      "role": "Technical Producer",
      "studio": "Imagination Shenzhen",
      "kind": "freelancer",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Maya Tan",
      "role": "Interaction Designer",
      "studio": "Digital Singapore",
      "kind": "freelancer",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Noah Li",
      "role": "Creative Technologist",
      "studio": "Digital Shanghai",
      "kind": "freelancer",
      "source_url": "",
      "origin": "fictional"
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
    "https://www.vave.studio/sha/hu-haijie-charles-lo-deliver-lectures-at-school-of-design-ecnu/"
  ],
  "fictional_projects": [
    {
      "code": "TIDE26",
      "name": "Tidal Futures Visitor Centre",
      "client": "Blue Current Foundation"
    },
    {
      "code": "MOVE26",
      "name": "Urban Motion Experience",
      "client": "Novara Mobility"
    },
    {
      "code": "THREAD26",
      "name": "Living Threads Pavilion",
      "client": "Loomline Culture Council"
    },
    {
      "code": "MAT27",
      "name": "Material Tomorrow Lab",
      "client": "Aster Materials"
    },
    {
      "code": "SIGNAL26",
      "name": "Signal Garden Installation",
      "client": "Lumina City Festival"
    }
  ]
};
