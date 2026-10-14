-- Additive enterprise-scale fictional scenario. Existing operational rows are never rewritten.
-- Historical v2 seed must retain its exact roster and portfolio.
alter function private.demo_manifest() rename to demo_manifest_v2;
alter function private.demo_upgrade_workspace(uuid) rename to demo_upgrade_workspace_v2;
revoke all on function private.demo_upgrade_workspace_v2(uuid) from public,anon,authenticated;
do $migration$
begin
 execute replace(pg_get_functiondef('private.demo_upgrade_workspace_v2(uuid)'::regprocedure),'private.demo_manifest()','private.demo_manifest_v2()');
 execute replace(pg_get_functiondef('private.demo_create_workspace_base(text,text,text,uuid)'::regprocedure),'private.demo_manifest()','private.demo_manifest_v2()');
end $migration$;
alter table public.workspace_demos drop constraint workspace_demos_experience_version_check;
alter table public.workspace_demos add constraint workspace_demos_experience_version_check check(experience_version in (1,2,3));
create function private.demo_manifest() returns jsonb language sql immutable set search_path='' as $function$
 select $manifest${
  "version": "vave-enterprise-2026-10-14.3",
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
    },
    {
      "name": "Elena Fischer",
      "role": "Senior Experience Designer",
      "studio": "Frankfurt",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Jonas Weber",
      "role": "Project Director",
      "studio": "Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Amira Keller",
      "role": "Spatial Designer",
      "studio": "Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Felix Brandt",
      "role": "Creative Technologist",
      "studio": "Dubai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Clara Weiss",
      "role": "Content Strategist",
      "studio": "Imagination Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Leon Richter",
      "role": "Design Producer",
      "studio": "Imagination Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Sofia Hartmann",
      "role": "Motion Designer",
      "studio": "Digital Singapore",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "David Sommer",
      "role": "Technical Director",
      "studio": "Digital Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Mira Vogel",
      "role": "Interaction Designer",
      "studio": "Frankfurt",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Nico Baumann",
      "role": "Account Director",
      "studio": "Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Lena Hoffmann",
      "role": "Experience Researcher",
      "studio": "Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Oliver Beck",
      "role": "Senior Experience Designer",
      "studio": "Dubai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Yuna Mori",
      "role": "Project Director",
      "studio": "Imagination Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Mei Han",
      "role": "Spatial Designer",
      "studio": "Imagination Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Kai Wu",
      "role": "Creative Technologist",
      "studio": "Digital Singapore",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Jun Qiao",
      "role": "Content Strategist",
      "studio": "Digital Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Anya Zhou",
      "role": "Design Producer",
      "studio": "Frankfurt",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Rui Zhao",
      "role": "Motion Designer",
      "studio": "Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Yue Chen",
      "role": "Technical Director",
      "studio": "Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Bo Liang",
      "role": "Interaction Designer",
      "studio": "Dubai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Lin Huang",
      "role": "Account Director",
      "studio": "Imagination Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Tao Xu",
      "role": "Experience Researcher",
      "studio": "Imagination Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Nina Gu",
      "role": "Senior Experience Designer",
      "studio": "Digital Singapore",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Iris Fang",
      "role": "Project Director",
      "studio": "Digital Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Zhen Lu",
      "role": "Spatial Designer",
      "studio": "Frankfurt",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Kira Sun",
      "role": "Creative Technologist",
      "studio": "Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Aaron Zheng",
      "role": "Content Strategist",
      "studio": "Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Eva Jiang",
      "role": "Design Producer",
      "studio": "Dubai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Sean He",
      "role": "Motion Designer",
      "studio": "Imagination Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Vera Song",
      "role": "Technical Director",
      "studio": "Imagination Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Leila Haddad",
      "role": "Interaction Designer",
      "studio": "Digital Singapore",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Omar Faris",
      "role": "Account Director",
      "studio": "Digital Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Nadia Karim",
      "role": "Experience Researcher",
      "studio": "Frankfurt",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Samir Nasser",
      "role": "Senior Experience Designer",
      "studio": "Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Rana Mansour",
      "role": "Project Director",
      "studio": "Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Yasmin Saleh",
      "role": "Spatial Designer",
      "studio": "Dubai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Tariq Amin",
      "role": "Creative Technologist",
      "studio": "Imagination Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Dalia Noor",
      "role": "Content Strategist",
      "studio": "Imagination Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Zara Malik",
      "role": "Design Producer",
      "studio": "Digital Singapore",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Amal Darwish",
      "role": "Motion Designer",
      "studio": "Digital Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Priya Menon",
      "role": "Technical Director",
      "studio": "Frankfurt",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Arjun Rao",
      "role": "Interaction Designer",
      "studio": "Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Neha Kapoor",
      "role": "Account Director",
      "studio": "Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Rohan Das",
      "role": "Experience Researcher",
      "studio": "Dubai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Anika Shah",
      "role": "Senior Experience Designer",
      "studio": "Imagination Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Dev Patel",
      "role": "Project Director",
      "studio": "Imagination Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Sara Lim",
      "role": "Spatial Designer",
      "studio": "Digital Singapore",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Ethan Goh",
      "role": "Creative Technologist",
      "studio": "Digital Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Chloe Teo",
      "role": "Content Strategist",
      "studio": "Frankfurt",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Lucas Ong",
      "role": "Design Producer",
      "studio": "Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Hana Park",
      "role": "Motion Designer",
      "studio": "Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Daniel Kwon",
      "role": "Technical Director",
      "studio": "Dubai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Sora Kim",
      "role": "Interaction Designer",
      "studio": "Imagination Shanghai",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Jules Martin",
      "role": "Account Director",
      "studio": "Imagination Shenzhen",
      "kind": "employee",
      "source_url": "",
      "origin": "fictional"
    },
    {
      "name": "Camille Laurent",
      "role": "Experience Researcher",
      "studio": "Digital Singapore",
      "kind": "employee",
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
    },
    {
      "code": "NOVA26",
      "name": "Life Science Discovery Network — fictional demo",
      "client": "Sinovac Life Sciences"
    },
    {
      "code": "CULT26",
      "name": "Cultural Futures World Tour — fictional demo",
      "client": "Dubai Culture Arts Authority"
    },
    {
      "code": "LEAP27",
      "name": "Connected Cities Global Showcase — fictional demo",
      "client": "stc"
    },
    {
      "code": "BLN26",
      "name": "Next Retail Experience Network — fictional demo",
      "client": "Bailian Group"
    },
    {
      "code": "ACC26",
      "name": "Applied Intelligence Visitor Campus — fictional demo",
      "client": "Accenture"
    },
    {
      "code": "SAP27",
      "name": "Industrial Futures Experience Platform — fictional demo",
      "client": "SAP"
    },
    {
      "code": "POR27",
      "name": "Electric Performance Global Experience — fictional demo",
      "client": "Porsche AG"
    },
    {
      "code": "RAIL27",
      "name": "Regional Mobility Discovery Network — fictional demo",
      "client": "DB Regio"
    },
    {
      "code": "HORIZ26",
      "name": "Global Energy Experience Centres — fictional demo",
      "client": "Horizon Grid Group (fictional)"
    },
    {
      "code": "AERO26",
      "name": "Future Flight Brand World — fictional demo",
      "client": "Aurelia Aerospace (fictional)"
    },
    {
      "code": "HELIX26",
      "name": "Connected Health Discovery Campus — fictional demo",
      "client": "Helix Meridian Group (fictional)"
    },
    {
      "code": "TERRA27",
      "name": "Circular Materials Global Pavilion — fictional demo",
      "client": "TerraNova Industries (fictional)"
    }
  ]
}$manifest$::jsonb
$function$;
revoke all on function private.demo_manifest() from public,anon,authenticated;

