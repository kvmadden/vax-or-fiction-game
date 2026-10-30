-- Rollback for 20260926140000_vax_or_fiction_production_relay_anonymous_room_budget.sql
--
-- Manual-apply only. Do NOT copy this file into supabase/migrations/: every .sql file in
-- that directory is applied forward in filename order, so placing an undo script there
-- would auto-apply it on the very next `supabase db push` and immediately revert the fix.
--
-- Apply by hand, against the real project, only if the room-creation budget itself needs
-- to come out (for example: it is rejecting legitimate hosts and there is no time to
-- retune the 40-per-60s / 20-per-network numbers first):
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations-rollback/20260926140000_vax_or_fiction_production_relay_anonymous_room_budget_rollback.sql
--
-- This restores public.vof_relay_exchange to the exact body it had on main (d62a1f9),
-- before the ledger and per-network checks existed, and drops the ledger table, the helper
-- function, and the new creating_network_key column and its index on vof_relay.rooms. It
-- does not touch vof_relay.valid_room_state, is_slide_index, or anything from the other
-- three migrations, which this change never modified.
--
-- RELAY6 correction: this comment previously said only the Supabase CLI (for example
-- `supabase db push`) writes supabase_migrations.schema_migrations, and that running this file
-- directly with psql leaves no tracking row to reconcile. That was wrong. The production apply
-- of the forward migration went through Supabase's own apply_migration path, not the CLI, and it
-- DID record a row: version 20260926200211, name vax_or_fiction_production_relay_anonymous_room_budget.
-- Applying this rollback by hand (via psql, as documented above) does not touch that table, so
-- after a manual rollback, supabase_migrations.schema_migrations still shows the forward
-- migration as applied even though the schema has been reverted. Delete that row by hand
-- afterward so the recorded migration history matches the actual schema:
--   delete from supabase_migrations.schema_migrations where version = '20260926200211';
--
-- Production apply facts, for whoever is deciding whether to roll back: applied 2026-09-26, as
-- role postgres, through apply_migration. The live public.vof_relay_exchange(jsonb) function
-- body at that apply has md5(prosrc) 94644220eee7c2720618f5f87a382d1b and length(prosrc) 21194.
-- The live vof_relay.caller_key() function body has md5(prosrc) 045802b3e0e546253f59f34766e3ec47
-- and length(prosrc) 1230. Compare against these before assuming the live function still matches
-- what this rollback expects to revert.
--
-- This file must be applied with `psql -1` (or an explicit transaction wrapper): the
-- set local lock_timeout below has no effect outside a transaction block, and a plain
-- `psql -f` runs each statement as its own autocommitted transaction.

set local lock_timeout = '3s';

create or replace function public.vof_relay_exchange(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
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
      if not exists (select 1 from vof_relay.rooms where room_id = v_room_id)
        and (select count(*) from vof_relay.rooms where expires_at > v_now) >= 500 then
        return vof_relay.error_response('Relay room capacity reached');
      end if;
      insert into vof_relay.rooms(room_id, host_credential_hash, host_seen_at, expires_at, host_rate_window_at)
      values (v_room_id, v_hash, v_now, v_now + interval '8 hours', v_now)
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

revoke all on function public.vof_relay_exchange(jsonb) from public, anon, authenticated;
grant execute on function public.vof_relay_exchange(jsonb) to anon, authenticated;

drop function if exists vof_relay.caller_key();
drop table if exists vof_relay.room_creation_ledger;
drop index if exists vof_relay.rooms_creating_network_key_open_idx;
alter table vof_relay.rooms drop column if exists creating_network_key;
