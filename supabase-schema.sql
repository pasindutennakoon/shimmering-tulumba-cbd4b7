create table if not exists public.employees (
  employee_id text primary key,
  full_name text not null,
  contact text not null,
  ticket_status text not null default 'Paid' check (ticket_status in ('Paid', 'Complimentary')),
  qr_token text unique,
  qr_generated boolean not null default false,
  qr_generated_at timestamptz,
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employees_contact_idx on public.employees(contact);
create index if not exists employees_checked_in_idx on public.employees(checked_in);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists employees_set_updated_at on public.employees;
create trigger employees_set_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

alter table public.employees enable row level security;

-- For this internal event app, the browser app uses the anon key.
-- Keep the Netlify URL private and protect admin/security screens with passcodes.
-- For bank-grade security, replace this with Supabase Auth + server-side functions.
drop policy if exists "event app select" on public.employees;
create policy "event app select"
on public.employees for select
to anon
using (true);

drop policy if exists "event app insert" on public.employees;
create policy "event app insert"
on public.employees for insert
to anon
with check (true);

drop policy if exists "event app update" on public.employees;
create policy "event app update"
on public.employees for update
to anon
using (true)
with check (true);
