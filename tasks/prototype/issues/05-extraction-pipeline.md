# Photo in, structured recipe out

Type: task
Status: open
Blocked by: 01, 02, 03, 04

## Question

The core of the prototype, and the thing worth feeling early: upload a photo, get a recipe back.

- An endpoint that accepts an image upload
- Calls the model chosen in ticket 01, using the prompt from ticket 02 as a starting point
- Returns a recipe validated against the schema from ticket 03 — reject/surface anything that
  doesn't fit rather than silently half-parsing
- The API key comes from the environment

Then test it against real books off my own shelf, not clean screenshots. Note where it fails —
that failure list is what tells the map whether multi-photo capture and a hand-edit path need
to graduate out of the fog.

Keep the errors visible rather than handled. Knowing how it breaks is the point.
