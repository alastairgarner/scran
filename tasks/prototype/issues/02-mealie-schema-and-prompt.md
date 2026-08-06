# What is Mealie's recipe schema and image-import prompt?

Type: research
Status: open

## Question

Mealie is the reference implementation. Extract the two things worth stealing.

**The schema.** From the Mealie repo, the recipe model as it actually exists in code: fields on
a recipe, and specifically the structured ingredient model (reportedly `{quantity, unit, food,
note}` plus a display string). Also: how it stores instructions/steps, servings and yield, times
(prep/cook/total), source URL/attribution, and how it handles the messy real-world cases — a
recipe with ingredient sub-groups ("For the sauce:"), a step that references a quantity, and a
range like "2-3 cloves".

**The prompt.** Mealie's image-import prompt lives in-repo as a prompt file (something like
`parse-recipe-image.txt`, alongside others in the same directory). Find the actual file, read it,
and report it verbatim along with how it's assembled into the API call.

Also note which schema fields exist purely for Mealie features scran doesn't want (meal planning,
households, cookbooks) so they can be dropped.

Answer with: the fields worth keeping, the ingredient model in full, the verbatim prompt, and a
link to each source file.
