# D&D Session Helper

A suite of tools that helps Dungeon Masters run their sessions: a Worldmap and a Battlemap, with a separate
player screen.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.2.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Application structure

The suite is a shell (`src/app/suite/`) with independent apps (`src/app/apps/<app>/`) plugged into it through
the registry in `suite/suite-apps.ts`. Apps never import each other; anything they share goes through the suite.

```
src/app/
  suite/                 Shell: sidebar, tabs, search, project save/load, theme
    suite-apps.ts        Registry: each app's storage, maps, search and player screen (all lazy)
    presentation/        The player stage (what players see), the player window and its loading screen
  apps/<app>/
    domain/              Pure TypeScript: model, rules, saved-data schema + migrations, player projection
    state/               The app's store (its only copy of the data) and services that operate on it
    sync/                Publishes the player projection to the player window (host) and receives it (mirror)
    suite/               Adapters the suite registry loads: storage, sidebar maps, search, presenter
    <screens>/           Components; they read from state/ and contain no business rules
  shared/
    storage/             Versioned persistence (IndexedDB with localStorage fallback) and small local settings
    sync/                Typed, versioned BroadcastChannel host/mirror
    creatures/, ui/, util/
```

Rules of thumb:

- **What players see** is decided in one place: `PlayerStageService` holds a single stage (`{ app, mapId, mode }`),
  so only one app is ever shown. Each app's `domain/projection.ts` decides what of its data players may see.
- **Player screens are derived, not pushed.** A host publishes its projection with signals and effects; there are
  no "broadcast now" calls to forget.
- **Saved data is versioned.** Each app has a `Schema` with a version and migrations. The browser copy and project
  files use the same format, and older saves keep loading.
- Creature defaults are stored as JSON in `src/assets/creatures/` and accessed through `CreatureService`, keeping
  the data source centralized for a future API integration.

### Bestiary

The initiative tracker loads the Monster Manual creatures from
[`src/assets/creatures/bestiary-mm.json`](./src/assets/creatures/bestiary-mm.json).
This file is a local copy of the [5e.tools bestiary data](https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/bestiary/bestiary-mm.json).
The browser loads it as a runtime asset and `CreatureService` converts the 5e.tools
format to the application's statblock format. To update the available creatures,
replace the local file with a reviewed version of the upstream JSON and rebuild.

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
