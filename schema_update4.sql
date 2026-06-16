-- Add file URL columns to batches table
alter table batches add column if not exists batch_report_file_name text;
alter table batches add column if not exists batch_report_file_url text;
alter table batches add column if not exists invoice_file_name text;
alter table batches add column if not exists invoice_file_url text;
