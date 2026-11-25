import { fieldGuideEntries } from "../../features/field-guide/entries";

export interface Question {
  entryId: string;
  src: string;
  caption: string;
}

/**
 * Photos interleaved across entries (first photo of each entry, then the
 * second of each), so neighbouring questions differ and the order is fixed.
 */
export const quizQuestions: readonly Question[] = [0, 1].flatMap((position) =>
  fieldGuideEntries.flatMap((entry) => {
    const image = entry.images[position];
    return image
      ? [{ entryId: entry.id, src: image.src, caption: image.caption }]
      : [];
  }),
);
