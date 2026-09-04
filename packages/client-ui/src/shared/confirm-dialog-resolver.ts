export class ConfirmDialogResolver {
  private current: ((result: boolean) => void) | null = null;

  start(resolve: (result: boolean) => void): void {
    this.settle(false);
    this.current = resolve;
  }

  settle(result: boolean): void {
    const resolve = this.current;
    this.current = null;
    resolve?.(result);
  }
}
