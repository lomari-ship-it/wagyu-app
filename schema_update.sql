-- Run this in Supabase SQL Editor to add the calf_summaries column
alter table batches add column if not exists calf_summaries jsonb default '[]';
