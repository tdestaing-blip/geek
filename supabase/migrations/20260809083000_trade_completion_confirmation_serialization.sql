-- Close write skew between concurrent trusted confirmation inserts.
--
-- Two concurrent direct INSERTs into trade_completion_confirmations could each
-- observe confirmation_count = 1 in their deferred integrity checks and both
-- commit, leaving an accepted TradeOffer with two confirmations and no
-- TradeCompletion.
--
-- Every confirmation INSERT now takes SELECT ... FOR UPDATE on the parent
-- TradeOffer before the row is written. Concurrent confirmation creators
-- therefore serialize on that row, and the deferred integrity check of the
-- later transaction sees the earlier confirmation.
--
-- confirm_trade_completion already locks the TradeOffer after the Copy locks,
-- so the RPC path re-acquires a lock it already holds and does not change its
-- Copy-first order.

create or replace function public.validate_trade_completion_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_offer public.trade_offers%rowtype;
begin
  select offer.*
  into parent_offer
  from public.trade_offers as offer
  where offer.id = new.trade_offer_id
  for update;

  if not found then
    raise exception 'Referenced TradeOffer does not exist.'
      using errcode = '23503';
  end if;

  if new.user_id not in (parent_offer.proposer_id, parent_offer.recipient_id) then
    raise exception 'Only a TradeOffer participant may confirm the exchange.'
      using errcode = '23514';
  end if;

  if parent_offer.status <> 'accepted' then
    raise exception 'Only an accepted TradeOffer may be confirmed.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_trade_completion_confirmation()
from public, anon, authenticated;
