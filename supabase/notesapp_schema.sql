create schema if not exists notesapp;

create table if not exists notesapp.untis_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  school text,
  server text,
  username text,
  password text,
  updated_at timestamptz default now()
);

alter table notesapp.untis_credentials enable row level security;

create policy "own untis credentials"
  on notesapp.untis_credentials
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Storage bucket for the weekly notes backup (private, per-user folder).
insert into storage.buckets (id, name, public)
values ('notesapp-backups', 'notesapp-backups', false)
on conflict (id) do nothing;

create policy "own backup files read"
  on storage.objects for select
  using (bucket_id = 'notesapp-backups' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own backup files write"
  on storage.objects for insert
  with check (bucket_id = 'notesapp-backups' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own backup files update"
  on storage.objects for update
  using (bucket_id = 'notesapp-backups' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own backup files delete"
  on storage.objects for delete
  using (bucket_id = 'notesapp-backups' and (storage.foldername(name))[1] = auth.uid()::text);

-- Let the anon/authenticated API roles see the notesapp schema.
grant usage on schema notesapp to anon, authenticated;
grant all on notesapp.untis_credentials to anon, authenticated;
