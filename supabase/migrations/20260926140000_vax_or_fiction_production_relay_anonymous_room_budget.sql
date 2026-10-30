-- Anonymous room-creation abuse controls. Additive: no existing column or classic VRC policy
-- changes except one new nullable column on vof_relay.rooms (see below). The 500-room global
-- cap, 250-device room cap, and 128-ACK retention are unchanged. This migration bounds how
-- fast NEW rooms can be created, and how many open rooms one network can hold at once.
--
-- Why: the existing 500-room cap is a ceiling, not a budget. Nothing before this migration
-- stopped one anonymous caller from creating rooms back to back as fast as the network
-- allowed. A local reproduction against the pre-existing three-migration contract created
-- 120 rooms (24% of the entire shared project's cap) in under 3 seconds from one caller,
-- with zero rejections.
--
-- Design call (2026-09-26): cap open rooms per network. Two independent budgets, both
-- scoped to "a host creates a room that does not exist yet" only. Reconnecting to an owned
-- room, attendee join, and poll/send traffic are untouched.
--
-- 1. A global creation-rate budget: at most 40 new rooms across the whole project in any
--    rolling 60 seconds. At that sustained rate it takes over 12 minutes to reach the
--    500-room cap even with unlimited distinct callers, which is far above any plausible
--    legitimate arrival rate for a live trivia show and turns an abuse loop that previously
--    finished in seconds into one that cannot outrun detection.
-- 2. A per-network open-room cap: at most 20 unexpired rooms created by one network at a
--    time, which is 4% of the shared 500-room cap. A real presenter opens one room per show
--    (or a few for one venue's shared network), so this leaves headroom for several
--    presenters on one network while bounding any single network's share of the open-room
--    total. This replaces an earlier per-caller creation-RATE gate (5 per 10 minutes): that
--    gate did not bound holdings, because rooms live 8 hours, and it would have locked out a
--    real presenter on their sixth room launch inside 10 minutes.
--
-- Residual risk, stated plainly: many distinct networks can still fill the 500-room cap at
-- the 40-per-60s global rate, and any created room lives for a full 8 hours before it expires
-- and frees its network's slot. This migration bounds one network's share. It does not bound
-- the total arrival rate of distinct networks, and it does not shorten room lifetime.
--
-- The network key is read from current_setting('request.headers', true), which PostgREST
-- (Supabase's RPC transport) populates per request from the actual HTTP request. Supabase
-- projects sit behind Cloudflare, which overwrites any client-supplied CF-Connecting-IP
-- header with the real connecting IP before the request reaches PostgREST, so a caller
-- cannot forge this header to dodge or frame another caller. This Cloudflare-header
-- assumption is inferred from Supabase's documented edge topology, not verified against a
-- live request to the actual project. Confirm it before relying on this budget in production
-- (see the report's post-apply check).
--
-- If the header is absent, unparsable, or carries no cf-connecting-ip value, the key is the
-- fixed 'unknown' bucket. 'unknown' SKIPS the per-network cap entirely and only the global
-- budget above applies to it: every earlier draft of this migration ran 'unknown' through the
-- per-network gate too, which would have put every header-less caller in the one shared
-- bucket, so one script with no header could have locked out every other host sharing that
-- bucket. An IPv6 address is bucketed by its /64 prefix, since a single attacker holds 2^64
-- addresses within one /64 and a full-address key would give them that many distinct budgets.
-- An IPv4 address is bucketed by its full address. A malformed address value also falls back
-- to 'unknown' rather than being used as a literal (and forgeable-looking) bucket key.
--
-- New column: vof_relay.rooms.creating_network_key (nullable text, no default) records the
-- bucketed network key that created each room, so the per-network cap can be counted directly
-- against live rooms instead of a separate ledger. It is a metadata-only ALTER (no table
-- rewrite, no default value forcing a rewrite). Rooms created before this migration have a
-- null value there and count toward no network's cap, by construction: nothing backfills it.
--
-- Fixes made before apply, from the final review: an ownership guard immediately below aborts
-- the whole apply with nothing changed unless current_user already owns both vof_relay.rooms
-- and public.vof_relay_exchange(jsonb), since a different applying role would otherwise own
-- every new object here and every room creation would fail with a permission error against the
-- existing tables. set local lock_timeout = '3s' bounds how long the ALTER below can queue
-- behind live traffic (reproduced at about 3.5 seconds), and the same is added to the rollback
-- for its DROP COLUMN, which takes the identical lock. This file must be applied with `psql -1` (or
-- an explicit transaction wrapper), because SET LOCAL has no effect outside a transaction block
-- and a plain `psql -f` runs each statement as its own autocommitted transaction. caller_key()
-- now maps IPv4-mapped IPv6 addresses (the ::ffff:0:0/96 range) to their plain IPv4 form before
-- bucketing, since every such address previously collapsed to the same ::/64 key regardless of
-- the real IPv4 address it carries. room_creation_ledger no longer records the caller's network
-- at all, since nothing reads that value now that the per-caller rate gate is gone and only the
-- room count and timestamp matter for the global budget.

set local lock_timeout = '3s';

do $ownership_guard$
declare
  v_rooms_owner text;
  v_exchange_owner text;
begin
  select pg_catalog.pg_get_userbyid(c.relowner) into v_rooms_owner
    from pg_catalog.pg_class c where c.oid = 'vof_relay.rooms'::regclass;
  select pg_catalog.pg_get_userbyid(p.proowner) into v_exchange_owner
    from pg_catalog.pg_proc p where p.oid = 'public.vof_relay_exchange(jsonb)'::regprocedure;
  if current_user is distinct from v_rooms_owner or current_user is distinct from v_exchange_owner then
    raise exception 'This migration must be applied as the owner of both vof_relay.rooms (owner %) and public.vof_relay_exchange(jsonb) (owner %). Currently connected as %.',
      coalesce(v_rooms_owner, 'unknown'), coalesce(v_exchange_owner, 'unknown'), current_user;
  end if;
end
$ownership_guard$;

create table vof_relay.room_creation_ledger (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);
create index room_creation_ledger_created_at_idx on vof_relay.room_creation_ledger (created_at);

alter table vof_relay.room_creation_ledger enable row level security;

-- The network that created this room, bucketed by vof_relay.caller_key() (full IPv4 address,
-- /64 prefix for IPv6, or null for 'unknown'/pre-migration rooms). Nullable, no default: an
-- ADD COLUMN with neither breaks even on a populated table, so this never rewrites
-- vof_relay.rooms. Read alongside expires_at to count one network's currently-open rooms.
alter table vof_relay.rooms add column creating_network_key text collate "C";
create index rooms_creating_network_key_open_idx on vof_relay.rooms (creating_network_key, expires_at)
  where creating_network_key is not null;

create function vof_relay.caller_key()
returns text
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  headers text;
  candidate text;
  addr inet;
begin
  headers := current_setting('request.headers', true);
  if headers is null then return 'unknown'; end if;
  begin
    candidate := nullif(btrim(headers::jsonb ->> 'cf-connecting-ip'), '');
  exception when others then
    candidate := null;
  end;
  if candidate is null then return 'unknown'; end if;
  begin
    addr := candidate::inet;
  exception when others then
    return 'unknown';
  end;
  if family(addr) = 6 then
    -- An IPv4-mapped IPv6 address (the ::ffff:0:0/96 range) carries a real IPv4 address in its
    -- low 32 bits. Every such address shares the same ::/64 prefix, so bucketing it as IPv6
    -- would collapse ::ffff:198.51.100.4 and ::ffff:203.0.113.9 onto one shared key even though
    -- they are unrelated networks. Map it to its plain IPv4 form first, which also makes it
    -- share a key with the same address seen as bare IPv4 (a caller reaching the relay through
    -- an IPv4-mapped path is still one network, not a distinct one).
    if addr <<= inet '::ffff:0:0/96' then
      return regexp_replace(host(addr), '^::ffff:', '');
    end if;
    return (network(set_masklen(addr, 64)))::text;
  end if;
  return host(addr);
end;
$$;

create or replace function public.vof_relay_exchange(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- v_now is captured before the advisory lock below is acquired, so a caller that waits on
  -- that lock still counts its budget windows from its arrival time, not the time it actually
  -- got to run. It is left this way on purpose. The over-count this can cause is bounded and
  -- conservative (it can only make a caller look like it arrived earlier, never later, so a
  -- request can be rejected slightly sooner than a wall-clock-perfect window would reject it,
  -- never later), and matches the existing 500-room and host-rate windows, which already do
  -- the same thing.
  v_now timestamptz := clock_timestamp();
  v_room_id text;
  v_device_id text;
  v_credential text;
  v_role text;
  v_action text;
  v_hash bytea;
  v_room vof_relay.rooms%rowtype;
  v_device vof_relay.devices%rowtype;
  v_message jsonb;
  v_batch jsonb := '[]'::jsonb;
  v_batch_mode boolean := false;
  v_message_count integer := 0;
  v_events jsonb := '[]'::jsonb;
  v_more_events jsonb := '[]'::jsonb;
  v_host_connected boolean;
  v_known_revision bigint := 0;
  v_personal_revision bigint := 0;
  v_ack_cursor bigint := 0;
  v_consume_cursor bigint := 0;
  v_new_ack_cursor bigint := 0;
  v_new_inbox_cursor bigint := 0;
  v_message_id text;
  v_caller_key text;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object'
    or octet_length(p_request::text) > 131072
    or vof_relay.json_is_safe(p_request) is not true then
    return vof_relay.error_response('Request is invalid or too large');
  end if;
  if vof_relay.has_only_keys(
    p_request,
    array['version','action','role','roomId','credential','deviceId','message','messages','knownRevision','personalRevision','ackCursor','consumeCursor'],
    array['version','action','role','roomId','credential']
  ) is not true or p_request->'version' is distinct from '1'::jsonb then
    return vof_relay.error_response('Invalid request');
  end if;

  v_room_id := p_request->>'roomId';
  v_device_id := p_request->>'deviceId';
  v_credential := p_request->>'credential';
  v_role := p_request->>'role';
  v_action := p_request->>'action';
  if vof_relay.is_wire_id(v_room_id) is not true
    or v_credential is null or v_credential collate "C" !~ '^[A-Za-z0-9_-]{24,128}$'
    or v_role is null or v_action is null
    or v_role not in ('host','attendee')
    or v_action not in ('connect','poll','send') then
    return vof_relay.error_response('Invalid registration');
  end if;
  if v_action = 'send' then
    if p_request ? 'message' and not (p_request ? 'messages') and jsonb_typeof(p_request->'message') = 'object' then
      v_batch := jsonb_build_array(p_request->'message');
    elsif v_role = 'host' and p_request ? 'messages' and not (p_request ? 'message')
      and jsonb_typeof(p_request->'messages') = 'array'
      and jsonb_array_length(p_request->'messages') between 1 and 32 then
      v_batch := p_request->'messages';
      v_batch_mode := true;
    else
      return vof_relay.error_response('Invalid message batch');
    end if;
    v_message_count := jsonb_array_length(v_batch);
  end if;
  if p_request ? 'knownRevision' then
    if vof_relay.is_nonnegative_integer(p_request->'knownRevision') is not true then return vof_relay.error_response('Invalid cursor'); end if;
    v_known_revision := (p_request->>'knownRevision')::bigint;
  end if;
  if p_request ? 'personalRevision' then
    if vof_relay.is_nonnegative_integer(p_request->'personalRevision') is not true then return vof_relay.error_response('Invalid cursor'); end if;
    v_personal_revision := (p_request->>'personalRevision')::bigint;
  end if;
  if p_request ? 'ackCursor' then
    if vof_relay.is_nonnegative_integer(p_request->'ackCursor') is not true then return vof_relay.error_response('Invalid cursor'); end if;
    v_ack_cursor := (p_request->>'ackCursor')::bigint;
  end if;
  if p_request ? 'consumeCursor' then
    if vof_relay.is_nonnegative_integer(p_request->'consumeCursor') is not true then return vof_relay.error_response('Invalid cursor'); end if;
    v_consume_cursor := (p_request->>'consumeCursor')::bigint;
  end if;

  v_hash := extensions.digest(v_credential, 'sha256');
  delete from vof_relay.rooms where room_id = v_room_id and expires_at <= v_now;
  delete from vof_relay.rooms
    where room_id in (select room_id from vof_relay.rooms where expires_at <= v_now order by expires_at for update skip locked limit 8);

  if v_role = 'host' then
    if v_action = 'connect' then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('vof_relay_room_capacity'));
      if not exists (select 1 from vof_relay.rooms where room_id = v_room_id) then
        if (select count(*) from vof_relay.rooms where expires_at > v_now) >= 500 then
          return vof_relay.error_response('Relay room capacity reached');
        end if;
        delete from vof_relay.room_creation_ledger
          where id in (
            select id from vof_relay.room_creation_ledger
            where created_at < v_now - interval '15 minutes'
            order by id limit 64
          );
        if (select count(*) from vof_relay.room_creation_ledger where created_at > v_now - interval '60 seconds') >= 40 then
          return vof_relay.error_response('The relay is creating rooms too quickly right now. Try again in a minute.');
        end if;
        v_caller_key := vof_relay.caller_key();
        if v_caller_key <> 'unknown' then
          if (select count(*) from vof_relay.rooms where creating_network_key = v_caller_key and expires_at > v_now) >= 20 then
            return vof_relay.error_response('This network already has 20 open games, so reopen one you started on this device or try again later.');
          end if;
        end if;
        insert into vof_relay.room_creation_ledger(created_at) values (v_now);
      end if;
      insert into vof_relay.rooms(room_id, host_credential_hash, host_seen_at, expires_at, host_rate_window_at, creating_network_key)
      values (v_room_id, v_hash, v_now, v_now + interval '8 hours', v_now, nullif(v_caller_key, 'unknown'))
      on conflict (room_id) do nothing;
    end if;
    select * into v_room from vof_relay.rooms where room_id = v_room_id for update;
    if not found then return vof_relay.error_response('Room is unavailable'); end if;
    if v_room.host_credential_hash <> v_hash then return vof_relay.error_response('Room is already owned by another host'); end if;
    update vof_relay.rooms set host_seen_at = v_now, expires_at = v_now + interval '8 hours' where room_id = v_room_id;
    v_host_connected := true;

    delete from vof_relay.inbox where room_id = v_room_id and id <= v_consume_cursor and message_id is null;
    update vof_relay.inbox set delivered_at = v_now
      where room_id = v_room_id and id <= v_consume_cursor and message_id is not null;

    if v_action = 'connect' then
      v_events := v_events || jsonb_build_array(jsonb_build_object('kind','READY','role','host','snapshotRevision',v_room.snapshot_revision));
      select coalesce(jsonb_agg(jsonb_build_object('kind','ATTENDEE_CONNECTED','deviceId',device_id) order by device_id), '[]'::jsonb)
        into v_more_events from vof_relay.devices where room_id = v_room_id and seen_at > v_now - interval '5 seconds';
      v_events := v_events || v_more_events;
    elsif v_action = 'send' then
      if v_batch_mode then
        for v_message in select value from jsonb_array_elements(v_batch) loop
          if v_message->>'kind' is distinct from 'DIRECT'
            or vof_relay.has_only_keys(v_message, array['kind','deviceId','message'], array['kind','deviceId','message']) is not true
            or vof_relay.is_wire_id(v_message->>'deviceId') is not true
            or jsonb_typeof(v_message->'message') <> 'object' then
            return vof_relay.error_response('Invalid host message batch');
          end if;
          select * into v_device from vof_relay.devices
            where room_id = v_room_id and device_id = v_message->>'deviceId';
          if not found then return vof_relay.error_response('Unknown attendee in host message batch'); end if;
          if v_message->'message'->>'kind' = 'ACK' then
            if vof_relay.has_only_keys(v_message->'message', array['kind','messageId','accepted','reason'], array['kind','messageId','accepted']) is not true
              or vof_relay.is_wire_id(v_message->'message'->>'messageId') is not true
              or jsonb_typeof(v_message->'message'->'accepted') <> 'boolean'
              or (v_message->'message' ? 'reason' and (jsonb_typeof(v_message->'message'->'reason') <> 'string' or char_length(v_message->'message'->>'reason') > 512)) then
              return vof_relay.error_response('Invalid ACK in host message batch');
            end if;
            v_message_id := v_message->'message'->>'messageId';
            if not exists (
              select 1 from vof_relay.ack_history
              where room_id = v_room_id and device_id = v_message->>'deviceId' and message_id = v_message_id
            ) and not exists (
              select 1 from vof_relay.inbox
              where room_id = v_room_id and device_id = v_message->>'deviceId' and message_id = v_message_id
            ) then
              return vof_relay.error_response('ACK does not match a pending message');
            end if;
          elsif v_message->'message'->>'kind' = 'ATTENDEE_STATE' then
            if vof_relay.has_only_keys(v_message->'message', array['kind','state'], array['kind','state']) is not true
              or vof_relay.valid_attendee_state(v_message->'message'->'state') is not true then
              return vof_relay.error_response('Invalid attendee state in host message batch');
            end if;
          else
            return vof_relay.error_response('Invalid host message batch');
          end if;
        end loop;
      end if;

      if v_room.host_rate_window_at <= v_now - interval '1 second' then
        update vof_relay.rooms set host_rate_window_at = v_now, host_rate_count = v_message_count where room_id = v_room_id;
      elsif v_room.host_rate_count > 600 - v_message_count then
        return vof_relay.error_response('Host message rate exceeded');
      else
        update vof_relay.rooms set host_rate_count = host_rate_count + v_message_count where room_id = v_room_id;
      end if;
      for v_message in select value from jsonb_array_elements(v_batch) loop
        if v_message->>'kind' = 'ROOM_STATE' and not v_batch_mode
          and vof_relay.has_only_keys(v_message, array['kind','state'], array['kind','state']) is true then
          if vof_relay.valid_room_state(v_message->'state', v_room_id, v_room.snapshot_revision) is not true then
            return vof_relay.error_response('Invalid or stale room state');
          end if;
          update vof_relay.rooms
            set snapshot = jsonb_set(v_message->'state', '{hostConnected}', 'true'::jsonb, false),
                snapshot_revision = (v_message->'state'->>'revision')::bigint
            where room_id = v_room_id;
          v_room.snapshot_revision := (v_message->'state'->>'revision')::bigint;
        elsif v_message->>'kind' = 'DIRECT'
          and vof_relay.has_only_keys(v_message, array['kind','deviceId','message'], array['kind','deviceId','message']) is true
          and vof_relay.is_wire_id(v_message->>'deviceId') is true
          and jsonb_typeof(v_message->'message') = 'object' then
          select * into v_device from vof_relay.devices where room_id = v_room_id and device_id = v_message->>'deviceId';
          if not found then return vof_relay.error_response('Unknown attendee'); end if;
          if v_message->'message'->>'kind' = 'ACK'
            and vof_relay.has_only_keys(v_message->'message', array['kind','messageId','accepted','reason'], array['kind','messageId','accepted']) is true
            and vof_relay.is_wire_id(v_message->'message'->>'messageId') is true
            and jsonb_typeof(v_message->'message'->'accepted') = 'boolean'
            and (not (v_message->'message' ? 'reason') or (jsonb_typeof(v_message->'message'->'reason') = 'string' and char_length(v_message->'message'->>'reason') <= 512)) then
            v_message_id := v_message->'message'->>'messageId';
            if not exists (
              select 1 from vof_relay.ack_history
              where room_id = v_room_id and device_id = v_message->>'deviceId' and message_id = v_message_id
            ) and not exists (
              select 1 from vof_relay.inbox
              where room_id = v_room_id and device_id = v_message->>'deviceId' and message_id = v_message_id
            ) then
              return vof_relay.error_response('ACK does not match a pending message');
            end if;
            insert into vof_relay.ack_history(room_id, device_id, message_id, event)
            values (v_room_id, v_message->>'deviceId', v_message_id, v_message->'message')
            on conflict (room_id, device_id, message_id) do nothing;
            delete from vof_relay.inbox
              where room_id = v_room_id and device_id = v_message->>'deviceId'
                and message_id = v_message_id;
            delete from vof_relay.ack_history
              where id in (
                select id from vof_relay.ack_history
                where room_id = v_room_id and device_id = v_message->>'deviceId'
                order by id desc offset 128
              );
          elsif v_message->'message'->>'kind' = 'ATTENDEE_STATE'
            and vof_relay.has_only_keys(v_message->'message', array['kind','state'], array['kind','state']) is true
            and vof_relay.valid_attendee_state(v_message->'message'->'state') is true then
            update vof_relay.devices
              set personal_state = v_message->'message', personal_revision = personal_revision + 1
              where room_id = v_room_id and device_id = v_message->>'deviceId';
          else
            return vof_relay.error_response('Invalid host message');
          end if;
        else
          return vof_relay.error_response('Invalid host message');
        end if;
      end loop;
    end if;

    with candidates as (
      select id, event, sum(octet_length(event::text) + 1) over (order by id) as response_bytes
      from (
        select id, event from vof_relay.inbox
        where room_id = v_room_id and (delivered_at is null or v_action = 'connect')
        order by id limit 256
      ) pending
    )
    select coalesce(jsonb_agg(event order by id), '[]'::jsonb), coalesce(max(id), v_consume_cursor)
      into v_more_events, v_new_inbox_cursor from candidates
      where response_bytes <= greatest(0, 124000 - octet_length(v_events::text));
    v_events := v_events || v_more_events;
    return jsonb_build_object('events', v_events, 'snapshotRevision', v_room.snapshot_revision, 'inboxCursor', v_new_inbox_cursor, 'hostSeenAt', v_now);
  end if;

  if vof_relay.is_wire_id(v_device_id) is not true then return vof_relay.error_response('Invalid attendee identity'); end if;
  select * into v_room from vof_relay.rooms where room_id = v_room_id for update;
  if not found then return vof_relay.error_response('Host is unavailable'); end if;
  v_host_connected := v_room.host_seen_at > v_now - interval '5 seconds';

  select * into v_device from vof_relay.devices where room_id = v_room_id and device_id = v_device_id;
  if v_action = 'connect' and not found then
    if (select count(*) from vof_relay.devices where room_id = v_room_id) >= 250 then
      return vof_relay.error_response('Room participant capacity reached');
    end if;
    insert into vof_relay.devices(room_id, device_id, credential_hash, seen_at, rate_window_at)
    values (v_room_id, v_device_id, v_hash, v_now, v_now)
    returning * into v_device;
  elsif not found then
    return vof_relay.error_response('Attendee is not connected');
  end if;
  if v_device.credential_hash <> v_hash then return vof_relay.error_response('Device identity is already in use'); end if;
  update vof_relay.devices set seen_at = v_now where room_id = v_room_id and device_id = v_device_id;

  if v_action = 'connect' then
    v_events := v_events || jsonb_build_array(jsonb_build_object('kind','READY','role','attendee'));
    delete from vof_relay.inbox where room_id = v_room_id and device_id = v_device_id and message_id is null;
    insert into vof_relay.inbox(room_id, device_id, message_id, event)
    values (v_room_id, v_device_id, null, jsonb_build_object('kind','ATTENDEE_CONNECTED','deviceId',v_device_id));
  elsif v_action = 'send' then
    v_message := p_request->'message';
    if vof_relay.has_only_keys(v_message, array['kind','message'], array['kind','message']) is not true
      or v_message->>'kind' <> 'CLIENT_MESSAGE'
      or vof_relay.valid_client_message(v_message->'message', v_room_id, v_device_id) is not true then
      return vof_relay.error_response('Invalid attendee message');
    end if;
    v_message_id := v_message->'message'->>'messageId';
    if not exists (select 1 from vof_relay.ack_history where room_id = v_room_id and device_id = v_device_id and message_id = v_message_id)
      and not exists (select 1 from vof_relay.inbox where room_id = v_room_id and device_id = v_device_id and message_id = v_message_id) then
      if not v_host_connected then
        insert into vof_relay.ack_history(room_id, device_id, message_id, event)
        values (v_room_id, v_device_id, v_message_id, jsonb_build_object('kind','ACK','messageId',v_message_id,'accepted',false,'reason','Host is disconnected'))
        on conflict (room_id, device_id, message_id) do nothing;
      elsif v_device.rate_window_at > v_now - interval '10 seconds' and v_device.rate_count >= 30 then
        insert into vof_relay.ack_history(room_id, device_id, message_id, event)
        values (v_room_id, v_device_id, v_message_id, jsonb_build_object('kind','ACK','messageId',v_message_id,'accepted',false,'reason','Message rate exceeded'))
        on conflict (room_id, device_id, message_id) do nothing;
      else
        update vof_relay.devices
          set rate_window_at = case when rate_window_at <= v_now - interval '10 seconds' then v_now else rate_window_at end,
              rate_count = case when rate_window_at <= v_now - interval '10 seconds' then 1 else rate_count + 1 end
          where room_id = v_room_id and device_id = v_device_id;
        if (select count(*) from vof_relay.inbox where room_id = v_room_id and message_id is not null) >= 1000 then
          insert into vof_relay.ack_history(room_id, device_id, message_id, event)
          values (v_room_id, v_device_id, v_message_id, jsonb_build_object('kind','ACK','messageId',v_message_id,'accepted',false,'reason','Relay inbox is full'))
          on conflict (room_id, device_id, message_id) do nothing;
        else
          insert into vof_relay.inbox(room_id, device_id, message_id, event)
          values (v_room_id, v_device_id, v_message_id, jsonb_build_object('kind','CLIENT_MESSAGE','message',v_message->'message'))
          on conflict (room_id, device_id, message_id) do nothing;
        end if;
      end if;
    end if;
  end if;

  if v_room.snapshot is not null and (v_action = 'connect' or v_room.snapshot_revision > v_known_revision) then
    v_events := v_events || jsonb_build_array(jsonb_build_object(
      'kind','ROOM_STATE',
      'state',jsonb_set(v_room.snapshot, '{hostConnected}', to_jsonb(v_host_connected), false)
    ));
  end if;
  select * into v_device from vof_relay.devices where room_id = v_room_id and device_id = v_device_id;
  if v_device.personal_state is not null and (v_action = 'connect' or v_device.personal_revision > v_personal_revision) then
    v_events := v_events || jsonb_build_array(v_device.personal_state);
  end if;
  with candidates as (
    select id, event, sum(octet_length(event::text) + 1) over (order by id) as response_bytes
    from (
      select id, event from vof_relay.ack_history
      where room_id = v_room_id and device_id = v_device_id and id > v_ack_cursor
      order by id limit 32
    ) pending
  )
  select coalesce(jsonb_agg(event order by id), '[]'::jsonb), coalesce(max(id), v_ack_cursor)
    into v_more_events, v_new_ack_cursor from candidates
    where response_bytes <= greatest(0, 124000 - octet_length(v_events::text));
  v_events := v_events || v_more_events || jsonb_build_array(jsonb_build_object('kind','HOST_STATUS','connected',v_host_connected));

  delete from vof_relay.ack_history
    where id in (
      select id from vof_relay.ack_history
      where room_id = v_room_id and device_id = v_device_id
      order by id desc offset 128 limit 64
    );
  delete from vof_relay.ack_history where id in (
    select id from vof_relay.ack_history where created_at < v_now - interval '30 minutes' order by id limit 64
  );
  delete from vof_relay.inbox where id in (
    select id from vof_relay.inbox where created_at < v_now - interval '2 minutes' order by id limit 64
  );

  return jsonb_build_object(
    'events', v_events,
    'snapshotRevision', v_room.snapshot_revision,
    'personalRevision', v_device.personal_revision,
    'ackCursor', v_new_ack_cursor,
    'hostSeenAt', v_room.host_seen_at
  );
end;
$$;

revoke all on table vof_relay.room_creation_ledger from public, anon, authenticated;
revoke all on all sequences in schema vof_relay from public, anon, authenticated;
revoke all on function vof_relay.caller_key() from public, anon, authenticated;
revoke all on function public.vof_relay_exchange(jsonb) from public, anon, authenticated;
grant execute on function public.vof_relay_exchange(jsonb) to anon, authenticated;
