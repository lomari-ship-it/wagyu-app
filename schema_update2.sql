-- Add fields for breeding animals
alter table cattle_register add column if not exists breed text;
alter table cattle_register add column if not exists sex text;
alter table cattle_register add column if not exists date_of_birth date;
alter table cattle_register add column if not exists animal_type text default 'general' check (animal_type in ('breeding', 'general'));
