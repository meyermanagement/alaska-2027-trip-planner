// A quick presentation effect, not a request or simulated model wait.
// Two words per frame of writing keeps a whole answer under about 1.2 seconds.
export function playPreparedReply(
  answer,
  onUpdate,
  { reducedMotion = false, schedule = setTimeout, cancel = clearTimeout } = {},
) {
  let timer;
  let stopped = false;
  const words = answer.split(/\s+/);
  let count = 0;
  const write = () => {
    if (stopped) return;
    count = Math.min(words.length, count + 2);
    const complete = count === words.length;
    onUpdate(complete ? answer : words.slice(0, count).join(" "), complete);
    if (!complete) timer = schedule(write, 24);
  };
  if (reducedMotion) onUpdate(answer, true);
  else timer = schedule(write, 180);
  return () => {
    stopped = true;
    if (timer !== undefined) cancel(timer);
  };
}
