# Staff behavior and sheet scrolling

The retired staff talk action, its respect wish and its discipline handler are removed. Loading an existing save clears only that retired wish, without a morale penalty. Meaningful story/event decisions remain. The fault triangle and incident exclamation overlays above staff are gone; staff cards and Tasks still describe actual problems.

The existing red discipline tile is the first action and is explicitly assigned to grid column one, including cards with priority, distraction-return, fine and training actions. It keeps the existing action handler and does not move into the modal heading.

Waiter walking uses a 54-unit base with a bounded condition multiplier instead of the previous 34-unit crawl. Existing world movement/dirt and collision logic still applies. Idle destinations now use free aisles, and invalid destinations are filtered before selection so targets do not repeatedly jump between tables. No staff artwork or identities are replaced.

Resignation risk interpolates from the existing 0.4% healthy baseline to the existing 6% poor-condition maximum per closing shift, with the existing unpaid-wage and legendary adjustments. Bonuses and praise improve condition but do not grant immunity. Requests for rest are weighted toward tired staff. Rare hourly rest requests and competing offers can occur while the cafe is open; one new hourly request/offer per cafe day, no overlapping personnel decision, no offer for owner/new recruits before three worked shifts. Poaching uses the existing visible incident pipeline and an active rival; it does not silently delete staff. Raise/promotion/vacation retention choices in the main departure incidents have explicit success and failure outcomes. No weekly schedules are added.

Sheet bodies scroll vertically and cannot pan sideways. Nested shop category strips and carousels keep horizontal scrolling. Horizontal gesture interception excludes form controls and genuine nested horizontal scrollers; scroll offsets on sheet/modal roots are reset to zero. Long content wraps inside cards. Desktop sheets retain their existing maximum width.

Tests use a non-admin, mock every API, and do not modify real accounts:
- staff-behavior-browser.cjs: eight mobile action layouts, old-save cleanup, absent exclamation overlays, waiter movement/idle stability for both sexes and poor/good condition, real rest absence, rare competing offer, explicit probabilistic departure.
- panel-scroll-browser.cjs: 11 tabs at mobile and desktop sizes, sideways gestures/offsets, vertical inventory scrolling and horizontal shop navigation.
- original-ui-browser.cjs: queue, badge, referral and save-preservation regression.
