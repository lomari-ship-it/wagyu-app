alter table cattle_register add column if not exists transfer_type text check (transfer_type in ('sold', null));
alter table cattle_register add column if not exists transfer_date date;
alter table cattle_register add column if not exists transfer_customer text;
alter table cattle_register add column if not exists transfer_invoice_number text;
alter table cattle_register add column if not exists archived boolean default false;
