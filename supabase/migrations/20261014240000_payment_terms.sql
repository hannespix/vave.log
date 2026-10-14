-- M3-E: Zahlungsziel-Vorgabe. Bisher belegte der Rechnungs-Editor die Fälligkeit
-- mit dem Ausstellungstag vor — jede neue Rechnung war sofort „fällig" und die
-- Überfällig-Kennzahl (M3-A) damit wertlos. Die Frist in Tagen steht am
-- Abrechnungsprofil (0 = sofort fällig bleibt möglich, z. B. Vorkasse) und dient
-- nur als Vorbelegung im Editor; das gespeicherte due_date bleibt die Wahrheit.
alter table public.finance_billing_profiles add column payment_terms_days integer not null default 14
 check(payment_terms_days between 0 and 365);
