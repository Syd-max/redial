create table if not exists public.redial_pendaftaran (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  nama text not null check (char_length(btrim(nama)) between 1 and 120),
  instansi text not null check (char_length(btrim(instansi)) between 1 and 160),
  jenis_kelamin text not null check (jenis_kelamin in ('laki-laki', 'perempuan')),
  created_at timestamptz not null default now()
);

alter table public.redial_pendaftaran
  add column if not exists paket_sponsor text
  check (paket_sponsor in ('Normal', 'Silver', 'Gold', 'Platinum', 'Priority'));

alter table public.redial_pendaftaran
  add column if not exists bukti_transfer bytea
    check (octet_length(bukti_transfer) between 1 and 2000000),
  add column if not exists bukti_transfer_mime text
    check (bukti_transfer_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  add column if not exists qr_tactlink bytea
    check (octet_length(qr_tactlink) between 1 and 2000000),
  add column if not exists qr_tactlink_mime text
    check (qr_tactlink_mime in ('image/jpeg', 'image/png'));

alter table public.redial_pendaftaran enable row level security;
revoke all on public.redial_pendaftaran from anon, authenticated;
grant usage on schema public to service_role;
grant insert, select, update, delete on public.redial_pendaftaran to service_role;
grant usage, select on sequence public.redial_pendaftaran_id_seq to service_role;
