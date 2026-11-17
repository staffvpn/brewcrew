# Nikita and Filya — PixelLab draft

Both are separate characters created from scratch in PixelLab on 17 November 2026:

- Nikita: `833cee34-65d0-4437-b730-4da1f408d788`, character job `5dbf6cbc-c20c-4c6b-bb3b-685948bc86ec`.
- Filya: `671c3e89-402f-4ec6-a6cc-7e52db2b62ac`, character job `badcbcdf-b4c7-43ed-a160-68e0404cab19`.

The shipped atlas uses only these PixelLab outputs. It contains eight resting views and five walking directions per character (west-facing walking views mirror east-facing views), with 8-frame walking loops and 4-frame front idle loops. The additional reference frame in raw API responses is excluded from loops. Sprite packing aligns feet and keeps the apparent height consistent across directions.

`nikita-icon.png` shows Nikita with Filya standing beside him. In the cafe, they have independent position, direction, animation, depth sorting and navigation. Filya follows at a short distance, waits at the entrance to keep clear of Nikita, and follows him out. Both use the existing special-guest furniture and actor collision logic.

The collection card is informational. There is no automatic arrival, story, task, reward, progress flag or save migration for this draft. An administrator in Adminskaya can start the temporary walk preview; normal players cannot. The preview does not alter money, reputation, season or saved character progress and does not appear when visiting another cafe.

Validation: `tests/nikita-filya-browser.cjs` mocks all APIs and checks normal-user gating, 5-direction walking/idle clips, separate actors, complete tours through ordinary and expanded cafes, furniture/guest avoidance and unchanged progress. Existing staff-art and service tests remain applicable.
