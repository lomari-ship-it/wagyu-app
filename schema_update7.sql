-- Add mother_id and father_id to cattle_register
alter table cattle_register add column if not exists mother_id text;
alter table cattle_register add column if not exists father_id text;
alter table cattle_register add column if not exists deceased boolean default false;

-- Add deceased to calves
alter table calves add column if not exists deceased boolean default false;
