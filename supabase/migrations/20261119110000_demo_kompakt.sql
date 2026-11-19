-- Kompakte Beispieldaten (19.11.2026).
--
-- Die bisherige Demo wuchs über sechs Aufbaustufen auf 112 Personen, 25 Projekte und knapp
-- 6.000 Zeiteinträge – zu viel, um das Tool in fünf Minuten zu erklären. Neue Demos entstehen
-- jetzt in einem Schritt als kleiner, durchdachter Satz: 7 Personen, 5 Projekte, 16 Aufgaben,
-- gut vier Wochen Zeiten, ein Kapazitätsplan mit einer überbuchten Person und einer offenen
-- Stelle, drei Rechnungen. Alles fiktiv.
--
-- Bestehende Demos bleiben unangetastet. Wer umstellen will, lädt die Beispieldaten neu
-- (public.demo_reset_workspace): Das ersetzt den Inhalt des Demo-Workspace, behält aber
-- Workspace, echte Mitglieder und Einladungen.

alter table public.workspace_demos drop constraint workspace_demos_experience_version_check;
alter table public.workspace_demos add constraint workspace_demos_experience_version_check check(experience_version in (1,2,3,4,5,6));

-- Zeiten der Beispielpersonen dürfen auch in der kompakten Demo (Stufe 6) angelegt werden.
do $patch$
declare def text:=pg_get_functiondef('private.demo_can_seed_entry(uuid,uuid)'::regprocedure);
begin
  if position('d.experience_version in (1,2,5)' in def)=0 then raise exception 'demo_can_seed_entry: unerwartete Fassung'; end if;
  execute replace(def,'d.experience_version in (1,2,5)','d.experience_version in (1,2,5,6)');
end $patch$;
-- Die kompakte Demo bringt ihren Kapazitätsplan selbst mit; der Zufallsplan der großen Demo bleibt aus.
do $patch$
declare def text:=pg_get_functiondef('private.demo_seed_capacity(uuid,date)'::regprocedure); anchor text:='  if loc is null then return 0; end if;';
begin
  if position(anchor in def)=0 then raise exception 'demo_seed_capacity: unerwartete Fassung'; end if;
  execute replace(def,anchor,anchor||E'\n  if (select experience_version from public.workspace_demos where workspace_id=p_workspace_id)>=6 then return 0; end if;');
end $patch$;

-- Abwesenheiten bringt die kompakte Demo gezielt mit; die Zufallsverteilung der großen Demo bleibt aus.
do $patch$
declare def text:=pg_get_functiondef('private.demo_refresh_workspace(uuid)'::regprocedure); anchor text:='    if exists(select 1 from public.absences a where a.workspace_id=p_workspace_id and a.user_id=m.user_id';
begin
  if position(anchor in def)=0 then raise exception 'demo_refresh_workspace: unerwartete Fassung'; end if;
  execute replace(def,anchor,'    if d.experience_version>=6 or exists(select 1 from public.absences a where a.workspace_id=p_workspace_id and a.user_id=m.user_id');
end $patch$;

create function private.demo_manifest_compact() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('version','vave-compact-2026-11-19.1','compact',true,
    'disclosure',jsonb_build_object(
      'en','All people, clients, projects, time and financial details in this sample are fictional. DEMO — DO NOT PAY.',
      'de','Alle Personen, Kunden, Projekte, Zeiten und Finanzangaben in diesem Beispiel sind fiktiv. DEMO — NICHT BEZAHLEN.',
      'zh','本示例中的所有人员、客户、项目、工时和财务信息均为虚构。DEMO — 演示文件，请勿付款。'),
    'counts',jsonb_build_object('people',7,'projects',5,'tasks',16))
$$;
revoke all on function private.demo_manifest_compact() from public,anon,authenticated;

