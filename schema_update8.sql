-- Add batch submission form file columns to batches
alter table batches add column if not exists submission_file_name text;
alter table batches add column if not exists submission_file_url text;
