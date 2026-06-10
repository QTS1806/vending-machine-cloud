alter table public.machines
add column if not exists total_refunded integer not null default 0;
