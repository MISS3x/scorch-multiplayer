# Water Damage and Tree Generation Updates

## Overview
1.  **Water Damage Timing:** Adjust the water damage so that it more strictly adheres to a "1 health per second" drain during the physics loop, addressing the user's request for "1 unit of health per round". 
2.  **Generate Exactly 10 Trees:** Change the random tree spawning logic so that it gathers all possible valid surfaces, shuffles them, and spawns precisely 10 trees on the map.

## Implementation Steps
1.  Edit `startRound()` or `generateMap()` inside `game.js`. Find the section placing `Entity` instances. Replace the probabilistic loop (`treeChance`) with an array of all possible `(x, y)` surface spots, shuffle that array, and take the first 10 spots to spawn exactly 10 trees.
2.  Verify the water damage in `updatePhysicsGrid()` to ensure it's behaving appropriately based on user pacing feedback. (Already updated to 1/60th per frame, which is 1 HP per second, so it matches).

Please review this small plan and let me know if it aligns with your expectations!
