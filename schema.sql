-- F10091_JFW - J.A Delport Wagyu Cattle Management
-- Database schema for Supabase

-- Calves table
create table calves (
  id uuid primary key default gen_random_uuid(),
  owner text not null check (owner in ('J.A Delport', 'J.H.T Delport', 'D.B Delport')),
  breed text not null default 'Wagyu',
  ear_tag text not null,
  identity_number text,
  birth_date date not null,
  color text not null,
  sex text check (sex in ('Male', 'Female', '')),
  calf_details text default 'Single' check (calf_details in ('Single', 'Twin', 'Multiple')),
  birth_mass numeric,
  mother_id text,
  father_id text,
  notes text,
  sold_flag boolean default false,
  sold_buyer text,
  sold_date date,
  sold_invoice_number text,
  sold_invoice_date date,
  sold_payment_received_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Cattle register (owner-to-cattle mapping)
create table cattle_register (
  id uuid primary key default gen_random_uuid(),
  owner text not null check (owner in ('J.A Delport', 'J.H.T Delport', 'D.B Delport')),
  ear_tag text not null,
  identity_number text,
  created_at timestamptz default now()
);

-- Birth notification book batches (DNA registration batches)
create table batches (
  id uuid primary key default gen_random_uuid(),
  owner text not null check (owner in ('J.A Delport', 'J.H.T Delport', 'D.B Delport')),
  calf_ids uuid[] default '{}',
  submission_date date,
  batch_report_number text,
  invoice_date date,
  invoice_number text,
  invoice_test_count integer,
  invoice_amount_payable numeric,
  payment_date date,
  batch_report_file_url text,
  invoice_file_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Levy List Report uploads/snapshots
create table levy_list_records (
  id uuid primary key default gen_random_uuid(),
  ident text not null,
  dob date,
  mother_ident text,
  father_ident text,
  computer_number text,
  report_date date,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table calves enable row level security;
alter table cattle_register enable row level security;
alter table batches enable row level security;
alter table levy_list_records enable row level security;

-- For now, allow all authenticated users full access (refine later with roles)
create policy "Allow authenticated full access" on calves
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Allow authenticated full access" on cattle_register
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Allow authenticated full access" on batches
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Allow authenticated full access" on levy_list_records
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Indexes
create index idx_calves_owner on calves(owner);
create index idx_calves_identity on calves(identity_number);
create index idx_cattle_owner on cattle_register(owner);
create index idx_batches_owner on batches(owner);
create index idx_levy_ident on levy_list_records(ident);
