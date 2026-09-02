# Research recipe website formats

Type: research
Status: open
Blocked by: none — but not before launch

## Question

Ticket 14 shipped a deliberately narrow URL-import ladder: prefer WP Recipe Maker's structured
recipe-card HTML, then Schema.org Recipe JSON-LD, then recipe microdata/RDFa and visible content.
The two launch test sites both use WP Recipe Maker, whose separate amount, unit, ingredient and note
spans are richer than Schema.org's flattened `recipeIngredient` strings.

**Which recipe formats and generators are common enough to support directly, and what is the
smallest robust parser ladder for them?**

Research representative recipe sites and their underlying generators, including Schema.org
JSON-LD, Microdata/RDFa, WP Recipe Maker and other prevalent recipe-card plugins. Record what each
format preserves for yield, ingredient amount/unit/food/note, sections, instructions and scaling;
how reliably it can be detected; and whether direct parsing beats sending its compact structure to
the model.

Finish with fixtures from several unrelated sites and a recommended ordered parser strategy.
Keep raw HTML as the permanent source regardless: every parser remains replaceable.
