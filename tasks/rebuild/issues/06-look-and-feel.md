# What does scran look like?

Type: prototype
Status: open
Blocked by: 03

## Question

The prototype's UI was whatever fell out of 154 lines. This effort has a design system, so the
look is now a decision rather than an accident — and it's the one decision here that can't be
settled by argument. Build something to react to.

The question underneath: **is this a cookbook or an app?** A recipe you cook from on a phone
propped against a bag of flour is a different artifact from a list you browse — big type, high
contrast, ingredients you can find at a glance with wet hands, versus density and navigation.

Prototype, against ticket 03's token structure:

- the **recipe page** — the screen that matters, the one used while cooking
- the **catalogue** — list or grid, what a recipe looks like before you open it, given that most
  have no image beyond the source photo
- enough of **capture** to see how a photo goes in
- the **swap test**: change the tokens and show the whole thing restyled. If that doesn't work
  cheaply, ticket 03's answer was wrong and this ticket found out.

Throwaway code, real content — use the 7 recipes already in `data/scran.db`. Link the prototype
from this ticket.
