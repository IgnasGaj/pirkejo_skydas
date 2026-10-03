-- Preserve historical rows for correction while enforcing the shared contract
-- for new and edited purchases. Existing outliers can be edited in the vault.
alter table public.purchases
  add constraint purchases_complaint_price_limit check (price_cents is null or price_cents <= 100000000) not valid,
  add constraint purchases_product_single_line check (product_name !~ '[[:cntrl:]]' and position(chr(8232) in product_name) = 0 and position(chr(8233) in product_name) = 0) not valid,
  add constraint purchases_seller_single_line check (seller_name !~ '[[:cntrl:]]' and position(chr(8232) in seller_name) = 0 and position(chr(8233) in seller_name) = 0) not valid,
  add constraint purchases_reference_single_line check (reference_number is null or (reference_number !~ '[[:cntrl:]]' and position(chr(8232) in reference_number) = 0 and position(chr(8233) in reference_number) = 0)) not valid;
