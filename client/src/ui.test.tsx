import { expect, it } from 'bun:test';

import { Field } from './ui';

it('forwards form registration refs to the input', () => {
  const ref = () => undefined;
  const field = Field({ label: 'Email', ref });
  const input = field.props.children[1];
  expect(input.props.ref).toBe(ref);
});
