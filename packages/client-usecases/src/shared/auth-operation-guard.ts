import { AppError } from "@rubydogjp/openkk-client-domain";

export class AuthOperationGuard {
  private version = 0;

  capture(): number {
    return this.version;
  }

  invalidate(): number {
    this.version += 1;
    return this.version;
  }

  isCurrent(expectedVersion: number): boolean {
    return this.version === expectedVersion;
  }

  assertCurrent(expectedVersion: number): void {
    if (this.isCurrent(expectedVersion)) return;
    throw new AppError({
      messageForDeveloper: "Authentication operation was superseded",
      messageForUser: "認証状態が変わったため、処理を中止しました",
      originalMessage: null,
      statusCode: null,
    });
  }
}
