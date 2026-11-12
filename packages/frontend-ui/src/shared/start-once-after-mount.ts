export type StartOnceState = { started: boolean };

export function startOnceAfterMount(
  state: StartOnceState,
  start: () => void,
): () => void {
  if (state.started) return () => {};
  const handle = setTimeout(() => {
    state.started = true;
    start();
  }, 0);
  return () => clearTimeout(handle);
}
