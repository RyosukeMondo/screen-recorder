// Declaration file for the events module
declare module 'events' {
  type EventListener<T = unknown[]> = (...args: T[]) => void;
  
  class EventEmitter {
    addListener(event: string | symbol, listener: EventListener): this;
    on(event: string | symbol, listener: EventListener): this;
    once(event: string | symbol, listener: EventListener): this;
    removeListener(event: string | symbol, listener: EventListener): this;
    off(event: string | symbol, listener: EventListener): this;
    removeAllListeners(event?: string | symbol): this;
    setMaxListeners(n: number): this;
    getMaxListeners(): number;
    listeners(event: string | symbol): EventListener[];
    rawListeners(event: string | symbol): EventListener[];
    emit(event: string | symbol, ...args: unknown[]): boolean;
    listenerCount(event: string | symbol): number;
    prependListener(event: string | symbol, listener: EventListener): this;
    prependOnceListener(event: string | symbol, listener: EventListener): this;
    eventNames(): Array<string | symbol>;
  }
  
  export = EventEmitter;
}
