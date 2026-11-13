import test from 'node:test';
import assert from 'node:assert/strict';
import { getMapSelectionOption, getMapSelectionOptions } from './bookingMapSelection.js';

const choice = (tableIds, seats, area = 'interior') => ({ key: tableIds.join('|'), tableIds, seats, area });

test('a suitable single table takes priority over a configured combination', () => {
  const single = choice(['A'], 6);
  const group = choice(['A', 'B'], 4);
  const index = getMapSelectionOptions([group, single], 'interior');
  assert.equal(getMapSelectionOption(index, 'A'), single);
});

test('a combination remains selectable from every member when no single table fits', () => {
  const group = choice(['A', 'B'], 8);
  const index = getMapSelectionOptions([group], 'interior');
  assert.equal(getMapSelectionOption(index, 'A'), group);
  assert.equal(getMapSelectionOption(index, 'B'), group);
  assert.equal(getMapSelectionOption(index, 'C'), undefined);
});

test('group defaults use fewer tables, then fewer seats, then a stable key', () => {
  const three = choice(['A', 'B', 'C'], 6);
  const larger = choice(['A', 'D'], 10);
  const tiedLater = choice(['A', 'F'], 8);
  const expected = choice(['A', 'E'], 8);
  for (const options of [[three, larger, tiedLater, expected], [expected, tiedLater, larger, three]]) {
    const index = getMapSelectionOptions(options, 'interior');
    assert.equal(getMapSelectionOption(index, 'A'), expected);
  }
});

test('tapping a member preserves an explicitly selected group even if a single table also fits', () => {
  const group = choice(['A', 'B'], 8);
  const index = getMapSelectionOptions([choice(['A'], 4), choice(['B'], 4), group], 'interior');
  assert.equal(getMapSelectionOption(index, 'A', group.key), group);
  assert.equal(getMapSelectionOption(index, 'B', group.key), group);
});

test('a stale or unrelated selection cannot keep a group outside the clicked table candidates', () => {
  const available = choice(['A', 'B'], 8);
  const other = choice(['C'], 4);
  const index = getMapSelectionOptions([available, other], 'interior');
  assert.equal(getMapSelectionOption(index, 'A', 'A|removed'), available);
  assert.equal(getMapSelectionOption(index, 'C', available.key), other);
});

test('other halls and absent availability never create selectable tables', () => {
  const index = getMapSelectionOptions([choice(['X', 'Y'], 8, 'exterior')], 'interior');
  assert.equal(index.size, 0);
  assert.equal(getMapSelectionOption(index, 'X'), undefined);
  assert.equal(getMapSelectionOptions([], 'interior').size, 0);
});

test('indexing preserves the API option objects and input order without modifying table IDs', () => {
  const group = Object.freeze({ ...choice(['B', 'A'], 8), tableIds: Object.freeze(['B', 'A']) });
  const single = Object.freeze({ ...choice(['A'], 4), tableIds: Object.freeze(['A']) });
  const options = Object.freeze([group, single]);
  const index = getMapSelectionOptions(options, 'interior');
  assert.deepEqual(options, [group, single]);
  assert.equal(getMapSelectionOption(index, 'B'), group);
  assert.deepEqual(group.tableIds, ['B', 'A']);
});
