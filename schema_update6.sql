-- Kitai sale invoices
create table if not exists kitai_sale_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_date date,
  invoice_number text,
  amount numeric,
  payment_date date,
  animal_ids uuid[] default '{}',
  animal_summaries jsonb default '[]',
  notes text,
  created_at timestamptz default now()
);
alter table kitai_sale_invoices enable row level security;
create policy "Allow authenticated full access" on kitai_sale_invoices
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Add sold_flag and sale_invoice_id to kitai_transfers
alter table kitai_transfers add column if not exists sold_flag boolean default false;
alter table kitai_transfers add column if not exists sale_invoice_id uuid;

-- Add file upload columns to kitai_sale_invoices
alter table kitai_sale_invoices add column if not exists invoice_file_name text;
alter table kitai_sale_invoices add column if not exists invoice_file_url text;

-- Add CSV/weighbridge file columns to kitai_sale_invoices
alter table kitai_sale_invoices add column if not exists csv_file_name text;
alter table kitai_sale_invoices add column if not exists csv_file_url text;
