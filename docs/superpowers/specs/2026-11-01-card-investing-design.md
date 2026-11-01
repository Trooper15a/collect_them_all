# Card Investing and Card Show market checks

The user delegated design choices, then clarified that the offer checker belongs in the existing Card Show tab. Deliver both market discovery and an explanation of an actual offer without duplicating the calculator.

## Card Investing

A Pokémon singles market board at `/investing` covers the imported catalog, including cards the user does not own. Separate Biggest gainers, Biggest decliners, Research shortlist and Caution lists. Allow 7/30/90-day ranking, market source, language and display-currency budget filters. Show the exact printing and variant, price, absolute and percentage changes, baseline date, price timestamp and plain-language reasons. “Research” means screening criteria passed, never predicted returns. Empty catalog/history states explain the missing data without invented examples.

Use only positive market reference prices from one consistent source and variant for comparisons. Baselines must precede the requested date by at most six days; label their actual dates. Suppress unknown, future or stale current references. Do not interpolate gaps or infer sales volume, liquidity, reprints or intrinsic value. Sparse observations, insufficient 30-day coverage, stale prices, sharp rises and declines yield explicit cautions. History count describes observations, not trades.

## Card Show

Add market context inside Buying using the existing card selection and seller asking amount. For a single card entry, divide the bundle asking amount by its quantity before comparing unit values. Multiple entries get individual trend context without allocating the bundle asking price. Exact source/variant metadata accompanies newly added catalog price options; old drafts remain valid. Manual or condition/grade-adjusted entries retain the existing cash calculator but cannot receive a catalog-based positive investment verdict.

The market check gives Good buy on price / Negotiate / Pass at this price / Check the data first, with reasons, a user-selected buy target and the existing market chart. Positive results require fresh data, sufficient history, no sharp-move risk, a matching raw reference and explicit confirmation of printing and condition. Explain that acquisition costs and selling fees can erase the apparent discount. Links from Investing start a focused one-card offer check for the exact card/source/variant and clear the previous asking price. Keep one complete, bounded backup of the account-scoped draft with a Restore previous deal button; successive offer checks preserve this original backup, including after reload. Show focused market context immediately below the existing asking-price input. Ordinary multi-card Card Show calculations continue to work separately.

## Implementation and validation

Pure financial calculations and deterministic market screening live separately from catalog database reads and React components. Public APIs return catalog data only; preserve existing private route protection. Query all imported Pokémon singles, aggregate small history summaries in PostgreSQL and cache the market board briefly. Detail reads fetch only one card's history. Avoid provider network calls on each screen render and avoid schema migrations.

Test exact-variant isolation, missing/invalid amounts, cross-currency failures, stale/future data, baseline tolerance, spike/decline risks, quantity handling, condition confirmation and market-wide ranking. Validate public endpoints, typecheck, targeted lint, existing calculator regressions, and mobile browser interactions with deterministic catalog fixtures.
