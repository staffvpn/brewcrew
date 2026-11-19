# Supplier cup goals (Admin only)

Each supplier has its own earned gift wallet: Morning delivery 60 cups, Bar delivery 140 cups, Chef delivery 300 cups. A real cup sale advances all three independent tracks. Opening a gift consumes only its supplier's earned ticket. Existing opening prices, time/expansion access gates, prize weights, admin-issued credits and the first welcome gift are unchanged.

Progress now listens to successful `sellOne` results with `item.need.cups`, instead of generic task progress. Dessert sales and synthetic task calls do not count. Offline simulation is explicitly excluded for its full call duration, in addition to quiet/hidden/inactive-Telegram/save-write checks. Online sale proceeds may still accrue according to the existing game economy; only earned cup progress is restricted to foreground play.

Version 3 migrates old universal gift tickets and the partial 60-order track to the first supplier exactly once. Other tracks start from zero, without granting gifts retrospectively for offline earnings. Existing owned items, pending results, history, pity, seals, budget, time and issued admin credits remain intact. Gift wallets survive reload and cafe sale.

Tests: supplier-rules.cjs covers all goal boundaries, independent wallets and idempotent v2 migration; supplier-cups-browser.cjs covers real sales, typed gift consumption, all offline exclusions, reload/cafe sale and UI meters; supplier-lab-browser.cjs covers existing opening/rollback/collection behavior with the new wallets.
