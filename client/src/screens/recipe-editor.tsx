import type { RecipeContent, TagId } from '@scran/shared';
import { normaliseTags, recipeContentSchema, TAGS } from '@scran/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Fragment, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useFieldArray, useForm } from 'react-hook-form';

import { editRecipe, recipeKeys, updateRecipeTags } from '../api/recipes';
import { ingredientFromText } from '../ingredient-edit';
import {
  Button,
  Checkbox,
  Feedback,
  Field,
  PageHeader,
  Section,
  Textarea,
} from '../ui';

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
        <PageHeader
          title="Edit recipe"
          sticky
          actions={
            <>
              <Button
                variant="quiet"
                disabled={save.isPending}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
            </>
          }
        />
        {save.error && <Feedback tone="error">{save.error.message}</Feedback>}
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
          <Section title="Details">
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
            <Checkbox
              label="Total minutes are an estimate"
              checked={form.watch('timeEstimated') === true}
              onChange={event =>
                form.setValue('timeEstimated', event.target.checked)
              }
            />
          </Section>
          <Section title="Tags">
            <div className="grid grid-cols-2 gap-3">
              {TAGS.map(tag => (
                <Checkbox
                  key={tag.id}
                  label={tag.label}
                  checked={selectedTags.includes(tag.id)}
                  onChange={() => toggleTag(tag.id)}
                />
              ))}
            </div>
          </Section>
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
      <Button
        variant="quiet"
        className="w-full"
        onClick={() => add(index)}
        aria-label={`Add ${label.toLowerCase()} at position ${index + 1}`}
      >
        + Add {label.toLowerCase()}
      </Button>
    ) : (
      <Button
        variant="secondary"
        className="w-full"
        disabled={index === moving || index === moving + 1}
        onClick={() => place(index)}
        aria-label={`Place ${label.toLowerCase()} at position ${index + 1}`}
      >
        Place here
      </Button>
    );

  return (
    <Section
      title={heading}
      actions={
        moving !== null && (
          <Button
            variant="quiet"
            size="compact"
            onClick={() => setMoving(null)}
          >
            Cancel move
          </Button>
        )
      }
    >
      {fields.map((line, index) => {
        const text = form.register(`${name}.${index}.text`, {
          validate: value =>
            Boolean(value.trim()) || 'Write this line or remove it.',
        });
        const error = form.formState.errors[name]?.[index]?.text?.message;
        return (
          <Fragment key={line.id}>
            {moving !== null && gap(index)}
            <div
              className={`border-line border-b py-3 ${moving === index ? 'rounded-ui ring-accent ring-2' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="type-label text-ink-muted">
                  {label} {index + 1}
                </span>
                <div className="flex gap-3">
                  <Button
                    variant="quiet"
                    size="compact"
                    aria-label={`Move ${label.toLowerCase()} ${index + 1}`}
                    onClick={() => setMoving(index)}
                  >
                    Move
                  </Button>
                  <Button
                    variant="destructive"
                    size="compact"
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
                  >
                    Remove
                  </Button>
                </div>
              </div>
              {name !== 'instructions' && (
                <details className="mb-3" open={line.title ? true : undefined}>
                  <summary className="type-label text-ink-muted min-h-11 cursor-pointer py-3">
                    Section heading (optional)
                  </summary>
                  <Field
                    label={`${label} ${index + 1} section title`}
                    hideLabel
                    placeholder="For the sauce, for example"
                    {...form.register(`${name}.${index}.title`, {
                      setValueAs: nullableText,
                    })}
                  />
                </details>
              )}
              <Textarea
                label={`${label} ${index + 1}`}
                hideLabel
                id={`${name}-${line.id}`}
                rows={name === 'instructions' ? 3 : 1}
                error={error}
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
            </div>
          </Fragment>
        );
      })}
      {gap(fields.length)}
    </Section>
  );
}
