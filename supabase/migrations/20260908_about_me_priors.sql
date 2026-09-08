-- Structured priors extracted from a traveler's About-you paragraph.
--
-- The About-you screen collects four short answers in the person's own words
-- and concatenates them into travelers.about_me. Aly reads that paragraph
-- before every answer she writes, which is good for tone but means the family
-- interview downstream still asks questions the paragraph has already answered
-- -- somebody who wrote "we hate cruises" still sees the crowds and staying
-- questions with cruise-shaped chips, and the interview reads as if nobody
-- was listening.
--
-- This column stores what a language model was able to extract from the
-- paragraph, as a JSON map from interview slot to a small object describing
-- the value the paragraph implies and the exact quote it was drawn from.
--
-- Shape:
--   {
--     "staying": {
--       "value": "hotel",              -- one of the option `value` strings
--       "quote": "we always book a Marriott",
--       "confidence": "high"           -- "high" | "medium" | "low"
--     },
--     ...
--   }
--
-- Only slots the paragraph actually settles are keyed; ambiguous ones are
-- absent, not present with a null value. The interview screen renders any
-- keyed slot as already-answered with a small "you mentioned this" chip and
-- an edit link back to About-you; unkeyed slots are asked normally.
--
-- Rewritten on every About-you save so the paragraph and the priors stay in
-- lockstep. Empty {} when the paragraph is blank or the model returned
-- nothing usable.
ALTER TABLE public.travelers
  ADD COLUMN IF NOT EXISTS about_me_priors jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.travelers.about_me_priors IS
  'Interview slot priors extracted by a language model from about_me. Keyed by slot id; each value is {value, quote, confidence}. Rewritten on every About-you save.';
