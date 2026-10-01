-- ============================================================
-- Campus Connect — Supabase schema
-- Run this once, in a NEW Supabase project's SQL editor
-- (Project → SQL Editor → New query → paste this whole file → Run).
-- ============================================================

-- ---------- profiles ----------
-- One row per user. `id` matches the auth.users id Supabase already
-- creates when someone signs up — we're not duplicating identity, just
-- attaching campus-specific info to it.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  name text not null,
  faculty text,
  department text,
  level text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Usernames must be unique, case-insensitively ("Aisha" and "aisha" are
-- the same username) — this is what makes "username taken" actually work.
create unique index profiles_username_lower_idx on profiles (lower(username));

alter table profiles enable row level security;

create policy "profiles_select_all"
  on profiles for select
  to authenticated
  using (true);

create policy "profiles_insert_own"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on profiles for update
  to authenticated
  using (auth.uid() = id);


-- ---------- get_email_for_username ----------
-- Supabase Auth logs people in with an email, not a username — but we
-- only ever show students a username. This function is the bridge: given
-- a username, it looks up the matching email so the login/forgot-password
-- screens can call the real Supabase Auth functions underneath.
-- SECURITY DEFINER + a narrow return (just the one email, only when the
-- username matches) keeps this from turning into a general "read anyone's
-- email" hole — it's the one specific lookup login needs, nothing more.
create or replace function get_email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(p.username) = lower(p_username)
  limit 1;
$$;

grant execute on function get_email_for_username(text) to anon, authenticated;


-- ---------- username_available ----------
-- Lets the signup screen check "is this username taken?" in real time,
-- before an account even exists yet (so before the person is authenticated).
-- Returns only a boolean — never exposes which account owns a taken name.
create or replace function username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from profiles where lower(username) = lower(p_username)
  );
$$;

grant execute on function username_available(text) to anon, authenticated;


-- ---------- posts ----------
create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  media_type text,        -- 'image' | 'video' | null
  media_urls text[],       -- one or more Storage URLs (images can be up to 3; video is just one)
  created_at timestamptz not null default now()
);

alter table posts enable row level security;

create policy "posts_select_all"
  on posts for select
  to authenticated
  using (true);

create policy "posts_insert_own"
  on posts for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "posts_delete_own"
  on posts for delete
  to authenticated
  using (auth.uid() = author_id);


-- ---------- comments ----------
create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

alter table comments enable row level security;

create policy "comments_select_all"
  on comments for select
  to authenticated
  using (true);

create policy "comments_insert_own"
  on comments for insert
  to authenticated
  with check (auth.uid() = author_id);


-- ---------- likes ----------
-- One row per (post, person) — the primary key itself is what stops
-- someone liking the same post twice.
create table likes (
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table likes enable row level security;

create policy "likes_select_all"
  on likes for select
  to authenticated
  using (true);

create policy "likes_insert_own"
  on likes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "likes_delete_own"
  on likes for delete
  to authenticated
  using (auth.uid() = user_id);


-- ---------- marketplace_listings ----------
create table marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  price numeric not null check (price >= 0),
  category text not null,
  contact text,               -- optional WhatsApp/phone number, seller's choice
  images text[] not null default '{}',  -- up to 3 Storage URLs, same 'post-media' bucket as posts
  status text not null default 'active' check (status in ('active', 'sold')),
  created_at timestamptz not null default now()
);

alter table marketplace_listings enable row level security;

create policy "listings_select_all"
  on marketplace_listings for select
  to authenticated
  using (true);

create policy "listings_insert_own"
  on marketplace_listings for insert
  to authenticated
  with check (auth.uid() = seller_id);

create policy "listings_update_own"
  on marketplace_listings for update
  to authenticated
  using (auth.uid() = seller_id);

create policy "listings_delete_own"
  on marketplace_listings for delete
  to authenticated
  using (auth.uid() = seller_id);


-- ---------- notifications ----------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  type text not null,      -- 'like' | 'comment'
  post_id uuid references posts(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

create policy "notifications_select_own"
  on notifications for select
  to authenticated
  using (auth.uid() = recipient_id);

-- Anyone can create a notification FOR someone else (e.g. Aisha liking
-- Chidi's post creates a notification where recipient = Chidi), but only
-- as themselves as the actor — you can't fake who performed the action.
create policy "notifications_insert_as_self"
  on notifications for insert
  to authenticated
  with check (auth.uid() = actor_id);

create policy "notifications_update_own"
  on notifications for update
  to authenticated
  using (auth.uid() = recipient_id);


-- ============================================================
-- Storage — avatars and post media
-- ============================================================
-- Run this part too — it creates two public buckets and the policies
-- that let people upload into their own folder only.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do nothing;

-- Anyone can view avatars/post media (they're public profile pictures and
-- public posts, same as the rest of the feed).
create policy "avatars_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

create policy "post_media_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'post-media');

-- People can only upload into a folder named after their own user id
-- (e.g. avatars/<their-uuid>/photo.jpg) — stops anyone overwriting or
-- filling up someone else's folder.
create policy "avatars_upload_own_folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "post_media_upload_own_folder"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
