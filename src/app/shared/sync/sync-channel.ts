/**
 * Keeps another browser window (the player screen) in step with the DM's window.
 *
 * The host owns some state, split into named slices (e.g. "image", "view", "rooms") so a small change never
 * resends a large one. It publishes each slice when it changes and answers late joiners with the latest values.
 * A mirror receives the slices and can send commands back (e.g. "the player screen is 16:9").
 *
 * Every message carries a protocol version; windows running different versions of the app ignore each other
 * instead of misreading each other's data.
 */

/** The part of BroadcastChannel this needs, so tests can pass a fake. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
}

export type ChannelFactory = (name: string) => ChannelLike | null;

/** A real BroadcastChannel, or none during server-side rendering. */
export const browserChannel: ChannelFactory = (name) =>
  typeof BroadcastChannel === 'undefined' ? null : (new BroadcastChannel(name) as unknown as ChannelLike);

type Wire =
  | { readonly protocol: number; readonly kind: 'request' }
  | { readonly protocol: number; readonly kind: 'slice'; readonly key: string; readonly value: unknown }
  | { readonly protocol: number; readonly kind: 'command'; readonly command: unknown };

function readWire(data: unknown, protocol: number): Wire | null {
  const message = data as Partial<Wire> | null;
  if (!message || typeof message !== 'object' || typeof message.kind !== 'string') {
    return null;
  }
  if (message.protocol !== protocol) {
    console.warn('Ignoring a message from a window running another version of the app; reload both windows.');
    return null;
  }
  return message as Wire;
}

export class SyncHost<S extends object, C = never> {
  private readonly latest = new Map<keyof S & string, unknown>();
  private readonly channel: ChannelLike | null;

  constructor(
    name: string,
    private readonly protocol: number,
    options: {
      /** Checks a command from a mirror; anything it rejects is ignored. */
      isCommand?: (value: unknown) => value is C;
      onCommand?: (command: C) => void;
      factory?: ChannelFactory;
    } = {},
  ) {
    this.channel = (options.factory ?? browserChannel)(name);
    if (this.channel) {
      this.channel.onmessage = (event) => {
        const message = readWire(event.data, protocol);
        if (message?.kind === 'request') {
          for (const [key, value] of this.latest) {
            this.post(key, value);
          }
        } else if (message?.kind === 'command' && options.isCommand?.(message.command)) {
          options.onCommand?.(message.command);
        }
      };
    }
  }

  publish<K extends keyof S & string>(key: K, value: S[K]): void {
    this.latest.set(key, value);
    this.post(key, value);
  }

  close(): void {
    this.channel?.close();
  }

  private post(key: string, value: unknown): void {
    this.channel?.postMessage({ protocol: this.protocol, kind: 'slice', key, value } satisfies Wire);
  }
}

export class SyncMirror<S extends object, C = never> {
  private readonly channel: ChannelLike | null;

  constructor(
    name: string,
    private readonly protocol: number,
    keys: readonly (keyof S & string)[],
    onSlice: <K extends keyof S & string>(key: K, value: S[K]) => void,
    factory: ChannelFactory = browserChannel,
  ) {
    this.channel = factory(name);
    if (this.channel) {
      this.channel.onmessage = (event) => {
        const message = readWire(event.data, protocol);
        if (message?.kind === 'slice' && (keys as readonly string[]).includes(message.key)) {
          const key = message.key as keyof S & string;
          onSlice(key, message.value as S[typeof key]);
        }
      };
      this.request();
    }
  }

  /** Asks the host to send everything again. */
  request(): void {
    this.channel?.postMessage({ protocol: this.protocol, kind: 'request' } satisfies Wire);
  }

  send(command: C): void {
    this.channel?.postMessage({ protocol: this.protocol, kind: 'command', command } satisfies Wire);
  }

  close(): void {
    this.channel?.close();
  }
}
