-- Add rate_per_test column, keep invoice_amount_payable for backwards compatibility
alter table batches add column if not exists rate_per_test numeric;

-- Late registration invoices table
create table if not exists late_reg_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_date date,
  invoice_number text,
  rate_per_registration numeric,
  amount_payable numeric,
  payment_date date,
  invoice_file_name text,
  invoice_file_url text,
  calf_ids uuid[] default '{}',
  calf_summaries jsonb default '[]',
  created_at timestamptz default now()
);
alter table late_reg_invoices enable row level security;
create policy "Allow authenticated full access" on late_reg_invoices
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
