import { useState } from 'react';

import {
  Button,
  ButtonLink,
  Card,
  Checkbox,
  ChoiceChip,
  Dialog,
  EmptyState,
  Feedback,
  Field,
  PageHeader,
  PersistentDrawer,
  Section,
  Textarea,
} from '../ui';

export function UiExamples() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState(true);
  const [filter, setFilter] = useState(true);

  return (
    <main className="drawer-layout mx-auto max-w-6xl lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="space-y-8 px-4 pb-8 lg:col-start-2 lg:px-8">
        <PageHeader
          title="UI foundations"
          back={
            <ButtonLink variant="quiet" to="/">
              ← All recipes
            </ButtonLink>
          }
          description="Editorial content, quiet utility controls. Live examples of the shared building blocks."
        />
        <Section
          title="Actions"
          description="Primary actions use the accent. Quiet and destructive actions have less visual weight."
        >
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="quiet">Quiet</Button>
            <Button variant="destructive">Delete</Button>
            <Button disabled>Disabled</Button>
            <Button loading>Saving…</Button>
            <Button
              variant="secondary"
              size="compact"
              aria-label="Add ingredient"
            >
              +
            </Button>
          </div>
          <ButtonLink variant="quiet" to="/capture">
            Link styled as an action →
          </ButtonLink>
        </Section>
        <Section
          title="Fields"
          description="Labels, hints and validation belong to the field; form state stays with the feature."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Recipe name"
              defaultValue="Lemon chickpea stew"
              hint="The name in your cookbook."
            />
            <Field
              label="Recipe URL"
              defaultValue="not a URL"
              error="Enter a complete URL, including https://."
            />
            <Field label="Disabled field" disabled defaultValue="Unavailable" />
            <Field
              label="Search examples"
              hideLabel
              type="search"
              placeholder="Visually hidden label"
            />
          </div>
          <Textarea
            label="Comment"
            placeholder="What would you change next time?"
          />
          <Checkbox label="Use estimated cooking time" defaultChecked />
          <Checkbox label="Unavailable option" disabled />
        </Section>
        <Section
          title="Choices and filters"
          description="Selection uses a neutral surface, not the primary-action fill."
        >
          <div className="flex flex-wrap gap-2">
            <ChoiceChip
              kind="choice"
              selected={selected}
              onClick={() => setSelected(!selected)}
            >
              Vegetarian
            </ChoiceChip>
            <ChoiceChip
              kind="choice"
              selected={false}
              disabled
              onClick={() => {}}
            >
              Unavailable
            </ChoiceChip>
            {filter && (
              <ChoiceChip
                kind="removable"
                removeLabel="Remove under 30 minutes filter"
                onRemove={() => setFilter(false)}
              >
                Under 30 min
              </ChoiceChip>
            )}
            {!filter && (
              <Button variant="quiet" onClick={() => setFilter(true)}>
                Restore filter
              </Button>
            )}
          </div>
        </Section>
        <Section title="Feedback">
          <Feedback>
            Reading your source… Your saved recipe is still available.
          </Feedback>
          <Feedback tone="error">
            We couldn’t save your changes. Please try again.
          </Feedback>
          <EmptyState
            title="No matching recipes"
            actions={<Button variant="secondary">Clear filters</Button>}
          >
            Try a different search or fewer filters.
          </EmptyState>
        </Section>
        <Section title="Surfaces and reading">
          <Card>
            <p className="type-control">
              Use a card only when the boundary helps. Most sections don’t need
              one.
            </p>
          </Card>
          <Section title="From the page" reading>
            <p className="type-body">
              Add the lemon just before serving. This reading text uses the
              cookbook’s serif face; the surrounding controls use sans-serif.
            </p>
          </Section>
        </Section>
        <Section
          title="Dialog and persistent drawer"
          description="A dialog blocks the background; the drawer supports it. Try Tab and Escape in both."
        >
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Open example dialog
          </Button>
          <p className="type-control text-ink-muted">
            On a phone, the example drawer is at the bottom. On desktop, its
            content is a sidebar.
          </p>
        </Section>
      </div>
      <PersistentDrawer
        title="Example drawer"
        summary="Non-modal"
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      >
        <div className="space-y-4">
          <p className="type-control text-ink-muted">
            The page remains available. Collapse this drawer or press Escape to
            return to the handle.
          </p>
          <Checkbox label="Example drawer control" />
          <p className="type-body">
            Recipe-specific contents go here, not in the drawer primitive.
          </p>
        </div>
      </PersistentDrawer>
      <Dialog
        open={dialogOpen}
        title="Example dialog"
        onClose={() => setDialogOpen(false)}
        footer={
          <>
            <Button variant="quiet" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setDialogOpen(false)}>Done</Button>
          </>
        }
      >
        <p>
          Focus stays inside this dialog until it closes. On a phone it appears
          as a bottom sheet.
        </p>
        <Field label="Example field" placeholder="Try keyboard navigation" />
      </Dialog>
    </main>
  );
}
