-- Add rate_per_test column, keep invoice_amount_payable for backwards compatibility
alter table batches add column if not exists rate_per_test numeric;
