-- Optional reachability for native four-character show codes and authenticated
-- session reads. Apply only with a database login.
--
-- Until this lands, the React host maps room ids onto the existing six-character
-- check and writes public.vrc_sessions / public.vrc_recaps the classic way.
-- Do not enable RLS here: anon insert/select on recaps is what the live archive uses.

alter table public.vrc_sessions
  drop constraint if exists vrc_sessions_room_check;

alter table public.vrc_sessions
  add constraint vrc_sessions_room_check
  check (room ~ '^[23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ]{4,6}$');

alter table public.vrc_recaps
  drop constraint if exists vrc_recaps_room_check;

alter table public.vrc_recaps
  add constraint vrc_recaps_room_check
  check (room ~ '^[23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ]{4,6}$');

grant select on table public.vrc_sessions to authenticated;
