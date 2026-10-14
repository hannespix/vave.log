-- M4-A: E-Rechnung nach EN 16931 verlangt je Partei einen Ländercode
-- (BT-40/BT-55, ISO 3166-1 alpha-2) — die bisherigen Freitext-Adressen tragen
-- keinen. Das Land steht als eigene Spalte am Abrechnungsprofil und am Kunden
-- (Standard DE) und friert über die bestehenden Snapshots mit ein.
alter table public.finance_billing_profiles add column country text not null default 'DE' check(country ~ '^[A-Z]{2}$');
alter table public.finance_clients add column country text not null default 'DE' check(country ~ '^[A-Z]{2}$');
