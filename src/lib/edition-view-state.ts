import type { EditionRecord, PaperRecord } from '../schemas/content';

export const zeroSelectionMessage = 'No papers met the quality bar for this edition.';

export function getEditionViewState(
  edition: EditionRecord,
  papersById: ReadonlyMap<string, PaperRecord>,
): { fixtureOnly: boolean; emptyMessage?: string } {
  const hasEntries = edition.entries.length > 0;
  return {
    fixtureOnly: hasEntries
      && edition.entries.every((entry) => papersById.get(entry.paper_id)?.tags.includes('fixture')),
    ...(hasEntries ? {} : { emptyMessage: zeroSelectionMessage }),
  };
}
