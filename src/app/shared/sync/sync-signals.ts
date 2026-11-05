import { DestroyRef, Signal, effect, inject, signal } from '@angular/core';
import { ChannelFactory, SyncHost, SyncMirror } from './sync-channel';

export type SignalSlices<S> = { readonly [K in keyof S]: Signal<S[K]> };

/**
 * Publishes every slice whenever its signal changes. Broadcasting is a side effect of the state,
 * so no code path can change the state and forget to tell the player screen.
 * Call in an injection context.
 */
export function publishSignals<S extends object>(host: SyncHost<S, unknown>, slices: SignalSlices<S>): void {
  for (const key of Object.keys(slices) as (keyof S & string)[]) {
    effect(() => host.publish(key, slices[key]()));
  }
}

/** Mirrors a host's slices into signals, starting from `initial`. Closes with the injection context. */
export function mirrorSignals<S extends object, C = never>(
  name: string,
  protocol: number,
  initial: S,
  factory?: ChannelFactory,
): { readonly state: SignalSlices<S>; readonly mirror: SyncMirror<S, C> } {
  const keys = Object.keys(initial) as (keyof S & string)[];
  const writable = Object.fromEntries(keys.map((key) => [key, signal(initial[key])])) as unknown as {
    [K in keyof S]: ReturnType<typeof signal<S[K]>>;
  };
  const mirror = new SyncMirror<S, C>(name, protocol, keys, (key, value) => writable[key].set(value), factory);
  inject(DestroyRef).onDestroy(() => mirror.close());
  const state = Object.fromEntries(keys.map((key) => [key, writable[key].asReadonly()])) as unknown as SignalSlices<S>;
  return { state, mirror };
}
