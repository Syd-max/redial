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
  jenis_tiket text not null check (jenis_tiket in ('SINGLE', 'DUO')),
  bukti_transfer bytea not null check (octet_length(bukti_transfer) between 1 and 2000000),
  bukti_transfer_mime text not null check (bukti_transfer_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  qr_tactlink bytea not null check (octet_length(qr_tactlink) between 1 and 2000000),
  qr_tactlink_mime text not null check (qr_tactlink_mime in ('image/jpeg', 'image/png')),
  created_at timestamptz not null default now()
);

-- Tabel lama: tambahkan kolom yang belum ada. Baris lama boleh belum memiliki
-- kontak, paket, atau berkas. API mewajibkannya untuk pendaftaran baru.
alter table public.redial_pendaftaran
  add column if not exists jenis_tiket text
    check (jenis_tiket in ('SINGLE', 'DUO')),
  add column if not exists paket_sponsor text
    check (paket_sponsor in ('Normal', 'Silver', 'Gold', 'Platinum', 'Priority')),
  add column if not exists bukti_transfer bytea
    check (octet_length(bukti_transfer) between 1 and 2000000),
  add column if not exists bukti_transfer_mime text
    check (bukti_transfer_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
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

alter table public.redial_pendaftaran
  add column if not exists ticket_approved_at timestamptz,
  add column if not exists ticket_email_status text not null default 'pending'
    check (ticket_email_status in ('pending', 'sending', 'accepted', 'failed', 'uncertain')),
  add column if not exists ticket_email_key uuid,
  add column if not exists ticket_email_started_at timestamptz,
  add column if not exists ticket_email_attempt_at timestamptz,
  add column if not exists ticket_email_message_id text;

create table if not exists public.redial_tiket (
  -- Numeric IDs let Code 128 encode pairs of digits, keeping the barcode wide enough to scan.
  code text primary key default lpad(
    (('x' || left(replace(gen_random_uuid()::text, '-', ''), 14))::bit(56)::bigint % 10000000000000000)::text,
    16, '0'
  ) check (code ~ '^[0-9]{16}$'),
  registration_id bigint not null references public.redial_pendaftaran(id) on delete cascade,
  position smallint not null check (position in (1, 2)),
  checked_in_at timestamptz,
  unique (registration_id, position)
);

alter table public.redial_tiket enable row level security;
revoke all on public.redial_tiket from anon, authenticated;
grant select, insert, update on public.redial_tiket to service_role;

create or replace function public.redial_claim_ticket_email(
  p_request_id uuid, p_email text, p_kind text
) returns jsonb language plpgsql set search_path = '' as $$
declare
  entry public.redial_pendaftaran%rowtype;
  now_at timestamptz := now();
  codes jsonb;
begin
  select * into entry from public.redial_pendaftaran where request_id = p_request_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if entry.email is distinct from p_email or entry.jenis_tiket is distinct from p_kind
     or entry.email is null or entry.jenis_tiket is null or entry.bukti_transfer is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  if entry.ticket_email_status = 'accepted' then return jsonb_build_object('status', 'accepted'); end if;
  if entry.ticket_email_status = 'sending' and entry.ticket_email_attempt_at > now_at - interval '1 minute' then
    return jsonb_build_object('status', 'busy');
  end if;
  if entry.ticket_email_status in ('sending', 'uncertain') then
    -- Keep the same provider key while the first request may have succeeded.
    if entry.ticket_email_started_at <= now_at - interval '14 minutes' then
      update public.redial_pendaftaran set ticket_email_status = 'uncertain' where id = entry.id;
      return jsonb_build_object('status', 'needs_review');
    end if;
  else
    entry.ticket_email_key := gen_random_uuid();
    entry.ticket_email_started_at := now_at;
  end if;

  if entry.ticket_approved_at is null then
    insert into public.redial_tiket (registration_id, position)
      select entry.id, slot from generate_series(1, case when p_kind = 'DUO' then 2 else 1 end) as slot;
  end if;

  update public.redial_pendaftaran set
    ticket_approved_at = coalesce(ticket_approved_at, now_at),
    ticket_email_status = 'sending',
    ticket_email_key = entry.ticket_email_key,
    ticket_email_started_at = entry.ticket_email_started_at,
    ticket_email_attempt_at = now_at
  where id = entry.id;

  select jsonb_agg(code order by position) into codes from public.redial_tiket where registration_id = entry.id;
  return jsonb_build_object('status', 'sending', 'key', entry.ticket_email_key, 'attempt', now_at,
    'email', entry.email, 'kind', entry.jenis_tiket, 'codes', codes,
    'retrying', entry.ticket_email_status in ('sending', 'uncertain'));
end;
$$;

create or replace function public.redial_reconcile_ticket_email(p_request_id uuid, p_accepted boolean)
returns boolean language sql set search_path = '' as $$
  with resolved as (
    update public.redial_pendaftaran
    set ticket_email_status = case when p_accepted then 'accepted' else 'failed' end
    where request_id = p_request_id and ticket_email_status in ('sending', 'uncertain')
      and ticket_email_started_at <= now() - interval '14 minutes'
      and ticket_email_attempt_at <= now() - interval '1 minute'
    returning id
  ) select exists (select 1 from resolved);
$$;

create or replace function public.redial_check_in_ticket(p_code text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  ticket public.redial_tiket%rowtype;
begin
  update public.redial_tiket set checked_in_at = now()
  where code = p_code and checked_in_at is null returning * into ticket;
  if found then return jsonb_build_object('status', 'checked_in', 'time', ticket.checked_in_at); end if;

  select * into ticket from public.redial_tiket where code = p_code;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object('status', 'already_checked_in', 'time', ticket.checked_in_at);
end;
$$;

revoke all on function public.redial_claim_ticket_email(uuid, text, text),
  public.redial_reconcile_ticket_email(uuid, boolean), public.redial_check_in_ticket(text)
  from public, anon, authenticated;
grant execute on function public.redial_claim_ticket_email(uuid, text, text),
  public.redial_reconcile_ticket_email(uuid, boolean), public.redial_check_in_ticket(text) to service_role;

commit;