-- Extend only the existing transaction-bound, creator/owner capability to v2.
create or replace function private.demo_can_seed_entry(p_workspace_id uuid,p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.demo_seed_context c join public.workspace_demos d using(workspace_id)
 join public.memberships m on m.workspace_id=c.workspace_id and m.user_id=p_user_id
 where c.workspace_id=p_workspace_id and c.actor=auth.uid() and c.transaction_id=txid_current()
 and d.created_by=c.actor and d.archived_at is null and d.experience_version in (1,2)
 and (m.is_demo or m.user_id=c.actor) and private.current_role(c.workspace_id)='owner')
$$;

create function private.demo_upgrade_workspace(p_workspace_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=private.require_user(); w public.workspaces; d public.workspace_demos; manifest jsonb:=private.demo_manifest();
 person jsonb; project jsonb; member_row record; v_person uuid; v_project uuid; v_client uuid; v_code text;
 employees uuid[]; freelancers uuid[]; project_ids uuid[]:='{}'; client_ids uuid[]:='{}';
 i integer:=0; j integer; k integer; employee_cursor integer:=1; team_size integer; employee_minutes integer; minutes_left integer; day date;
 today date; week date; month_start date; year_start date; issued date; due date; residual integer;
 hours integer[]:=array[8500,10000,12000,9000,14000,11000,10000,13000,8500,12000,10500,11500];
 fees bigint[]:=array[145000000,170000000,210000000,155000000,250000000,190000000,170000000,230000000,145000000,210000000,180000000,200000000];
 plan_lines jsonb; doc jsonb; labels jsonb; notice text;
begin
 perform private.lock_user(actor);
 select * into w from public.workspaces where id=p_workspace_id for update;
 select * into d from public.workspace_demos where workspace_id=p_workspace_id for update;
 perform private.require_user();
 if d.workspace_id is null or d.created_by is distinct from actor or w.created_by is distinct from actor
 or d.archived_at is not null or private.current_role(p_workspace_id) is distinct from 'owner' then raise exception 'DEMO_FORBIDDEN' using errcode='42501'; end if;
 if d.experience_version>=3 then return; end if;
 if d.experience_version=1 then perform private.demo_upgrade_workspace_v2(p_workspace_id); end if;
 insert into private.demo_seed_context values(p_workspace_id,actor,txid_current());
 today:=(now() at time zone w.timezone)::date; week:=date_trunc('week',today)::date;
 month_start:=date_trunc('month',today)::date;year_start:=date_trunc('year',today)::date;
 notice:=private.demo_invoice_notice(d.locale);
 labels:=case d.locale
 when 'de' then jsonb_build_object('time','Fiktive Demozeit — internationale Kundenprojekte','plan','Demo: fiktive Jahresplanung','expense','Demo: Fertigung, Technikmiete und Logistik — keine Arbeitskosten','invoice','Demo: fiktiver Projektmeilenstein','address','Demostraße 10, 00000 Beispielstadt — fiktive Adresse','cancel','Demo: fiktive Meilensteinkorrektur','studio','Demo-Zuordnung: ')
 when 'zh' then jsonb_build_object('time','虚构演示工时 — 国际客户项目','plan','演示：虚构年度计划','expense','演示：制作、设备租赁与物流 — 不含人工成本','invoice','演示：虚构项目里程碑','address','虚构地址：示例市演示路10号，00000','cancel','演示：虚构里程碑更正','studio','虚构演示分配：')
 else jsonb_build_object('time','Fictional demo time — international client delivery','plan','Demo: fictional annual delivery plan','expense','Demo: fabrication, equipment rental and logistics — excludes labor','invoice','Demo: fictional project milestone','address','10 Example Lane, 00000 Sample City — fictional address','cancel','Demo: fictional milestone correction','studio','Fictional demo assignment: ') end;
 -- Appended people are always fictional. No auth users, invitations or login grants.
 for person in select value from jsonb_array_elements(manifest->'people') with ordinality p(value,n) where n>57 loop
  i:=i+1;v_person:=gen_random_uuid();
  insert into public.memberships(workspace_id,user_id,role,display_name,email,is_demo,demo_title,demo_studio,demo_origin)
  values(p_workspace_id,v_person,case when i%11=0 then 'manager' else 'member' end,person->>'name','enterprise-demo-'||i||'@example.invalid',true,person->>'role',labels->>'studio'||(person->>'studio'),'fictional');
  insert into public.finance_staff_rates(workspace_id,user_id,kind,effective_from,cost_rate_minor,bill_rate_minor)
  values(p_workspace_id,v_person,'employee',week-70,6000+(i%7)*500,15000+(i%7)*1000);
 end loop;
 -- The historical roster keeps its configured roles/rates. Planning capacity uses
 -- original demo kinds, so owner edits to cost rates do not break the upgrade.
 select array_agg(m.user_id order by m.email) into employees from public.memberships m
 where m.workspace_id=p_workspace_id and m.is_demo and (
 m.email like 'enterprise-demo-%@example.invalid' or exists(
 select 1 from jsonb_array_elements(private.demo_manifest_v2()->'people') with ordinality p(value,n)
 where m.email='demo-'||n||'@example.invalid' and coalesce(value->>'kind',case when n%6=0 then 'freelancer' else 'employee' end)='employee'));
 select array_agg(m.user_id order by m.email) into freelancers from public.memberships m
 where m.workspace_id=p_workspace_id and m.is_demo and exists(
 select 1 from jsonb_array_elements(private.demo_manifest_v2()->'people') with ordinality p(value,n)
 where m.email='demo-'||n||'@example.invalid' and coalesce(value->>'kind',case when n%6=0 then 'freelancer' else 'employee' end)='freelancer');
 i:=0;
 for project in select value from jsonb_array_elements(manifest->'fictional_projects') with ordinality p(value,n) where n>5 loop
  i:=i+1;v_code:=project->>'code';
  if exists(select 1 from public.projects where workspace_id=p_workspace_id and code=v_code) then v_code:=left(v_code,14)||'-'||left(gen_random_uuid()::text,8);end if;
  insert into public.finance_clients(workspace_id,name,billing_address,contact_email,tax_id,language)
  values(p_workspace_id,project->>'client',labels->>'address','enterprise-billing-'||i||'@example.invalid','DEMO-NOT-VALID',d.locale) returning id into v_client;
  insert into public.projects(workspace_id,code,name,client,budget_minutes,status,color)
  values(p_workspace_id,v_code,project->>'name',project->>'client',hours[i]*60,'active',(array['#641dff','#3056d3','#087f8c','#aa3d82','#b8581b','#236f59'])[1+((i-1)%6)]) returning id into v_project;
  project_ids:=array_append(project_ids,v_project);client_ids:=array_append(client_ids,v_client);
  -- 100 employees split into 12 teams, plus one freelancer per commission.
  -- 90% employee / 10% freelancer hours; €80/€90 cost, €150–210 sell rates.
  team_size:=case when i<=4 then 9 else 8 end;employee_minutes:=hours[i]*54;minutes_left:=employee_minutes;plan_lines:='[]';
  for j in 1..team_size loop
   k:=case when j=team_size then minutes_left else employee_minutes/team_size end;minutes_left:=minutes_left-k;
   plan_lines:=plan_lines||jsonb_build_array(jsonb_build_object('label',labels->>'plan','kind','employee','user_id',employees[employee_cursor],
    'planned_minutes',k,'cost_rate_minor',8000,'bill_rate_minor',15000+(j%7)*1000));
   employee_cursor:=employee_cursor+1;
  end loop;
  plan_lines:=plan_lines||jsonb_build_array(jsonb_build_object('label',labels->>'plan','kind','freelancer','user_id',freelancers[i],
   'planned_minutes',hours[i]*6,'cost_rate_minor',9000,'bill_rate_minor',20000));
  insert into public.finance_project_plans(workspace_id,project_id,client_id,billing_mode,default_bill_rate_minor,fixed_fee_minor,planned_expenses_minor,lines)
  values(p_workspace_id,v_project,v_client,'fixed',18000,fees[i],fees[i]/4,plan_lines);
  for j in 0..2 loop
   insert into public.tasks(workspace_id,project_id,title,status,assignee_id,due_date,created_by)
   values(p_workspace_id,v_project,manifest->'phases'->j->>d.locale,(array['done','doing','todo'])[j+1],employees[1+((i*7+j)%array_length(employees,1))],week+(j-1)*14,actor);
   insert into public.finance_expenses(workspace_id,project_id,expense_date,description,amount_minor,category,not_time_costed)
   values(p_workspace_id,v_project,today-7-j*9,labels->>'expense',fees[i]/40,'external',true);
  end loop;
  -- Milestone invoices total 70% of the fictional annual plan (20% paid (current and prior months),
  -- 20% open/overdue, 30% draft). A separate 5% issue/cancellation nets to zero.
  for j in 1..3 loop
   issued:=case when j=1 then case when i%2=0 then least(today,month_start+3) else greatest(year_start,month_start-45) end when j=2 then case when i%3=0 then today-45 else greatest(month_start,today-7) end else today end;
   due:=case when j=2 and i%3=0 then today-15 else greatest(issued+30,today+14) end;
   doc:=public.finance_save_draft(jsonb_build_object('workspace_id',p_workspace_id,'client_id',v_client,'project_id',v_project,'language',d.locale,
    'issue_date',issued,'due_date',due,'service_from',greatest(year_start,issued-30),'service_to',greatest(year_start,issued),
    'notes',manifest->'disclosure'->>d.locale,'payment_instructions',notice,
    'lines',jsonb_build_array(jsonb_build_object('description',labels->>'invoice','quantity',1,'unit_price_minor',fees[i]*case when j=3 then 3 else 2 end/10,'tax_basis_points',1900,'zero_tax_reason','','time_entry_id',null))));
   if j<3 then doc:=public.finance_issue_invoice(p_workspace_id,(doc->>'id')::uuid);end if;
   if j=1 then perform public.finance_set_paid(p_workspace_id,(doc->>'id')::uuid,true);end if;
  end loop;
  if i=12 then
   doc:=public.finance_save_draft(jsonb_build_object('workspace_id',p_workspace_id,'client_id',v_client,'project_id',v_project,'language',d.locale,'issue_date',today-3,'due_date',today+27,'service_from',today-30,'service_to',today-3,
    'notes',manifest->'disclosure'->>d.locale,'payment_instructions',notice,'lines',jsonb_build_array(jsonb_build_object('description',labels->>'invoice','quantity',1,'unit_price_minor',fees[i]/20,'tax_basis_points',1900,'zero_tax_reason','','time_entry_id',null))));
   doc:=public.finance_issue_invoice(p_workspace_id,(doc->>'id')::uuid);perform public.finance_cancel_invoice(p_workspace_id,(doc->>'id')::uuid,labels->>'cancel');
  end if;
 end loop;
 -- Six calendar weeks contain 30 weekdays. Existing user/demo time is retained;
 -- insert only residual minutes to reach 7.5 hours, never exceed 8 hours/day.
 i:=0;
 for member_row in select user_id from public.memberships where workspace_id=p_workspace_id and is_demo order by email loop
  i:=i+1;
  select p.project_id into v_project from public.finance_project_plans p
  where p.workspace_id=p_workspace_id and p.project_id=any(project_ids)
  and exists(select 1 from jsonb_array_elements(p.lines) l where l->>'user_id'=member_row.user_id::text)
  limit 1;
  -- Edited legacy identities may no longer match the historical manifest;
  -- they still receive history without rewriting their membership or rates.
  v_project:=coalesce(v_project,project_ids[1+((i-1)%12)]);
  for j in 0..41 loop
   day:=today-j;
   if extract(isodow from day)>5 then continue;end if;
   select greatest(0,450-coalesce(sum(minutes),0))::integer into residual from public.time_entries where workspace_id=p_workspace_id and user_id=member_row.user_id and work_date=day;
   if residual=0 then continue;end if;
   insert into public.time_entries(workspace_id,project_id,user_id,work_date,minutes,note,billable,status)
   values(p_workspace_id,v_project,member_row.user_id,day,residual,labels->>'time',(i+j)%10<>0,
    case when day<week-7 then 'approved' when day<week then 'submitted' else (array['draft','submitted','approved'])[1+((i+j)%3)] end);
  end loop;
 end loop;
 delete from private.demo_seed_context where workspace_id=p_workspace_id;
 update public.workspace_demos set experience_version=3,manifest=private.demo_manifest(),manifest_version=private.demo_manifest()->>'version' where workspace_id=p_workspace_id;
 perform private.audit(p_workspace_id,'demo_upgrade','workspace',p_workspace_id,jsonb_build_object('experience_version',3,'fictional_operations',true));
end $$;
create or replace function public.demo_upgrade_workspace(p_workspace_id uuid) returns void language sql volatile security invoker set search_path='' as $$
 select private.demo_upgrade_workspace(p_workspace_id)
$$;
create or replace function private.demo_create_workspace(p_name text,p_timezone text,p_locale text,p_request_id uuid) returns public.workspaces
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user();existed boolean;w public.workspaces;
begin
 perform private.lock_user(actor);
 select exists(select 1 from public.workspace_demos where created_by=actor and request_id=p_request_id) into existed;
 select * into w from private.demo_create_workspace_base(p_name,p_timezone,p_locale,p_request_id);
 if not existed then
  -- New-only v1 drafts retain weekday spacing, even when created on Monday.
  update public.time_entries set work_date=work_date-7 where workspace_id=w.id and work_date>(now() at time zone w.timezone)::date;
  perform private.demo_upgrade_workspace(w.id);
 end if;
 return w;
end $$;
revoke all on function private.demo_upgrade_workspace(uuid),public.demo_upgrade_workspace(uuid),private.demo_upgrade_workspace_v2(uuid),private.demo_manifest_v2() from public,anon,authenticated;
grant execute on function private.demo_upgrade_workspace(uuid),public.demo_upgrade_workspace(uuid) to authenticated;
