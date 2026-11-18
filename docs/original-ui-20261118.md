# Selected improvements for the Original

Promote only the five approved features: denser queues in purchased expansions, compact staff cards, the existing red discipline tile before Push, a three-slot badge manager next to inventory badges, and read-only invitation statistics in Settings.

Expanded queues allow 12 places with the right expansion or 16 with both expansions. Base queues remain at seven; people waiting outside enter gradually. Queue paths avoid active tables. Employee actions keep their existing handlers. Earned badges can swap places or be removed separately. Existing inventory rewards and application handlers are retained. Referral statistics use the existing authenticated `/api/friends`; opening Settings grants no rewards.

No supplier UI/rewards, large-table activation, HUD regrouping, shelf replacement, prices, save schema, account migration or database mutation is included. Staging remains separate.

Validation: `tests/original-ui-browser.cjs` runs the real game as a non-admin with all APIs mocked. It checks base/wide/deep queue positions and actual navigation, mobile employee cards, badge swaps/removal/reload, unchanged saved money/staff/season/inventory, and referral counts/pagination/network failures. `tests/badges-service-browser.cjs` checks badge removal and service taps. `tests/referrals-stats.mjs` checks read-only invitation statistics.
