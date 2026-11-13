begin;

-- Instalasi baru: data wajib dari formulir REDIAL saat ini.
create table if not exists public.redial_pendaftaran (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  nama text not null check (char_length(btrim(nama)) between 1 and 120),
  instansi text not null check (char_length(btrim(instansi)) between 1 and 160),
  jenis_kelamin text not null check (jenis_kelamin in ('laki-laki', 'perempuan')),
  nomor_telepon text not null check (nomor_telepon ~ '^[+]?[0-9]{8,15}$'),
  email text not null check (char_length(email) between 3 and 254),
  qr_tactlink bytea not null check (octet_length(qr_tactlink) between 1 and 2000000),
  qr_tactlink_mime text not null check (qr_tactlink_mime in ('image/jpeg', 'image/png')),
  created_at timestamptz not null default now()
);

-- Tabel lama: tambahkan kolom yang belum ada. Baris lama boleh belum memiliki
-- kontak atau QR. API mewajibkannya untuk setiap pendaftaran baru.
-- Kolom paket sponsor dan bukti transfer yang sudah ada tetap disimpan.
alter table public.redial_pendaftaran
  add column if not exists nomor_telepon text
    check (nomor_telepon ~ '^[+]?[0-9]{8,15}$'),
  add column if not exists email text
    check (char_length(email) between 3 and 254),
  add column if not exists qr_tactlink bytea
    check (octet_length(qr_tactlink) between 1 and 2000000),
  add column if not exists qr_tactlink_mime text
    check (qr_tactlink_mime in ('image/jpeg', 'image/png'));

alter table public.redial_pendaftaran enable row level security;
revoke all on public.redial_pendaftaran from anon, authenticated;
grant usage on schema public to service_role;
-- Dashboard menghapus registrasi melalui API server; QR disimpan pada baris yang sama.
grant insert, select, update, delete on public.redial_pendaftaran to service_role;
grant usage, select on sequence public.redial_pendaftaran_id_seq to service_role;

commit;
