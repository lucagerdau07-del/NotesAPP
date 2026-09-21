-- IServ-Aufgaben, die das PC-Script (SchulPilot) für die Notizen-App bereitstellt.
-- Einmal im Supabase-Dashboard (SQL-Editor) ausführen, danach den gemeinsamen
-- Account unter Authentication anlegen (Auto Confirm User).

create table if not exists notesapp.iserv_tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,                        -- Aufgaben-URL, wie tasks.id im Script
  title text not null,
  subject text not null default '',
  due date,                                -- null, wenn die Frist nicht lesbar war
  deadline_raw text not null default '',
  url text not null default '',
  description text not null default '',    -- Originaltext, nicht zensiert
  attachments jsonb not null default '[]', -- [{filename, path, size_bytes}]
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table notesapp.iserv_tasks enable row level security;

drop policy if exists "own iserv tasks" on notesapp.iserv_tasks;
create policy "own iserv tasks"
  on notesapp.iserv_tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant all on notesapp.iserv_tasks to authenticated;

-- Privater Bucket für die Anhänge, Ordner = user_id.
insert into storage.buckets (id, name, public)
values ('notesapp-iserv', 'notesapp-iserv', false)
on conflict (id) do nothing;

drop policy if exists "own iserv files read" on storage.objects;
create policy "own iserv files read"
  on storage.objects for select
  using (bucket_id = 'notesapp-iserv' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own iserv files write" on storage.objects;
create policy "own iserv files write"
  on storage.objects for insert
  with check (bucket_id = 'notesapp-iserv' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own iserv files update" on storage.objects;
create policy "own iserv files update"
  on storage.objects for update
  using (bucket_id = 'notesapp-iserv' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own iserv files delete" on storage.objects;
create policy "own iserv files delete"
  on storage.objects for delete
  using (bucket_id = 'notesapp-iserv' and (storage.foldername(name))[1] = auth.uid()::text);
