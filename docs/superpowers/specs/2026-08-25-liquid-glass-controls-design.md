# Liquid Glass Controls Design

## Goal

Replace the existing simulated CSS glass surface on exactly five library controls with real WebGL refraction powered by `@ybouane/liquidglass`, while preserving the current layout, interactions, dark visual identity, and a reliable CSS fallback.

## Scope

The WebGL effect applies only to:

1. the complete left navigation rail;
2. the Ask AI/search pill;
3. the circular close/reset button beside the search pill;
4. the view and sort control pill;
5. the circular agent button at the upper right.

The New Note button, subject cards, note cards, editor UI, settings UI, and agent panel remain outside this change.

## Backup

Before implementation, create a timestamped ZIP snapshot under `backups/` containing the current web application sources, tests, assets, package manifests, Vite configuration, Capacitor configuration, and `index.html`. Exclude `.git`, dependency folders, build output, and Android trees. The archive is the rollback artifact because the worktree already contains unrelated staged and untracked changes that make a broad backup commit unsafe.

## Architecture

Use one LiquidGlass instance and one library-scene root. The root contains a dedicated non-glass scene layer and the five glass elements as direct children, satisfying the library's structural requirement. Other library content is grouped into a non-glass content layer. Existing absolute positioning keeps the screen layout visually unchanged.

Create a focused React hook, `useLiquidGlass`, that:

- receives the root ref and five element refs;
- waits for the mounted DOM and fonts before initialization;
- applies per-element configuration through `data-config`;
- initializes one `LiquidGlass` instance;
- records enhanced, fallback, and failed states on the root;
- destroys the instance and releases WebGL resources during cleanup;
- ignores stale asynchronous initialization after unmount.

The integration must not create multiple WebGL contexts or initialize a new instance on ordinary Library state changes.

## Visual Configuration

Use restrained settings suitable for functional controls rather than novelty effects:

- moderate background blur;
- visible but controlled refraction;
- subtle Fresnel rim and edge highlight;
- minimal chromatic aberration;
- low cool tint that harmonizes with `#8AD4FF`;
- button interaction mode only for actual buttons;
- element-specific corner radii matching the existing geometry;
- no dragging or floating behavior.

When enhancement is active, the five elements' previous opaque CSS texture is removed so the WebGL canvas is the glass surface. Text, icons, focus rings, hit targets, selected states, and accessible labels remain ordinary DOM content above the injected canvas.

## Scene Capture

The generated reeded-glass image and blue ambient overlays must exist in a child scene layer because the library does not capture a root element's own background. The scene remains visually equivalent to the current global app background. Static content is captured once; no broad `data-dynamic` marker is used. Explicit invalidation is reserved for visual background changes that the library cannot observe.

## Fallback and Accessibility

The existing CSS glass appearance becomes a progressive-enhancement fallback. It stays active before initialization, when WebGL or required canvas features are unavailable, and whenever initialization rejects. Successful initialization switches only the five targeted surfaces to the WebGL treatment.

Keyboard behavior, focus visibility, pointer targets, and labels must remain unchanged. `prefers-reduced-motion` disables nonessential glass transition motion but does not disable a static refraction surface. The UI must remain usable if the injected canvas is absent.

## Error Handling

Initialization failures are contained inside the hook, produce one concise development warning, and leave the fallback UI intact. Cleanup is idempotent. No error in the enhancement may block Library rendering or navigation.

## Testing

Use test-driven implementation for:

- exact selection of the five intended glass elements;
- single initialization with correct root and elements;
- cleanup through `destroy()`;
- rejection and unsupported-WebGL fallback;
- preservation of existing interactions and tests.

Verify with the complete Vitest suite and production build. In the in-app browser, confirm real injected WebGL canvases on only the five marked controls, correct refraction over the reeded background, no console errors, working controls, stable resize behavior, and acceptable responsiveness.

## Rollback

Remove the hook and package dependency, restore the Library markup and glass CSS from the timestamped backup, reinstall dependencies, and run the full verification suite. No content or note data migration is involved.
