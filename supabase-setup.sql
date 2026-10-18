-- Run this entire script in Supabase: SQL Editor > New query > Run.
-- It creates a private PDF bucket, a documents table, and owner-only security policies.

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  category text not null default 'Other',
  document_date date,
  notes text,
  storage_path text not null,
  original_file_name text not null,
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;

drop policy if exists "Users can read own documents" on public.documents;
create policy "Users can read own documents"
on public.documents for select to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can add own documents" on public.documents;
create policy "Users can add own documents"
on public.documents for insert to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "Users can delete own documents" on public.documents;
create policy "Users can delete own documents"
on public.documents for delete to authenticated
using (auth.uid() = owner_id);

-- Private bucket. Files are limited to 50 MB and PDF MIME type.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = array['application/pdf'];

drop policy if exists "Users can upload PDFs to their own folder" on storage.objects;
create policy "Users can upload PDFs to their own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read PDFs in their own folder" on storage.objects;
create policy "Users can read PDFs in their own folder"
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete PDFs in their own folder" on storage.objects;
create policy "Users can delete PDFs in their own folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
