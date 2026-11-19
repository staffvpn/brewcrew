# Guest-style staff walking and continuous checkout

PixelLab transfer-outfit-v2 generated 90 frames for male/female waiters and the female cleaner from the existing staff appearance references and the current guest/guestm six-frame directional walks. Five native views cover eight headings through the existing mirroring logic. New frames are appended to `crew-20261119-guest-walk.png`; the entire prior atlas and all idle/work/phone clip metadata remain unchanged. Packing aligns the feet, scales to the established idle height and locks each directional head to its first frame so eyes/hair do not change between steps. New clips mark `guestWalkStable`, use the existing guest distance stride (4.6), and bypass old eye masks whose coordinates refer to the previous atlas regions.

Floor staff use guest-level movement speed, with the existing navigation, dirt multiplier and a bounded improvement for trained employees. Walking remains distinct from cleaning/work speed, and the cleaner still completes the existing jobs and routes through the bar exit.

The old artificial 6–15 second wall-clock stalls after a checkout bar was already complete are removed, including stale future stall timers. A checkout accepts only its queued head once, preventing a late duplicate call from adding another sale. Non-finite legacy progress and unknown guest pace types recover to a normal order instead of poisoning the queue progress with NaN. Normal staff distractions, breaks, stock requirements and order/preparation work remain.

Tests: staff-guest-walk-browser.cjs checks 144 rendered frame/direction combinations, mirrored headings, fixed heads, byte-for-byte retained prior atlas pixels and real cleaner movement/work. cashier-continuity-browser.cjs checks completed/stale-timer checkout, exact-once sales, and automatic service with malformed legacy pace/progress. original-ui-browser.cjs and staff-behavior-browser.cjs check the previously published queue/UI/save and employee behavior.

Supplier bags remain Admin-only; no supplier code is promoted into the Original.
