# Staff appearance sets — 17 November 2026

PixelLab appearance references and frame-for-frame transfers for BrewCrew's existing animation poses.

- `barista_f`: woman, chestnut ponytail, cream shirt and sage apron.
- `noyabrina`: unique November seasonal employee; copper hair, plum apron and amber leaf pin.
- `cashier_m`: man, short dark hair, cream shirt and chocolate apron.
- `waiter_f`: woman, dark ponytail, charcoal vest and burgundy bow tie.

`crew-20261117.png` is the transparent native sprite atlas. `staff-skin-art.js` contains clip rectangles, cup attachment points, portrait crops and stable foot anchors. Source references were generated as PixelLab job `597a0a06-a645-4132-96e6-16b715d9e01e` (generation `9005a78c-2043-45eb-9c43-9371ad6fef7c`). Animation transfers preserve existing pose sequences and include working, walking and three-quarter phone views. Left-facing directions mirror matching right-facing clips, as with the existing renderer. Calm idle portraits use one stable frame.

An existing employee keeps their ID, name, level, rank, pay and season ownership. Noyabrina is selected by the November reward marker or her existing name, so she does not need to be claimed again. Other new appearances follow the employee's saved gender. Supported roles can recruit both genders; existing employees are not replaced. No new purchases or season reward claims are introduced.

Run `NODE_PATH=/tmp/brewcrew-qa/node_modules node tests/staff-skins-browser.cjs` with the local game served on port 8770; `BC_TEST_URL` can override the URL. Its API routes are mocked, including on a deployed URL.

The first three appearances received an additional PixelLab eye correction (job `bf3ddc91-fbed-4956-b143-9f8e46f35d1c`). Only the revised eye strips were composited into their animation frames, tracking each head; bodies, hair, mouth and outfits keep the original motion. The waitress appearance was retained.
