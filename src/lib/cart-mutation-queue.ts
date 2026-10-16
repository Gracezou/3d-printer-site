// Serialize writes per item while allowing unrelated cart rows to save in parallel.
// A newer intent replaces queued work, but never races an in-flight PATCH/DELETE.
export class CartMutationQueue {
  private desired = new Map<string, number | null>();
  private running = new Set<string>();

  constructor(
    private handlers: {
      send: (id: string, quantity: number | null) => Promise<void>;
      committed: (id: string, quantity: number | null) => void;
      failed: (id: string, error: unknown) => void;
      idle: (id: string) => void;
    },
  ) {}

  set(id: string, quantity: number | null) {
    this.desired.set(id, quantity);
    if (!this.running.has(id)) void this.drain(id);
  }

  private async drain(id: string) {
    this.running.add(id);
    while (this.desired.has(id)) {
      const quantity = this.desired.get(id)!;
      this.desired.delete(id);
      try {
        await this.handlers.send(id, quantity);
        this.handlers.committed(id, quantity);
      } catch (error) {
        if (!this.desired.has(id)) this.handlers.failed(id, error);
      }
    }
    this.running.delete(id);
    this.handlers.idle(id);
  }
}