-- Baut den kompakten Satz in einen leeren Demo-Workspace. Aufrufer prüfen die Berechtigung.
create function private.demo_seed_compact(p_workspace_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.require_user(); w public.workspaces; d public.workspace_demos;
  today date; week date; loc text; L jsonb; notice text;
  people uuid[] := '{}'; projects uuid[] := '{}'; clients uuid[] := '{}'; types uuid[] := '{}';
  names text[] := array['Mara Lindqvist','Jonas Brecht','Aiko Tanaka','Leon Hartmann','Sofia Marini','Tobias Keller','Nora Feld'];
  titles text[]; type_names text[]; project_names text[]; client_names text[]; tagset text[]; phase_names jsonb; task_titles text[];
  -- Hauptprojekt je Person und Wochentag (Mo–Fr): Wer woran arbeitet, bleibt über die Wochen gleich.
  focus integer[] := array[1,1,1,3,4, 1,2,1,2,5, 1,1,1,1,4, 1,1,1,2,4, 2,2,2,2,2, 2,2,2,3,3, 3,3,3,3,3];
  sched jsonb; i integer; j integer; k integer; pid uuid; v uuid; day date; dow integer; target integer; doc jsonb; r record;
begin
  select * into w from public.workspaces where id=p_workspace_id;
  select * into d from public.workspace_demos where workspace_id=p_workspace_id;
  if w.id is null or d.workspace_id is null then raise exception 'DEMO_FORBIDDEN' using errcode='42501'; end if;
  loc := d.locale; today := (now() at time zone w.timezone)::date; week := date_trunc('week',today)::date;
  notice := private.demo_invoice_notice(loc);
  insert into private.demo_seed_context values(p_workspace_id,actor,txid_current())
  on conflict (workspace_id) do update set actor=excluded.actor,transaction_id=excluded.transaction_id;

  titles := array['Creative Direction','Project Management','3D Design','Concept','2D Design','Motion Design','3D Design'];
  if loc='de' then
    titles[2] := 'Projektmanagement'; titles[4] := 'Konzept';
    type_names := array['PM','CD','Konzept','3D','2D','Motion'];
    project_names := array['Nordlicht Pavillon','Aurora Showroom','Museumsnacht','Pitch Helios','Studio intern'];
    client_names := array['Nordlicht Energie','Aurora Mobility','Stadtmuseum Beispielstadt','Helios Tech'];
    tagset := array['konzept','design','3d','motion','produktion','strategie'];
    phase_names := '{"discovery":"Discovery","concept":"Konzept","design":"Entwurf","production":"Produktionsbegleitung","pitch":"Pitch"}';
    task_titles := array['Briefing und Zieldefinition','Raumkonzept ausarbeiten','3D-Modell Pavillon','Konzeptpräsentation','Materialmuster abstimmen',
      'Moodboard und Storyline','Grafiksystem Showroom','Animation Markenfilm','Freigabe Entwurf',
      'Exponat-Inszenierung in 3D','Lichtstimmung testen','Aufbauplan abstimmen','Eröffnung',
      'Pitch-Idee skizzieren','Pitch-Deck gestalten','Wochenplanung'];
    L := jsonb_build_object('studio','Studio Frankfurt','time','Fiktive Demozeit','address','Demostraße 10, 00000 Beispielstadt — fiktive Adresse',
      'company','VAVE Demo Studio — fiktives Unternehmen','expense1','Demo: Modellbau und Materialmuster','expense2','Demo: Lizenzen für Bildmaterial','expense3','Demo: Leihtechnik für Lichttest',
      'invoice1','Demo: Konzeptphase, 1. Abschlag','invoice2','Demo: Entwurfsphase, Abschlag','invoice3','Demo: Entwurf Ausstellung','plan','Demo: geplante Projektarbeit','open','Freelancer gesucht');
  elsif loc='zh' then
    titles := array['创意总监','项目管理','3D 设计','概念','2D 设计','动效设计','3D 设计'];
    type_names := array['项目管理','创意总监','概念','3D','2D','动效'];
    project_names := array['北极光展馆','极光展厅','博物馆之夜','赫利俄斯比稿','工作室内部'];
    client_names := array['北极光能源','极光出行','示例市博物馆','赫利俄斯科技'];
    tagset := array['概念','设计','3d','动效','制作','策略'];
    phase_names := '{"discovery":"需求探索","concept":"概念设计","design":"方案设计","production":"制作监理","pitch":"比稿"}';
    task_titles := array['需求梳理与目标定义','空间概念深化','展馆 3D 模型','概念汇报','材料样品确认',
      '情绪板与故事线','展厅图形系统','品牌影片动效','方案确认',
      '展品 3D 呈现','灯光氛围测试','搭建计划确认','开幕',
      '比稿创意草图','比稿文件设计','每周计划'];
    L := jsonb_build_object('studio','法兰克福工作室','time','虚构演示工时','address','虚构地址：示例市演示路10号，00000',
      'company','VAVE 演示工作室 — 虚构企业','expense1','演示：模型制作与材料样品','expense2','演示：图片素材授权','expense3','演示：灯光测试设备租赁',
      'invoice1','演示：概念阶段首期款','invoice2','演示：方案阶段进度款','invoice3','演示：展览方案设计','plan','演示：计划项目工作','open','招募自由职业者');
  else
    type_names := array['PM','CD','Concept','3D','2D','Motion'];
    project_names := array['Nordlicht Pavilion','Aurora Showroom','Museum Night','Pitch Helios','Studio internal'];
    client_names := array['Nordlicht Energy','Aurora Mobility','Sample City Museum','Helios Tech'];
    tagset := array['concept','design','3d','motion','production','strategy'];
    phase_names := '{"discovery":"Discovery","concept":"Concept design","design":"Schematic design","production":"Production supervision","pitch":"Pitch"}';
    task_titles := array['Briefing and goals','Develop the spatial concept','3D model of the pavilion','Concept presentation','Agree material samples',
      'Moodboard and storyline','Showroom graphic system','Brand film animation','Design sign-off',
      'Exhibit staging in 3D','Test the lighting mood','Agree the build plan','Opening',
      'Sketch the pitch idea','Design the pitch deck','Weekly planning'];
    L := jsonb_build_object('studio','Studio Frankfurt','time','Fictional demo time','address','10 Example Lane, 00000 Sample City — fictional address',
      'company','VAVE Demo Studio — fictional company','expense1','Demo: model making and material samples','expense2','Demo: image licences','expense3','Demo: rented equipment for the lighting test',
      'invoice1','Demo: concept phase, first instalment','invoice2','Demo: design phase, instalment','invoice3','Demo: exhibition design','plan','Demo: planned project work','open','Freelancer wanted');
  end if;

  -- 1. Sieben Beispielpersonen: fünf in Vollzeit, eine mit 32 und eine mit 24 Stunden. Keine Anmeldung, keine Einladung.
  for i in 1..7 loop
    v := gen_random_uuid(); people := array_append(people,v);
    sched := case i when 5 then '[480,480,480,480,0,0,0]'::jsonb when 7 then '[480,480,480,0,0,0,0]'::jsonb else '[480,480,480,480,480,0,0]'::jsonb end;
    insert into public.memberships(workspace_id,user_id,role,display_name,email,is_demo,demo_title,demo_studio,demo_origin,work_schedule,weekly_capacity_minutes,location,vacation_days_per_year)
    values(p_workspace_id,v,case when i<=2 then 'manager' else 'member' end,names[i],'demo-'||i||'@example.invalid',true,titles[i],L->>'studio','fictional',
      sched,(select sum((e::text)::integer) from jsonb_array_elements(sched) e),'DE-HE',30);
    insert into public.finance_staff_rates(workspace_id,user_id,kind,effective_from,cost_rate_minor,bill_rate_minor)
    values(p_workspace_id,v,'employee',week-70,4500+(i%4)*500,10500+(i%4)*1000);
  end loop;
  if not exists(select 1 from public.finance_staff_rates where workspace_id=p_workspace_id and user_id=actor) then
    insert into public.finance_staff_rates(workspace_id,user_id,kind,effective_from,cost_rate_minor,bill_rate_minor) values(p_workspace_id,actor,'employee',week-70,6500,12500);
  end if;

  -- 2. Leistungsarten.
  for i in 1..6 loop
    insert into public.service_types(workspace_id,name,position) values(p_workspace_id,type_names[i],i)
    on conflict (workspace_id,lower(btrim(name))) do update set position=excluded.position returning id into v;
    types := array_append(types,v);
  end loop;

  -- 3. Vier Kunden und fünf Projekte: Festpreis, nach Aufwand, ein Pitch und interne Arbeit (beide nicht abrechenbar).
  for i in 1..4 loop
    insert into public.finance_clients(workspace_id,name,billing_address,contact_email,tax_id,language)
    values(p_workspace_id,client_names[i],L->>'address','billing-'||i||'@example.invalid','DEMO-NOT-VALID',loc) returning id into v;
    clients := array_append(clients,v);
  end loop;
  for i in 1..5 loop
    insert into public.projects(workspace_id,code,name,client,budget_minutes,status,color,due_date,billable_default,tags)
    values(p_workspace_id,(array['NLP-01','AUR-02','MUS-03','PIT-04','INT-05'])[i],project_names[i],coalesce(client_names[i],''),
      (array[36000,24000,14400,4800,0])[i],'active',(array['#641dff','#087f8c','#aa3d82','#b8581b','#555b75'])[i],
      case i when 1 then week+69 when 2 then week+41 when 3 then week+20 when 4 then week+13 end,i<=3,
      case i when 1 then array[tagset[1],tagset[3]] when 2 then array[tagset[2],tagset[4]] when 3 then array[tagset[3]] when 4 then array[tagset[6]] else '{}'::text[] end)
    returning id into pid;
    projects := array_append(projects,pid);
    insert into public.finance_project_plans(workspace_id,project_id,client_id,billing_mode,default_bill_rate_minor,fixed_fee_minor,planned_expenses_minor,lines)
    values(p_workspace_id,pid,clients[i],case when i in (1,3) then 'fixed' when i=2 then 'hourly' else 'internal' end,12500,
      case i when 1 then 6600000 when 3 then 2800000 else 0 end,case when i<=3 then 150000 else 0 end,
      case when i<=3 then jsonb_build_array(
        jsonb_build_object('label',L->>'plan','kind','employee','user_id',people[i+1],'planned_minutes',(array[14400,9600,6000])[i],'cost_rate_minor',5000,'bill_rate_minor',11500),
        jsonb_build_object('label',L->>'plan','kind','employee','user_id',people[i+2],'planned_minutes',(array[18000,12000,7200])[i],'cost_rate_minor',5500,'bill_rate_minor',12500))
      else '[]'::jsonb end);
  end loop;
  insert into public.finance_expenses(workspace_id,project_id,expense_date,description,amount_minor,category,not_time_costed) values
    (p_workspace_id,projects[1],today-12,L->>'expense1',185000,'external',true),
    (p_workspace_id,projects[2],today-6,L->>'expense2',64000,'other',true),
    (p_workspace_id,projects[3],today-3,L->>'expense3',42000,'external',true);

  -- 4. Phasen: Jedes Projekt steht heute an einer anderen Stelle.
  insert into public.project_phases(workspace_id,project_id,name,position,starts_on,ends_on,budget_minutes) values
    (p_workspace_id,projects[1],phase_names->>'discovery',1,week-42,week-22,3600),
    (p_workspace_id,projects[1],phase_names->>'concept',2,week-21,week+13,12600),
    (p_workspace_id,projects[1],phase_names->>'design',3,week+14,week+41,10800),
    (p_workspace_id,projects[1],phase_names->>'production',4,week+42,week+69,9000),
    (p_workspace_id,projects[2],phase_names->>'concept',1,week-28,week-1,7200),
    (p_workspace_id,projects[2],phase_names->>'design',2,week,week+27,10800),
    (p_workspace_id,projects[2],phase_names->>'production',3,week+28,week+41,6000),
    (p_workspace_id,projects[3],phase_names->>'design',1,week-21,week+6,8400),
    (p_workspace_id,projects[3],phase_names->>'production',2,week+7,week+20,6000),
    (p_workspace_id,projects[4],phase_names->>'pitch',1,week-7,week+13,4800);

  -- 5. Sechzehn Aufgaben: erledigt, in Arbeit, offen – mit Meilensteinen, einer überfälligen, einer ohne Person
  --    und einer wöchentlich wiederkehrenden.
  for r in select * from (values
      (1,1,'done',2,-30,960,false,6),(2,1,'doing',4,9,3600,false,1),(3,1,'doing',3,11,4800,false,3),(4,1,'todo',1,11,480,true,1),(5,1,'todo',0,18,720,false,5),
      (6,2,'done',5,-10,1440,false,2),(7,2,'doing',5,4,3000,false,2),(8,2,'todo',6,16,2400,false,4),(9,2,'todo',2,25,240,true,2),
      (10,3,'doing',7,2,1800,false,3),(11,3,'todo',6,-3,600,false,5),(12,3,'todo',-1,5,360,false,5),(13,3,'todo',1,20,null,true,5),
      (14,4,'doing',4,3,1200,false,6),(15,4,'todo',3,10,1440,false,2),(16,5,'todo',2,4,120,false,6)
    ) t(n,project,status,person,due,estimate,milestone,tag) order by n loop
    insert into public.tasks(workspace_id,project_id,title,status,assignee_id,due_date,estimated_minutes,is_milestone,repeat,tags,created_by)
    values(p_workspace_id,projects[r.project],task_titles[r.n],r.status,case when r.person>0 then people[r.person] when r.person<0 then actor end,week+r.due,r.estimate,r.milestone,
      case when r.n=16 then 'weekly' else '' end,array[tagset[r.tag]],actor);
  end loop;

  -- 6. Kapazitätsplan: je Projekt die Rollen mit Stunden je Woche. Aiko ist drei Wochen überbucht,
  --    eine 3D-Stelle im Pavillon ist noch offen, die angemeldete Person plant die Museumsnacht mit.
  for r in select * from (values
      (1,2,1,480,0,0),(1,1,2,480,0,0),(1,3,4,1440,0,0),(1,4,3,960,0,0),(1,0,4,960,14,41),
      (2,2,1,480,0,0),(2,5,5,1440,0,0),(2,6,6,960,0,0),(2,4,3,480,0,0),
      (3,1,2,480,0,0),(3,7,4,960,0,0),(3,6,6,960,0,0),(3,3,4,480,0,14),(3,-1,1,360,0,0),
      (4,1,2,240,0,0),(4,4,3,720,0,0),(4,3,4,720,0,0)
    ) t(project,person,type,minutes,from_day,to_day) loop
    insert into public.capacity_rows(workspace_id,project_id,user_id,service_type_id,offered_minutes,note,position)
    values(p_workspace_id,projects[r.project],case when r.person>0 then people[r.person] when r.person<0 then actor end,types[r.type],
      case when r.person>0 and r.project<=3 then r.minutes*10 end,case when r.person=0 then L->>'open' else '' end,
      (select count(*)+1 from public.capacity_rows c where c.workspace_id=p_workspace_id and c.project_id=projects[r.project]))
    returning id into v;
    -- Wochen: vier zurück bis zum Ende des Projekts (höchstens 14 voraus); einzelne Zeilen nur in ihrem Fenster.
    insert into public.capacity_cells(workspace_id,row_id,week_start,minutes)
    select p_workspace_id,v,g::date,r.minutes from generate_series(week-28,week+98,interval '7 days') g
    where g::date>=(select date_trunc('week',min(ph.starts_on))::date from public.project_phases ph where ph.project_id=projects[r.project])
      and g::date<=(select max(ph.ends_on) from public.project_phases ph where ph.project_id=projects[r.project])
      and (r.to_day=0 or (g::date>=week+r.from_day and g::date<=week+r.to_day));
  end loop;

  -- 6b. Vier Abwesenheiten, je eine Art: Urlaub nächste Woche, ein offener Antrag, eine Krankmeldung, ein halber Tag.
  insert into public.absences(workspace_id,user_id,starts_on,ends_on,kind,note,status,half_day) values
    (p_workspace_id,people[5],week+7,week+10,'vacation','','approved',''),
    (p_workspace_id,people[6],week+21,week+25,'vacation','','requested',''),
    (p_workspace_id,people[7],week-7,week-6,'sick','','approved',''),
    (p_workspace_id,people[4],week+4,week+4,'vacation','','approved','pm');
  insert into public.vacation_balances(workspace_id,user_id,year,carried_over,adjustment,note,updated_by)
  values(p_workspace_id,people[1],extract(year from today)::integer,3,0,'',actor) on conflict do nothing;

  -- 7. Zeiten der letzten vier Wochen bis gestern: je Arbeitstag ein Eintrag auf dem Projekt des Tages.
  --    Ältere Wochen sind freigegeben, die letzte ist eingereicht, die laufende noch Entwurf.
  for i in 1..7 loop
    select work_schedule into sched from public.memberships where workspace_id=p_workspace_id and user_id=people[i];
    day := week-28;
    while day<today loop
      dow := extract(isodow from day)::integer;
      target := case when dow<=5 then ((sched->(dow-1))::text)::integer else 0 end;
      if target>0 and (i+(day-date '2026-01-05'))%11<>0
        and not exists(select 1 from public.absences a where a.workspace_id=p_workspace_id and a.user_id=people[i] and a.status='approved' and a.half_day='' and a.starts_on<=day and a.ends_on>=day) then
        pid := projects[focus[(i-1)*5+dow]];
        insert into public.time_entries(workspace_id,project_id,user_id,work_date,minutes,note,billable,status,task_id)
        values(p_workspace_id,pid,people[i],day,target-60+((i+(day-date '2026-01-05'))%4)*15,L->>'time',
          (select billable_default from public.projects where id=pid),
          case when day<week-7 then 'approved' when day<week then 'submitted' else 'draft' end,
          (select t.id from public.tasks t where t.workspace_id=p_workspace_id and t.project_id=pid and t.assignee_id=people[i] and t.status in ('doing','done') order by t.status,t.created_at,t.id limit 1));
      end if;
      day := day+1;
    end loop;
  end loop;
  -- Die angemeldete Person findet drei eigene Entwürfe vor.
  j := 0; day := today-1;
  while j<3 and day>=today-7 loop
    if extract(isodow from day)<=5 and coalesce((select sum(minutes) from public.time_entries where workspace_id=p_workspace_id and user_id=actor and work_date=day),0)<=1350 then
      insert into public.time_entries(workspace_id,project_id,user_id,work_date,minutes,note,billable,status)
      values(p_workspace_id,projects[3],actor,day,45+j*30,L->>'time',true,'draft');
      j := j+1;
    end if;
    day := day-1;
  end loop;

  -- 8. Rechnungen über die normalen Funktionen: ein Entwurf, eine offene, eine bezahlte.
  insert into public.finance_billing_profiles(workspace_id,legal_name,billing_address,tax_id,payment_details,invoice_prefix,footer)
  values(p_workspace_id,L->>'company',L->>'address','DEMO-NOT-VALID',notice,'DEMO',notice)
  on conflict(workspace_id) do update set legal_name=excluded.legal_name,billing_address=excluded.billing_address,tax_id=excluded.tax_id,payment_details=excluded.payment_details,invoice_prefix=excluded.invoice_prefix,footer=excluded.footer;
  for i in 1..3 loop
    doc := public.finance_save_draft(jsonb_build_object('workspace_id',p_workspace_id,'client_id',clients[(array[2,1,3])[i]],'project_id',projects[(array[2,1,3])[i]],'language',loc,
      'issue_date',today-(array[0,10,35])[i],'due_date',today+(array[14,20,-5])[i],'service_from',week-42,'service_to',today-(array[0,10,35])[i],
      'notes',d.manifest->'disclosure'->>loc,'payment_instructions',notice,
      'lines',jsonb_build_array(jsonb_build_object('description',L->>('invoice'||(array[2,1,3])[i]),'quantity',1,'unit_price_minor',(array[1200000,2200000,950000])[i],'tax_basis_points',1900,'zero_tax_reason','','time_entry_id',null))));
    if i>1 then
      doc := public.finance_issue_invoice(p_workspace_id,(doc->>'id')::uuid);
      if i=3 then perform public.finance_set_paid(p_workspace_id,(doc->>'id')::uuid,true); end if;
    end if;
  end loop;

  delete from private.demo_seed_context where workspace_id=p_workspace_id;
  perform private.audit(p_workspace_id,'demo_seed','workspace',p_workspace_id,jsonb_build_object('experience_version',6,'compact',true,'fictional_operations',true));
end $$;
revoke all on function private.demo_seed_compact(uuid) from public,anon,authenticated;

-- Neue Demos: Workspace anlegen, kompakten Satz einspielen, auf heute bringen (Abwesenheiten, Urlaubskonten, Bewertungen).
create or replace function private.demo_create_workspace(p_name text,p_timezone text,p_locale text,p_request_id uuid) returns public.workspaces
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_workspace public.workspaces; v_existing public.workspace_demos; v_manifest jsonb := private.demo_manifest_compact();
begin
  if coalesce(length(btrim(p_name)),0) not between 1 and 100 or p_locale is null or p_locale not in ('en','de','zh')
    or p_request_id is null or p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
    raise exception 'DEMO_VALIDATION';
  end if;
  -- Dieselbe Anfrage liefert denselben Workspace: ein zweiter Klick legt nichts doppelt an.
  perform private.lock_user(v_user);
  select * into v_existing from public.workspace_demos where created_by=v_user and request_id=p_request_id;
  if found then
    perform 1 from public.workspaces where id=v_existing.workspace_id for update;
    if v_existing.archived_at is not null then raise exception 'DEMO_CONFLICT: This sample was archived.'; end if;
    if private.current_role(v_existing.workspace_id) is distinct from 'owner' then raise exception 'DEMO_FORBIDDEN' using errcode='42501'; end if;
    select * into v_workspace from public.workspaces where id=v_existing.workspace_id;
    return v_workspace;
  end if;
  select * into v_workspace from public.create_workspace(p_name,p_timezone,'EUR');
  insert into public.workspace_demos(workspace_id,created_by,request_id,locale,manifest_version,manifest,experience_version)
  values(v_workspace.id,v_user,p_request_id,p_locale,v_manifest->>'version',v_manifest,6);
  perform private.demo_seed_compact(v_workspace.id);
  perform private.demo_refresh_workspace(v_workspace.id);
  perform private.audit(v_workspace.id,'demo_create','workspace',v_workspace.id,jsonb_build_object('manifest_version',v_manifest->>'version','fictional_operations',true));
  return v_workspace;
end $$;

-- Beispieldaten neu laden: leert den Demo-Workspace und spielt den kompakten Satz ein. Workspace, echte
-- Mitglieder und Einladungen bleiben; alles andere – auch eigene Eingaben im Demo-Workspace – wird ersetzt.
create function private.demo_reset_workspace(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); w public.workspaces; d public.workspace_demos; v_manifest jsonb := private.demo_manifest_compact();
begin
  perform private.lock_user(actor);
  select * into w from public.workspaces where id=p_workspace_id for update;
  select * into d from public.workspace_demos where workspace_id=p_workspace_id for update;
  if d.workspace_id is null or d.created_by is distinct from actor or w.created_by is distinct from actor
    or d.archived_at is not null or private.current_role(p_workspace_id) is distinct from 'owner' then
    raise exception 'DEMO_FORBIDDEN' using errcode='42501';
  end if;
  if exists(select 1 from public.running_timers where workspace_id=p_workspace_id) then
    raise exception 'DEMO_CONFLICT: Stop or discard running timers first.';
  end if;
  -- Dieselbe, an Person und Transaktion gebundene Erlaubnis wie beim Löschen eines Workspace – und dieselbe Reihenfolge.
  insert into private.workspace_delete_context(workspace_id,actor,transaction_id) values(p_workspace_id,actor,txid_current());
  delete from public.time_suggestions where workspace_id=p_workspace_id;
  delete from public.notifications where workspace_id=p_workspace_id;
  delete from public.absences where workspace_id=p_workspace_id;
  delete from public.vacation_balances where workspace_id=p_workspace_id;
  delete from public.finance_invoice_payments where workspace_id=p_workspace_id;
  delete from public.finance_offers where workspace_id=p_workspace_id;
  delete from public.finance_time_claims where workspace_id=p_workspace_id;
  delete from public.finance_payments where workspace_id=p_workspace_id;
  delete from public.finance_invoices where workspace_id=p_workspace_id;
  delete from public.finance_expenses where workspace_id=p_workspace_id;
  delete from public.finance_project_plans where workspace_id=p_workspace_id;
  delete from public.finance_staff_rates where workspace_id=p_workspace_id;
  delete from public.finance_billing_profiles where workspace_id=p_workspace_id;
  delete from public.finance_clients where workspace_id=p_workspace_id;
  delete from public.time_entries where workspace_id=p_workspace_id;
  delete from private.timer_receipts where workspace_id=p_workspace_id;
  delete from public.capacity_cells where workspace_id=p_workspace_id;
  delete from public.capacity_rows where workspace_id=p_workspace_id;
  delete from public.project_phases where workspace_id=p_workspace_id;
  delete from public.service_types where workspace_id=p_workspace_id;
  delete from public.tasks where workspace_id=p_workspace_id;
  delete from public.projects where workspace_id=p_workspace_id;
  delete from public.memberships where workspace_id=p_workspace_id and is_demo;
  delete from private.demo_seed_context where workspace_id=p_workspace_id;
  delete from private.finance_number_counters where workspace_id=p_workspace_id;
  delete from private.finance_offer_counters where workspace_id=p_workspace_id;
  delete from public.audit_log where workspace_id=p_workspace_id;
  delete from private.workspace_delete_context where workspace_id=p_workspace_id;
  update public.workspace_demos set experience_version=6,manifest=v_manifest,manifest_version=v_manifest->>'version',refreshed_on=null where workspace_id=p_workspace_id;
  perform private.demo_seed_compact(p_workspace_id);
  perform private.demo_refresh_workspace(p_workspace_id);
  perform private.audit(p_workspace_id,'demo_reset','workspace',p_workspace_id,jsonb_build_object('experience_version',6,'fictional_operations',true));
  return jsonb_build_object('people',7,'projects',5,'tasks',16);
end $$;
create function public.demo_reset_workspace(p_workspace_id uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$select private.demo_reset_workspace(p_workspace_id)$$;
revoke all on function private.demo_reset_workspace(uuid),public.demo_reset_workspace(uuid) from public,anon,authenticated;
grant execute on function private.demo_reset_workspace(uuid),public.demo_reset_workspace(uuid) to authenticated;
