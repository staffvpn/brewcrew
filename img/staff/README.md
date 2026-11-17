# Staff appearance sets — 17 November 2026

PixelLab appearance references and frame-for-frame transfers for BrewCrew's existing animation poses.

- `barista_f`: woman, chestnut ponytail, cream shirt and sage apron.
- `noyabrina`: unique November seasonal employee; copper hair, plum apron and amber leaf pin.
- `cashier_m`: man, short dark hair, cream shirt and chocolate apron.
- `waiter_f`: woman, dark ponytail, charcoal vest and burgundy bow tie.
- `cashier_f`: redesigned woman, chestnut bob, black polo and chocolate apron.
- `washer_f`: redesigned woman, auburn ponytail, blue cap/overalls and yellow gloves.

`crew-20261117-r2.png` is the active transparent sprite atlas. The previous four appearances retain their exact pixels and clip metadata; their original `crew-20261117.png` is kept for clients still using the earlier build. `staff-skin-art.js` contains clip rectangles, cup attachment points, portrait crops and stable foot anchors. Source references were generated as PixelLab job `597a0a06-a645-4132-96e6-16b715d9e01e` (generation `9005a78c-2043-45eb-9c43-9371ad6fef7c`). Animation transfers preserve existing pose sequences and include working, walking and three-quarter phone views. Left-facing directions mirror matching right-facing clips, as with the existing renderer. Calm idle portraits use one stable frame.

An existing employee keeps their ID, name, level, rank, pay and season ownership. Noyabrina is selected by the November reward marker or her existing name, so she does not need to be claimed again. Other new appearances follow the employee's saved gender. Supported roles can recruit both genders; existing employees are not replaced. No new purchases or season reward claims are introduced.

Run `NODE_PATH=/tmp/brewcrew-qa/node_modules node tests/staff-skins-browser.cjs` with the local game served on port 8770; `BC_TEST_URL` can override the URL. Its API routes are mocked, including on a deployed URL.

The first three appearances received an additional PixelLab eye correction (job `bf3ddc91-fbed-4956-b143-9f8e46f35d1c`). Only the revised eye strips were composited into their animation frames, tracking each head; bodies, hair, mouth and outfits keep the original motion. The waitress appearance was retained.

Revision 2 recreates the cashier and washer in PixelLab (reference job `5fe55dcb-c27f-4e16-a514-613d9d3b6ee8`), retaining native 80px frames for readable faces. The cashier register animation has an additional open-eye correction, job `63cf057d-c285-45fb-8d3d-2c4964780d84`. Walking, three-quarter phone, register, washing and floor-cleaning poses are transferred from the existing motion templates. The floor cleaner uses the existing mop prop during stationary floor-cleaning jobs only; it stays hidden while walking, washing dishes or distracted. Standing height is normalized and the mop pose retains its floor clearance. No staff/save migration, pay, abilities, jobs or gameplay timing is changed.

Cashier walking heads were corrected against the bob-haired reference in PixelLab jobs `36f53c95-9ff8-4f67-b540-35b22284b80b`, `1184f1d7-4641-433c-8be7-83ff7cf3e60f` and `a1a8bf25-d0a9-4483-ad06-ed47aa3e9b71`, removing the template cap from all 24 walking frames.

NPC identity repair recognizes full Russian names, substitute prefixes and named legends/prizes. Ordinary mismatched names are replaced deterministically without changing staff IDs, levels, rank, money or abilities; known story characters keep their names and recover their defined gender. Female chefs use the existing female chef sprite and portrait instead of the male animation body. New guest names come from the displayed sprite gender, cached guests are normalized, and named regulars retain their canonical identities. Player names and review authors are not rewritten. Validate with `tests/character-names-browser.cjs`.
