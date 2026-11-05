import { ChannelFactory, ChannelLike, SyncHost, SyncMirror } from './sync-channel';

/** In-memory BroadcastChannel: delivers to every other channel with the same name, synchronously. */
function bus(): ChannelFactory {
  const channels: { name: string; channel: ChannelLike }[] = [];
  return (name) => {
    const channel: ChannelLike = {
      onmessage: null,
      postMessage: (message) => {
        for (const other of channels) {
          if (other.name === name && other.channel !== channel) {
            other.channel.onmessage?.({ data: structuredClone(message) });
          }
        }
      },
      close: () => {
        const index = channels.findIndex((c) => c.channel === channel);
        if (index >= 0) channels.splice(index, 1);
      },
    };
    channels.push({ name, channel });
    return channel;
  };
}

type Slices = { a: number; b: string };
type Command = { type: 'ping' };

describe('SyncHost and SyncMirror', () => {
  it('sends published slices to mirrors', () => {
    const factory = bus();
    const host = new SyncHost<Slices>('x', 1, { factory });
    const received: unknown[] = [];
    new SyncMirror<Slices>('x', 1, ['a', 'b'], (key, value) => received.push([key, value]), factory);
    host.publish('a', 2);
    expect(received).toEqual([['a', 2]]);
  });

  it('answers a late mirror with the latest values', () => {
    const factory = bus();
    const host = new SyncHost<Slices>('x', 1, { factory });
    host.publish('a', 1);
    host.publish('b', 'hi');
    host.publish('a', 3);
    const received = new Map<string, unknown>();
    new SyncMirror<Slices>('x', 1, ['a', 'b'], (key, value) => received.set(key, value), factory);
    expect(Object.fromEntries(received)).toEqual({ a: 3, b: 'hi' });
  });

  it('ignores windows running another protocol version', () => {
    const factory = bus();
    const host = new SyncHost<Slices>('x', 2, { factory });
    const received: unknown[] = [];
    const warn = console.warn;
    console.warn = () => undefined;
    new SyncMirror<Slices>('x', 1, ['a'], (key, value) => received.push(value), factory);
    host.publish('a', 1);
    console.warn = warn;
    expect(received).toEqual([]);
  });

  it('delivers only valid commands to the host', () => {
    const factory = bus();
    const commands: Command[] = [];
    new SyncHost<Slices, Command>('x', 1, {
      factory,
      isCommand: (value): value is Command => (value as Command)?.type === 'ping',
      onCommand: (command) => commands.push(command),
    });
    const mirror = new SyncMirror<Slices, Command>('x', 1, ['a'], () => undefined, factory);
    mirror.send({ type: 'ping' });
    mirror.send({ type: 'other' } as unknown as Command);
    expect(commands).toEqual([{ type: 'ping' }]);
  });
});
