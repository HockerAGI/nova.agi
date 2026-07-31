-- Shared rate limiting for NOVA across every running instance.

begin;

create schema if not exists private;

create table if not exists private.nova_rate_limit_buckets (
  key_hash text primary key,
  request_count integer not null default 0 check (request_count >= 0),
  reset_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint nova_rate_limit_key_hash_length check (char_length(key_hash) = 64)
);

create index if not exists nova_rate_limit_buckets_reset_at_idx
  on private.nova_rate_limit_buckets (reset_at);

revoke all on table private.nova_rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table private.nova_rate_limit_buckets to service_role;

create or replace function public.consume_nova_rate_limit(
  p_key text,
  p_window_ms integer default 60000,
  p_max integer default 60,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_count integer;
  v_reset_at timestamptz;
  v_limit integer := greatest(1, least(coalesce(p_max, 60), 100000));
  v_window_ms integer := greatest(1000, least(coalesce(p_window_ms, 60000), 3600000));
begin
  if p_key is null or char_length(trim(p_key)) <> 64 then
    raise exception 'INVALID_RATE_LIMIT_KEY';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('nova-rate-limit:' || p_key, 0));

  select request_count, reset_at
    into v_count, v_reset_at
  from private.nova_rate_limit_buckets
  where key_hash = p_key
  for update;

  if not found or v_reset_at <= v_now then
    insert into private.nova_rate_limit_buckets (
      key_hash,
      request_count,
      reset_at,
      updated_at
    )
    values (
      p_key,
      1,
      v_now + make_interval(secs => v_window_ms::double precision / 1000.0),
      v_now
    )
    on conflict (key_hash) do update
      set request_count = 1,
          reset_at = excluded.reset_at,
          updated_at = excluded.updated_at
    returning request_count, reset_at into v_count, v_reset_at;
  else
    update private.nova_rate_limit_buckets
      set request_count = request_count + 1,
          updated_at = v_now
    where key_hash = p_key
    returning request_count, reset_at into v_count, v_reset_at;
  end if;

  if mod(hashtextextended(p_key, 1), 100) = 0 then
    delete from private.nova_rate_limit_buckets
    where reset_at < v_now - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_count <= v_limit,
    'limit', v_limit,
    'remaining', greatest(0, v_limit - v_count),
    'reset_at_ms', floor(extract(epoch from v_reset_at) * 1000)::bigint,
    'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_reset_at - v_now)))::integer)
  );
end;
$$;

revoke all on function public.consume_nova_rate_limit(text, integer, integer, timestamptz) from public;
grant execute on function public.consume_nova_rate_limit(text, integer, integer, timestamptz) to service_role;

comment on function public.consume_nova_rate_limit(text, integer, integer, timestamptz) is
  'Atomic, shared rate limiting for NOVA. Only service_role may execute it.';

commit;
