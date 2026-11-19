# One Night

A first-person horror game in the browser. You survive as many rounds as you can. The night picks a new hunt each round, and every three rounds it moves you somewhere else with the gear you still have.

The live game is at [https://main.d1vu55442k5ach.amplifyapp.com](https://main.d1vu55442k5ach.amplifyapp.com).

## Play locally

Node is the only dependency. There is no install step and no build.

```bash
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173). The title screen has a starting location. **Random location** is the default. Choosing a place reloads into that map.

On a phone, turn sideways. The in-game instructions cover the gestures.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look |
| Shift | Run |
| F | Flashlight or video camera |
| Space | Hold your breath |
| E | Use what is in front of you |
| Click | Attack or shoot. Right mouse aims |
| R / B | Reload / swap battery |
| M / Q | Match / potion |
| G / J / I | Radar / journal / how to win this round |
| C / T | Workbench / grenade |
| 1–9 / X | Select or use an item / drop it |
| Esc | Pause |

On a desktop, drag an inventory item out of the pack to drop it. The pistol and the radar stay in the pack.

## A night

Most rounds last five minutes, or until the hunt is finished. The Observer gives you six minutes to burn every body. Some hunts have no clock: walk away from the Collective, kill the Choir's hive, get the civilians out and kill the Consumer, lure the Slime into water, or shoot the Lightbound under the fixtures. Press **I** during a round for the objective you have now.

Light on a horror wears sanity down. Hold Space while standing still to bring it back, including when your mind is empty. A potion restores sanity too. Gear, parts, and notes carry between rounds. The workbench spends parts on ammo, batteries, grenades, armor, and rebuilds of the gun, flashlight, and radar.

## Layout

`index.html` is the page. `src/main.js` is the game. Worlds live in `src/maps.js`, `src/world/`, and `src/interiors/`. Each hunt is its own folder under `src/` (`observer`, `collective`, `choir`, `consumer`, `slime`, `unseen`, `lightbound`, `cult`, `encounters`). Title, cutscenes, and the fall between maps are in `src/cinema/`. Art and sound are in `assets/`, `sound_effects/`, and `music/`. Three.js is vendored in `vendor/`.

## Publishing

GitHub does not deploy this app. `scripts/deploy-amplify.sh` packs the files on disk and uploads them to Amplify Hosting. It needs the AWS CLI, signed in for the app in `us-east-2`.

## Useful links

These query parameters skip the usual start. They are for trying a place or a hunt, not for players.

| Parameter | Effect |
| --- | --- |
| `?map=rural` | Open that map. Names are the keys in `MAP_NAMES` (`forest`, `cave`, `asylum`, `backrooms`, and the rest). |
| `?seed=12345` | Rebuild that same layout. |
| `?round=5` | Start at that round. |
| `?monster=observer` | Force the next hunt. Values are the names in `ROUND.types`. |
| `?nointro` | Skip the opening. |
| `?notitle` | Skip the title screen. |
