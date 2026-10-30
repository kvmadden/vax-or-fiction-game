-- Vax or Fiction's ephemeral room relay. This migration is additive and does
-- not grant either client role direct access to the backing schema or tables.
create schema vof_relay;

revoke all on schema vof_relay from public, anon, authenticated;

create table vof_relay.rooms (
  room_id text collate "C" primary key,
  host_credential_hash bytea not null check (octet_length(host_credential_hash) = 32),
  host_seen_at timestamptz not null,
  expires_at timestamptz not null,
  snapshot_revision bigint not null default 0 check (snapshot_revision >= 0),
  snapshot jsonb,
  host_rate_window_at timestamptz not null,
  host_rate_count integer not null default 0 check (host_rate_count >= 0),
  created_at timestamptz not null default now(),
  check (room_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  check (snapshot is null or jsonb_typeof(snapshot) = 'object')
);
create index rooms_expires_at_idx on vof_relay.rooms (expires_at);

create table vof_relay.devices (
  room_id text collate "C" not null references vof_relay.rooms(room_id) on delete cascade,
  device_id text collate "C" not null,
  credential_hash bytea not null check (octet_length(credential_hash) = 32),
  seen_at timestamptz not null,
  personal_revision bigint not null default 0 check (personal_revision >= 0),
  personal_state jsonb,
  rate_window_at timestamptz not null,
  rate_count integer not null default 0 check (rate_count >= 0),
  primary key (room_id, device_id),
  check (device_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  check (personal_state is null or jsonb_typeof(personal_state) = 'object')
);

create table vof_relay.inbox (
  id bigint generated always as identity primary key,
  room_id text collate "C" not null references vof_relay.rooms(room_id) on delete cascade,
  device_id text collate "C" not null,
  message_id text collate "C",
  event jsonb not null check (jsonb_typeof(event) = 'object'),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique nulls not distinct (room_id, device_id, message_id)
);
create index inbox_room_id_id_idx on vof_relay.inbox (room_id, id);

create table vof_relay.ack_history (
  id bigint generated always as identity primary key,
  room_id text collate "C" not null,
  device_id text collate "C" not null,
  message_id text collate "C" not null,
  event jsonb not null check (jsonb_typeof(event) = 'object'),
  created_at timestamptz not null default now(),
  unique (room_id, device_id, message_id),
  foreign key (room_id, device_id) references vof_relay.devices(room_id, device_id) on delete cascade
);
create index ack_history_device_id_idx on vof_relay.ack_history (room_id, device_id, id);

alter table vof_relay.rooms enable row level security;
alter table vof_relay.devices enable row level security;
alter table vof_relay.inbox enable row level security;
alter table vof_relay.ack_history enable row level security;

create function vof_relay.has_only_keys(value jsonb, allowed text[], required text[])
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(jsonb_typeof(value) = 'object'
    and (value - allowed) = '{}'::jsonb
    and value ?& required, false);
$$;

create function vof_relay.is_wire_id(value text)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(value is not null and value collate "C" ~ '^[A-Za-z0-9_-]{1,64}$', false);
$$;

create function vof_relay.is_session_id(value text)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(value is not null and value collate "C" ~ '^[A-Za-z0-9:_-]{1,192}$', false);
$$;

create function vof_relay.is_nonnegative_integer(value jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(jsonb_typeof(value) = 'number'
    and (value #>> '{}') collate "C" ~ '^[0-9]+$'
    and (value #>> '{}')::numeric <= 9007199254740991, false);
$$;

create function vof_relay.json_is_safe(value jsonb, depth integer default 0)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
#variable_conflict use_column
declare
  item record;
begin
  if value is null then
    return false;
  end if;
  if depth > 12 then
    return false;
  end if;
  if jsonb_typeof(value) = 'object' then
    for item in select key, value from jsonb_each(value) loop
      if item.key in ('__proto__', 'constructor', 'prototype')
        or vof_relay.json_is_safe(item.value, depth + 1) is not true then
        return false;
      end if;
    end loop;
  elsif jsonb_typeof(value) = 'array' then
    for item in select value from jsonb_array_elements(value) loop
      if vof_relay.json_is_safe(item.value, depth + 1) is not true then
        return false;
      end if;
    end loop;
  end if;
  return true;
end;
$$;

create function vof_relay.valid_public_question(value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
#variable_conflict use_column
declare
  item jsonb;
begin
  if vof_relay.has_only_keys(
    value,
    array['id','questionInstanceId','kind','statement','number','total','options','steps','unit'],
    array['id','questionInstanceId','kind','statement','number','total','options']
  ) is not true then return false; end if;
  if coalesce((vof_relay.is_wire_id(value->>'id') is not true
    or vof_relay.is_session_id(value->>'questionInstanceId') is not true
    or value->>'kind' not in ('binary','myth-among-three','estimate','order','which-patient')
    or jsonb_typeof(value->'statement') <> 'string'
    or char_length(value->>'statement') > 4096
    or vof_relay.is_nonnegative_integer(value->'number') is not true
    or vof_relay.is_nonnegative_integer(value->'total') is not true
    or jsonb_typeof(value->'options') <> 'array'
    or jsonb_array_length(value->'options') > 6), true) then return false; end if;
  for item in select value from jsonb_array_elements(value->'options') loop
    if coalesce((vof_relay.has_only_keys(item, array['token','label','text','min','max'], array['token','label','text']) is not true
      or vof_relay.is_wire_id(item->>'token') is not true
      or jsonb_typeof(item->'label') <> 'string'
      or char_length(item->>'label') > 256
      or jsonb_typeof(item->'text') <> 'string'
      or char_length(item->>'text') > 4096
      or (item ? 'min' and jsonb_typeof(item->'min') <> 'number')
      or (item ? 'max' and jsonb_typeof(item->'max') <> 'number')), true) then return false; end if;
  end loop;
  if value ? 'steps' then
    if jsonb_typeof(value->'steps') <> 'array' or jsonb_array_length(value->'steps') > 6 then return false; end if;
    for item in select value from jsonb_array_elements(value->'steps') loop
      if coalesce((vof_relay.has_only_keys(item, array['token','text'], array['token','text']) is not true
        or vof_relay.is_wire_id(item->>'token') is not true
        or jsonb_typeof(item->'text') <> 'string'
        or char_length(item->>'text') > 4096), true) then return false; end if;
    end loop;
  end if;
  return coalesce(not (value ? 'unit') or (jsonb_typeof(value->'unit') = 'string' and char_length(value->>'unit') <= 64), false);
end;
$$;

create function vof_relay.valid_reveal(value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
#variable_conflict use_column
declare
  item jsonb;
begin
  if coalesce((vof_relay.has_only_keys(value, array['answerLabel','answerToken','explanation','takeaway','citations'], array['answerLabel','answerToken','explanation','takeaway','citations']) is not true
    or jsonb_typeof(value->'answerLabel') <> 'string' or char_length(value->>'answerLabel') > 4096
    or jsonb_typeof(value->'answerToken') <> 'string' or char_length(value->>'answerToken') > 256
    or jsonb_typeof(value->'explanation') <> 'string' or char_length(value->>'explanation') > 16384
    or jsonb_typeof(value->'takeaway') <> 'string' or char_length(value->>'takeaway') > 8192
    or jsonb_typeof(value->'citations') <> 'array' or jsonb_array_length(value->'citations') > 24), true) then return false; end if;
  for item in select value from jsonb_array_elements(value->'citations') loop
    if coalesce((vof_relay.has_only_keys(item, array['label','url'], array['label']) is not true
      or jsonb_typeof(item->'label') <> 'string' or char_length(item->>'label') > 1024
      or (item ? 'url' and (jsonb_typeof(item->'url') <> 'string' or char_length(item->>'url') > 4096 or item->>'url' !~ '^https?://'))), true) then return false; end if;
  end loop;
  return true;
end;
$$;

create function vof_relay.valid_showdown(value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
#variable_conflict use_column
declare
  item record;
begin
  if coalesce((vof_relay.has_only_keys(value, array['id','stage','finalists','predictions','question','winner'], array['id','stage','finalists','predictions','question','winner']) is not true
    or vof_relay.is_session_id(value->>'id') is not true
    or value->>'stage' not in ('lineup','duel','result')
    or jsonb_typeof(value->'finalists') <> 'array' or jsonb_array_length(value->'finalists') > 8
    or jsonb_typeof(value->'predictions') <> 'object'), true) then return false; end if;
  for item in select value from jsonb_array_elements(value->'finalists') loop
    if coalesce((vof_relay.has_only_keys(item.value, array['ticket','name','score','duelPoints'], array['ticket','name','score','duelPoints']) is not true
      or vof_relay.is_wire_id(item.value->>'ticket') is not true
      or jsonb_typeof(item.value->'name') <> 'string' or char_length(item.value->>'name') > 40
      or vof_relay.is_nonnegative_integer(item.value->'score') is not true
      or vof_relay.is_nonnegative_integer(item.value->'duelPoints') is not true), true) then return false; end if;
  end loop;
  if (select count(*) from jsonb_each(value->'predictions')) > 8 then return false; end if;
  for item in select key, value from jsonb_each(value->'predictions') loop
    if vof_relay.is_wire_id(item.key) is not true or vof_relay.is_nonnegative_integer(item.value) is not true then return false; end if;
  end loop;
  return coalesce((jsonb_typeof(value->'question') = 'null' or vof_relay.valid_public_question(value->'question') is true)
    and (jsonb_typeof(value->'winner') = 'null' or (jsonb_typeof(value->'winner') = 'string' and vof_relay.is_wire_id(value->>'winner') is true)), false);
end;
$$;

create function vof_relay.valid_room_state(value jsonb, expected_room_id text, previous_revision bigint)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
#variable_conflict use_column
declare
  item jsonb;
begin
  if coalesce((vof_relay.json_is_safe(value) is not true
    or vof_relay.has_only_keys(
      value,
      array['version','roomId','sessionId','revision','phase','slideIndex','slideCount','question','questionData','reveal','votesLocked','timerSeconds','timerDurationSeconds','timerRunning','participants','teamScores','leaderboard','showdown','hostConnected'],
      array['version','roomId','sessionId','revision','phase','slideIndex','slideCount','question','questionData','reveal','votesLocked','timerSeconds','timerDurationSeconds','timerRunning','participants','teamScores','leaderboard','showdown','hostConnected']
    ) is not true
    or value->'version' is distinct from '1'::jsonb
    or value->>'roomId' is distinct from expected_room_id
    or vof_relay.is_session_id(value->>'sessionId') is not true
    or vof_relay.is_nonnegative_integer(value->'revision') is not true
    or (value->>'revision')::bigint <= previous_revision
    or jsonb_typeof(value->'phase') <> 'string' or char_length(value->>'phase') > 32
    or vof_relay.is_nonnegative_integer(value->'slideIndex') is not true
    or vof_relay.is_nonnegative_integer(value->'slideCount') is not true
    or (jsonb_typeof(value->'question') <> 'null' and (jsonb_typeof(value->'question') <> 'string' or char_length(value->>'question') > 64))
    or (jsonb_typeof(value->'questionData') <> 'null' and vof_relay.valid_public_question(value->'questionData') is not true)
    or jsonb_typeof(value->'votesLocked') <> 'boolean'
    or vof_relay.is_nonnegative_integer(value->'timerSeconds') is not true
    or vof_relay.is_nonnegative_integer(value->'timerDurationSeconds') is not true
    or jsonb_typeof(value->'timerRunning') <> 'boolean'
    or vof_relay.is_nonnegative_integer(value->'participants') is not true
    or jsonb_typeof(value->'leaderboard') <> 'array' or jsonb_array_length(value->'leaderboard') > 250
    or jsonb_typeof(value->'hostConnected') <> 'boolean'), true) then return false; end if;
  if jsonb_typeof(value->'reveal') <> 'null'
    and (value->>'phase' not in ('revealed','closing') or vof_relay.valid_reveal(value->'reveal') is not true) then return false; end if;
  if jsonb_typeof(value->'teamScores') <> 'null' then
    if vof_relay.has_only_keys(value->'teamScores', array['NAVY','GOLD'], array['NAVY','GOLD']) is not true
      or vof_relay.is_nonnegative_integer(value->'teamScores'->'NAVY') is not true
      or vof_relay.is_nonnegative_integer(value->'teamScores'->'GOLD') is not true then return false; end if;
  end if;
  for item in select value from jsonb_array_elements(value->'leaderboard') loop
    if coalesce((vof_relay.has_only_keys(item, array['name','score','rank','team'], array['name','score','rank','team']) is not true
      or jsonb_typeof(item->'name') <> 'string' or char_length(item->>'name') > 40
      or vof_relay.is_nonnegative_integer(item->'score') is not true
      or vof_relay.is_nonnegative_integer(item->'rank') is not true
      or (jsonb_typeof(item->'team') <> 'null' and item->>'team' not in ('NAVY','GOLD'))), true) then return false; end if;
  end loop;
  return coalesce(jsonb_typeof(value->'showdown') = 'null' or vof_relay.valid_showdown(value->'showdown') is true, false);
end;
$$;

create function vof_relay.valid_client_message(value jsonb, expected_room_id text, expected_device_id text)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
declare
  common_allowed text[] := array['version','type','roomId','sessionId','deviceId','messageId','questionInstanceId','nickname','team','choice','conviction','reaction','winner','showdownId'];
begin
  if vof_relay.json_is_safe(value) is not true
    or vof_relay.has_only_keys(value, common_allowed, array['version','type','roomId','sessionId','deviceId','messageId']) is not true
    or value->'version' is distinct from '1'::jsonb
    or value->>'roomId' is distinct from expected_room_id
    or value->>'deviceId' is distinct from expected_device_id
    or vof_relay.is_session_id(value->>'sessionId') is not true
    or vof_relay.is_wire_id(value->>'messageId') is not true then return false; end if;
  if value->>'type' = 'HELLO' then
    return coalesce(vof_relay.has_only_keys(value, array['version','type','roomId','sessionId','deviceId','messageId','nickname','team'], array['version','type','roomId','sessionId','deviceId','messageId','nickname']) is true
      and jsonb_typeof(value->'nickname') = 'string' and char_length(btrim(value->>'nickname')) between 1 and 40
      and (not (value ? 'team') or jsonb_typeof(value->'team') = 'null' or value->>'team' in ('NAVY','GOLD')), false);
  elsif value->>'type' = 'VOTE' then
    return coalesce(vof_relay.has_only_keys(value, array['version','type','roomId','sessionId','deviceId','messageId','questionInstanceId','choice','conviction'], array['version','type','roomId','sessionId','deviceId','messageId','questionInstanceId','choice']) is true
      and vof_relay.is_session_id(value->>'questionInstanceId') is true
      and jsonb_typeof(value->'choice') = 'string' and char_length(value->>'choice') between 1 and 128
      and (not (value ? 'conviction') or (jsonb_typeof(value->'conviction') = 'string' and value->>'conviction' in ('none','hunch','fairly-sure','certain'))), false);
  elsif value->>'type' = 'REACTION' then
    return coalesce(vof_relay.has_only_keys(value, array['version','type','roomId','sessionId','deviceId','messageId','reaction'], array['version','type','roomId','sessionId','deviceId','messageId','reaction']) is true
      and jsonb_typeof(value->'reaction') = 'string'
      and value->>'reaction' in ('wait-really','knew-it','we-do-this','applause','fire'), false);
  elsif value->>'type' = 'PREDICT_WINNER' then
    return coalesce(vof_relay.has_only_keys(value, array['version','type','roomId','sessionId','deviceId','messageId','winner','showdownId'], array['version','type','roomId','sessionId','deviceId','messageId','winner','showdownId']) is true
      and vof_relay.is_wire_id(value->>'winner') is true and vof_relay.is_session_id(value->>'showdownId') is true, false);
  end if;
  return false;
end;
$$;

create function vof_relay.valid_attendee_state(value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
begin
  if coalesce((vof_relay.json_is_safe(value) is not true
    or vof_relay.has_only_keys(value, array['sessionId','registered','nickname','team','vote','result','score','correct','answered','accuracy','bestStreak','rank','totalParticipants','commitments'], array['sessionId','registered','nickname','team','vote','result','score','correct','answered','accuracy','bestStreak','rank','totalParticipants','commitments']) is not true
    or vof_relay.is_session_id(value->>'sessionId') is not true
    or jsonb_typeof(value->'registered') <> 'boolean'
    or jsonb_typeof(value->'nickname') <> 'string' or char_length(value->>'nickname') > 40
    or (jsonb_typeof(value->'team') <> 'null' and value->>'team' not in ('NAVY','GOLD'))
    or vof_relay.is_nonnegative_integer(value->'score') is not true
    or vof_relay.is_nonnegative_integer(value->'correct') is not true
    or vof_relay.is_nonnegative_integer(value->'answered') is not true
    or (jsonb_typeof(value->'accuracy') <> 'null' and (jsonb_typeof(value->'accuracy') <> 'number' or (value->>'accuracy')::numeric < 0 or (value->>'accuracy')::numeric > 100))
    or vof_relay.is_nonnegative_integer(value->'bestStreak') is not true
    or (jsonb_typeof(value->'rank') <> 'null' and vof_relay.is_nonnegative_integer(value->'rank') is not true)
    or vof_relay.is_nonnegative_integer(value->'totalParticipants') is not true
    or jsonb_typeof(value->'commitments') <> 'array' or jsonb_array_length(value->'commitments') > 64), true) then return false; end if;
  if jsonb_typeof(value->'vote') <> 'null' and (
    vof_relay.has_only_keys(value->'vote', array['questionInstanceId','choice','conviction'], array['questionInstanceId','choice','conviction']) is not true
    or vof_relay.is_session_id(value->'vote'->>'questionInstanceId') is not true
    or jsonb_typeof(value->'vote'->'choice') <> 'string' or char_length(value->'vote'->>'choice') > 128
    or jsonb_typeof(value->'vote'->'conviction') <> 'string' or char_length(value->'vote'->>'conviction') > 64
  ) then return false; end if;
  if jsonb_typeof(value->'result') <> 'null' and (
    vof_relay.has_only_keys(value->'result', array['questionInstanceId','choice','isCorrect','points'], array['questionInstanceId','choice','isCorrect','points']) is not true
    or vof_relay.is_session_id(value->'result'->>'questionInstanceId') is not true
    or jsonb_typeof(value->'result'->'choice') <> 'string' or char_length(value->'result'->>'choice') > 128
    or jsonb_typeof(value->'result'->'isCorrect') <> 'boolean'
    or jsonb_typeof(value->'result'->'points') <> 'number'
  ) then return false; end if;
  if exists (
    select 1 from jsonb_array_elements(value->'commitments') item
    where jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 4096
  ) then return false; end if;
  return true;
end;
$$;

create function vof_relay.error_response(reason text)
returns jsonb
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select jsonb_build_object('events', jsonb_build_array(jsonb_build_object('kind', 'ERROR', 'reason', reason)));
$$;

create function public.vof_relay_exchange(p_request jsonb)
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

revoke all on all tables in schema vof_relay from public, anon, authenticated;
revoke all on all sequences in schema vof_relay from public, anon, authenticated;
revoke all on all functions in schema vof_relay from public, anon, authenticated;
revoke all on function public.vof_relay_exchange(jsonb) from public, anon, authenticated;
grant execute on function public.vof_relay_exchange(jsonb) to anon, authenticated;

comment on function public.vof_relay_exchange(jsonb) is
  'Credential-scoped ephemeral exchange for Vax or Fiction rooms; sole client entry point.';
