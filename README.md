# FVTT-DD-Importer
Allows importing Universal VTT map files into FoundryVTT.

**Version 2.4.0**

Manifest: `https://raw.githubusercontent.com/moo-man/FVTT-DD-Import/master/module.json`


## Usage Instructions

1. Export your map with the Universal VTT option in [DungeonFog](https://dungeonfog.com/), [Dungeondraft](https://dungeondraft.net/), or [Arkenforge](https://arkenforge.com).
2. Go to the scene tab in FVTT, click the *Universal Battlemap import* button.
3. Fill in the scene name, a path to where the image is to be saved, and the fidelity/offset options.  
  a. **Fidelity**: How many cave walls are used. Far left - less walls, better performance, Far right - more walls, worse performance  
  b. **Offset**: How much to nudge the walls away from the edge.

  If you don't use S3, make sure the storage type is set to User Data and ignore the S3 fields.
