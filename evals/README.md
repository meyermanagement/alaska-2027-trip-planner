# Judging Aly

`aly.json` is thirty-three real questions with what a good answer does. It exists so
that a change to her prompt, her tool set or her context can be judged against the
same questions every time, instead of against whichever one somebody happened to
type after making the change.

It is deliberately data rather than code. Nothing here runs yet; the file is the
part worth having first, because the questions are the hard part and a harness
around the wrong questions measures nothing.

## What a case says

    screen         the focus passed to the chat route — null for home, the trips
                   list, Preferences & Reviews or People; otherwise itinerary,
                   packing, tasks, notes, templates, rewards, new_trip
    ask            typed exactly as a person would type it
    expect_tools   the calls the reply must contain; an empty list means the right
                   answer is words only
    forbid_tools   calls that make the answer wrong even if everything else is
                   right, which is nearly always a confirmation card offered in
                   place of an answer
    expect_text    what the words have to contain, described rather than quoted
    why            what the case is protecting

## Scoring

Three counts, in this order: the expected calls, the forbidden calls, then the
words. A case with the right words and a spurious confirmation card is a fail —
that is the failure the family notices most.

The first two counts can be checked mechanically. The third needs a person or a
judging model, so keep the run small enough that reading thirty-odd answers is not a
chore.

Record the model and the date with every run. The same prompt scores differently
on a different model, and the point of the file is comparing runs.

## Running it, when there is a harness

The honest options, in order of how much they prove:

1. Against the real route, signed in as a family member, one case per request.
   This is the only thing that tests the context, the tool trimming, the recall
   round and the apply path together. It needs a session cookie and it writes
   nothing, because a case is scored on the proposal rather than on the saved row.
2. Against `generate()` with a context built from a snapshot of the family's data.
   Faster and cheaper, and it still catches prompt and tool-set regressions, but
   it does not test the route.
3. By hand, in the chat panel, reading the answers. Slow, and still worth doing
   for the wording cases.

Whichever is built, keep the questions in this file and keep adding to it: the
best cases are the ones written the day something went wrong, while the wrong
answer is still on the screen.
