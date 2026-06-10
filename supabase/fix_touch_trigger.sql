-- Run this once in Supabase SQL Editor if ESP32 shows:
-- record "new" has no field "status"

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  if tg_table_name = 'machines' then
    if new.status in ('online', 'busy', 'error') then
      new.last_seen_at = now();
    end if;
  end if;

  return new;
end;
$$;

