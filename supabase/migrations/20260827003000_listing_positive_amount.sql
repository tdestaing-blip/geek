alter table public.listings
drop constraint listings_asking_amount_nonnegative,
add constraint listings_asking_amount_positive check (
  asking_amount_minor > 0
);
