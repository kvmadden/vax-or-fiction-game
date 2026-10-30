-- The game store uses -1 as the pre-question slide sentinel. The original
-- relay validator admitted only nonnegative indices, so the first projected
-- mode-picker and lobby snapshots were rejected before phones could join.

create function vof_relay.is_slide_index(value jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select case
    when jsonb_typeof(value) is distinct from 'number' then false
    when value::text !~ '^-?(0|[1-9][0-9]*)$' then false
    else value::numeric between -1 and 9007199254740991
  end
$$;

create or replace function vof_relay.valid_room_state(value jsonb, expected_room_id text, previous_revision bigint)
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
    or vof_relay.is_slide_index(value->'slideIndex') is not true
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

revoke all on function vof_relay.is_slide_index(jsonb) from public, anon, authenticated;
revoke all on function vof_relay.valid_room_state(jsonb, text, bigint) from public, anon, authenticated;
