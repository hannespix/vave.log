-- M3-D: Firmenlogo auf der Rechnung. Das Logo liegt als Data-URI direkt im
-- Abrechnungsprofil (kein Storage-Bucket: offline-freundlich, wandert über
-- to_jsonb(profile) automatisch in den eingefrorenen issuer_snapshot und ist
-- damit GoBD-konform unveränderlich auf ausgestellten Belegen). Nur Rasterformate:
-- SVG bliebe als aktives Markup ein Einfallstor, der Upload rastert ohnehin
-- über Canvas. 300.000 Zeichen Base64 ≈ 220 KB Bild — weit über dem, was der
-- verkleinernde Upload erzeugt, aber ein hartes Limit gegen Snapshot-Aufblähung.
alter table public.finance_billing_profiles add column logo_data text not null default ''
 check(logo_data='' or ((logo_data like 'data:image/png;base64,%' or logo_data like 'data:image/jpeg;base64,%' or logo_data like 'data:image/webp;base64,%') and length(logo_data)<=300000));
