import type { RecipeContent, TagId } from '@scran/shared';
import { normaliseTags, recipeContentSchema, TAGS } from '@scran/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Fragment, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useFieldArray, useForm } from 'react-hook-form';

import { editRecipe, recipeKeys, updateRecipeTags } from '../api/recipes';
import { ingredientFromText } from '../ingredient-edit';
import { Button, Field } from '../ui';

const nullableText = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : null;
const nullableNumber = (value: unknown) =>
  value === '' || value === null ? null : Number(value);

export function RecipeEditor({
  id,
  content,
  tags,
  onClose,
}: {
  id: number;
  content: RecipeContent;
  tags: string[];
  onClose: () => void;
}) {
  const form = useForm<RecipeContent>({ defaultValues: content });
  const [selectedTags, setSelectedTags] = useState(normaliseTags(tags));
  const savedContent = useRef(JSON.stringify(content));
  const savedTags = useRef(JSON.stringify(normaliseTags(tags).sort()));
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async (values: RecipeContent) => {
      const parsed = recipeContentSchema.parse(values);
      const nextContent = JSON.stringify(parsed);
      if (nextContent !== savedContent.current) {
        await editRecipe(id, parsed);
        savedContent.current = nextContent;
      }
      const nextTags = normaliseTags(selectedTags);
      if (JSON.stringify([...nextTags].sort()) !== savedTags.current) {
        await updateRecipeTags(id, nextTags);
        savedTags.current = JSON.stringify([...nextTags].sort());
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: recipeKeys.all });
      onClose();
    },
  });
  const toggleTag = (tag: TagId) =>
    setSelectedTags(current =>
      current.includes(tag)
        ? current.filter(item => item !== tag)
        : [...current, tag],
    );

  return (
    <main className="mx-auto max-w-2xl px-4 py-4">
      <form
        className="space-y-8"
        onSubmit={event =>
          void form.handleSubmit(values => save.mutate(values))(event)
        }
      >
        <header className="bg-background sticky top-0 z-10 flex items-center justify-between gap-4 py-3">
          <h1 className="type-title font-bold">Edit recipe</h1>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={save.isPending}
              onClick={onClose}
              className="text-ink-muted min-h-11 px-3 underline"
            >
              Cancel
            </button>
            <Button disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Done'}
            </Button>
          </div>
        </header>
        {save.error && (
          <p role="alert" className="text-danger">
            {save.error.message}
          </p>
        )}
        <fieldset
          disabled={save.isPending}
          className="space-y-8 disabled:opacity-50"
        >
          <Field
            label="Recipe name"
            error={form.formState.errors.name?.message}
            {...form.register('name', {
              required: 'Give this recipe a name.',
              validate: value =>
                Boolean(value.trim()) || 'Give this recipe a name.',
            })}
          />
          <Lines
            form={form}
            name="ingredients"
            label="Ingredient"
            heading="Ingredients"
          />
          <Lines
            form={form}
            name="instructions"
            label="Step"
            heading="Method"
          />
          <Lines form={form} name="notes" label="Note" heading="Notes" />
          <section className="space-y-4">
            <h2 className="type-body font-bold">Details</h2>
            <Field
              label="Description"
              {...form.register('description', { setValueAs: nullableText })}
            />
            <Field
              label="Yield (as written)"
              {...form.register('recipeYield', { setValueAs: nullableText })}
            />
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Yield quantity"
                type="number"
                min="0"
                step="any"
                {...form.register('yieldQuantity', {
                  setValueAs: nullableNumber,
                })}
              />
              <Field
                label="Yield unit"
                {...form.register('yieldUnit', { setValueAs: nullableText })}
              />
              <Field
                label="Prep time"
                {...form.register('prepTime', { setValueAs: nullableText })}
              />
              <Field
                label="Cook time"
                {...form.register('performTime', { setValueAs: nullableText })}
              />
              <Field
                label="Total time (as written)"
                {...form.register('totalTime', { setValueAs: nullableText })}
              />
              <Field
                label="Total minutes"
                type="number"
                min="0"
                step="1"
                {...form.register('totalMinutes', {
                  setValueAs: nullableNumber,
                })}
              />
            </div>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={form.watch('timeEstimated') === true}
                onChange={event =>
                  form.setValue('timeEstimated', event.target.checked)
                }
              />
              Total minutes are an estimate
            </label>
          </section>
          <section>
            <h2 className="type-body mb-3 font-bold">Tags</h2>
            <div className="grid grid-cols-2 gap-3">
              {TAGS.map(tag => (
                <label
                  key={tag.id}
                  className="flex min-h-11 items-center gap-3"
                >
                  <input
                    type="checkbox"
                    checked={selectedTags.includes(tag.id)}
                    onChange={() => toggleTag(tag.id)}
                  />
                  {tag.label}
                </label>
              ))}
            </div>
          </section>
        </fieldset>
      </form>
    </main>
  );
}

