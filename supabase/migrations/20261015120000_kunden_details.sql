-- Kundenkarten mit den üblichen CRM-Angaben: Kundennummer, Branche, Telefon,
-- Website, interne Bemerkungen und beliebig viele Ansprechpartner (Name,
-- Funktion, E-Mail, Telefon; der erste ist der Hauptkontakt). Alles additiv
-- mit leeren Standardwerten; Lesen und Schreiben bleiben über die bestehenden
-- finance_*-Policies auf Leitung/Inhaber beschränkt.
create function private.finance_valid_contacts(c jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(c)='array' and jsonb_array_length(c)<=20 and octet_length(c::text)<=20000 and not exists(
  select 1 from jsonb_array_elements(c) e
  where jsonb_typeof(e)<>'object'
   or length(btrim(coalesce(e->>'name','')))=0
   or exists(select 1 from jsonb_each(e) kv where kv.key not in ('name','role','email','phone') or jsonb_typeof(kv.value)<>'string')
   or length(coalesce(e->>'name',''))>160 or length(coalesce(e->>'role',''))>120 or length(coalesce(e->>'phone',''))>60
   or (coalesce(e->>'email','')<>'' and (length(e->>'email')>320 or (e->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')))
$$;
revoke all on function private.finance_valid_contacts(jsonb) from public,anon,authenticated;
-- Die Prüfung läuft im CHECK unter der Rolle des Schreibenden.
grant execute on function private.finance_valid_contacts(jsonb) to authenticated;

alter table public.finance_clients
 add column customer_number text not null default '' check(length(customer_number)<=40),
 add column industry text not null default '' check(length(industry)<=80),
 add column phone text not null default '' check(length(phone)<=60),
 add column website text not null default '' check(length(website)<=300),
 add column notes text not null default '' check(length(notes)<=4000),
 add column contacts jsonb not null default '[]'::jsonb check(private.finance_valid_contacts(contacts));

-- Eine vergebene Kundennummer gibt es je Workspace nur einmal.
create unique index finance_clients_customer_number on public.finance_clients(workspace_id,customer_number) where customer_number<>'';
