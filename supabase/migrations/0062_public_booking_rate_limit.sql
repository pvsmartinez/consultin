-- 0062: public booking anti-abuse rate limiting
-- Tracks anonymous public-booking requests so the edge function can throttle
-- slot scraping and booking spam by IP and phone hash.

create table if not exists public.public_booking_rate_limits (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  action text not null check (action in ('slots', 'book')),
  client_ip text,
  phone_hash text,
  created_at timestamptz not null default now()
);

alter table public.public_booking_rate_limits enable row level security;

create index if not exists idx_public_booking_rate_limit_ip
  on public.public_booking_rate_limits (clinic_id, action, client_ip, created_at desc)
  where client_ip is not null;

create index if not exists idx_public_booking_rate_limit_phone
  on public.public_booking_rate_limits (clinic_id, action, phone_hash, created_at desc)
  where phone_hash is not null;

comment on table public.public_booking_rate_limits is
  'Anonymous public booking throttling log. Read/write via service role only.';