function Lines({
  form,
  name,
  label,
  heading,
}: {
  form: UseFormReturn<RecipeContent>;
  name: 'ingredients' | 'instructions' | 'notes';
  label: string;
  heading: string;
}) {
  const { fields, insert, remove, move } = useFieldArray({
    control: form.control,
    name,
  });
  const [moving, setMoving] = useState<number | null>(null);
  const add = (index: number) => {
    const line =
      name === 'ingredients'
        ? ingredientFromText({ text: '', title: null })
        : { title: null, text: '' };
    insert(index, line);
    setMoving(null);
  };
  const place = (gap: number) => {
    if (moving !== null) {
      move(moving, moving < gap ? gap - 1 : gap);
      setMoving(null);
    }
  };
  const gap = (index: number) =>
    moving === null ? (
      <button
        type="button"
        onClick={() => add(index)}
        aria-label={`Add ${label.toLowerCase()} at position ${index + 1}`}
        className="text-accent min-h-11 w-full"
      >
        + Add {label.toLowerCase()}
      </button>
    ) : (
      <button
        type="button"
        disabled={index === moving || index === moving + 1}
        onClick={() => place(index)}
        aria-label={`Place ${label.toLowerCase()} at position ${index + 1}`}
        className="text-accent border-line rounded-ui min-h-11 w-full border border-dashed disabled:opacity-30"
      >
        Place here
      </button>
    );

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="type-body font-bold">{heading}</h2>
        {moving !== null && (
          <button
            type="button"
            className="text-accent min-h-11 underline"
            onClick={() => setMoving(null)}
          >
            Cancel move
          </button>
        )}
      </div>
      {fields.map((line, index) => {
        const text = form.register(`${name}.${index}.text`, {
          validate: value =>
            Boolean(value.trim()) || 'Write this line or remove it.',
        });
        const error = form.formState.errors[name]?.[index]?.text?.message;
        return (
          <Fragment key={line.id}>
            {gap(index)}
            <div
              className={`rounded-ui border-line bg-panel border p-4 ${moving === index ? 'ring-accent ring-2' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor={`${name}-${line.id}`}
                  className="type-label font-semibold"
                >
                  {label} {index + 1}
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    aria-label={`Move ${label.toLowerCase()} ${index + 1}`}
                    onClick={() => setMoving(index)}
                    className="text-ink-muted min-h-11 underline"
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
                    onClick={() => {
                      const title = form.getValues(`${name}.${index}.title`);
                      if (
                        title &&
                        fields[index + 1] &&
                        !form.getValues(`${name}.${index + 1}.title`)
                      ) {
                        form.setValue(`${name}.${index + 1}.title`, title);
                      }
                      remove(index);
                      setMoving(null);
                    }}
                    className="text-danger min-h-11 underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {name !== 'instructions' && (
                <input
                  aria-label={`${label} ${index + 1} section title`}
                  placeholder="Section title (optional)"
                  className="border-line bg-background rounded-ui mb-3 min-h-11 w-full border px-3"
                  {...form.register(`${name}.${index}.title`, {
                    setValueAs: nullableText,
                  })}
                />
              )}
              <textarea
                id={`${name}-${line.id}`}
                rows={3}
                className="border-line bg-background rounded-ui w-full border px-3 py-3"
                {...text}
                onChange={event => {
                  void text.onChange(event);
                  if (name === 'ingredients') {
                    const parsed = ingredientFromText({
                      text: event.target.value,
                      title: form.getValues(`ingredients.${index}.title`),
                    });
                    form.setValue(
                      `ingredients.${index}.quantity`,
                      parsed.quantity,
                    );
                    form.setValue(`ingredients.${index}.unit`, parsed.unit);
                    form.setValue(`ingredients.${index}.food`, parsed.food);
                    form.setValue(`ingredients.${index}.note`, parsed.note);
                  }
                }}
              />
              {error && (
                <p role="alert" className="text-danger mt-2">
                  {error}
                </p>
              )}
            </div>
          </Fragment>
        );
      })}
      {gap(fields.length)}
    </section>
  );
}
