/**
 * Lets an app take part in project save/load. Methods run in an injection context,
 * so they can `inject()` the app's own services.
 */
export interface AppStorage {
  /** The app's data as plain JSON-serialisable values. */
  export(): unknown;
  /** Replaces the app's data. Throws an Error with a readable message if the data is invalid. */
  import(data: unknown): void;
}
