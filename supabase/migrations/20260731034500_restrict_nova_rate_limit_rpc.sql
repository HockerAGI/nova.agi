-- Ensure the shared NOVA limiter is callable only by trusted server code.

begin;

revoke execute on function public.consume_nova_rate_limit(text, integer, integer, timestamptz)
  from public, anon, authenticated;

grant execute on function public.consume_nova_rate_limit(text, integer, integer, timestamptz)
  to service_role;

commit;
