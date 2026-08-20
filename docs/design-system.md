# Geek design system

Geek's mobile interface uses a small semantic foundation derived from the approved Figma frames. Shared values live in `packages/design-tokens`; React Native components consume them without duplicating color, spacing, radius, or type constants.

## Foundations

- The primary surface is warm off-white (`background`).
- Text uses primary and secondary semantic colors.
- Spacing follows the frame's 2 / 4 / 8 / 12 / 16 rhythm.
- Image radii express meaning: owned Copy photography uses 12, Wishlist catalog imagery uses 8.
- Typography exposes screen-title, item-title, metadata, and tab-label roles.
- Capsule controls use the semantic `capsule` shape; their geometry does not depend on a one-off fixed radius.
- Navigation material and selected-navigation state are separate layers with separate semantic colors.

## Mobile components

Collection currently establishes the first local reusable components:

- `CollectionHeader` for title, album mode, and settings.
- `CollectionSegmentedControl` for My Games / Wishlist state.
- `GameGridItem` for owned and wanted game presentations.
- `GeekTabBar` for the four approved product destinations and separate add action.
- `AdaptiveGlassSurface` for platform-aware floating material.
- `GeekIcon` for the small set of Pixelarticons currently used by the mobile product.

These remain mobile presentation components. Fixtures are local to the Collection screen and must be replaced by existing data APIs when the screen is connected; no product or marketplace rules belong in these components.

## Icons

Pixelarticons is Geek's canonical product icon family. `GeekIcon` renders exact Pixelarticons vector data with `react-native-svg`. Glyphs have transparent backgrounds and accept semantic color from their containing component. Circles, pills, selected states, and opportunity colors belong to the parent component rather than the icon asset. The French region flag remains an image asset because it is content imagery rather than a product-action glyph.

## Platform material

Native controls and safe areas remain authoritative. On supported iOS 26+ devices, `AdaptiveGlassSurface` uses Expo's native `GlassView` after both Liquid Glass runtime checks pass. Older iOS versions and Android use the same responsive Geek geometry with a translucent, bordered React Native surface. The selected tab remains an inner capsule in both paths and is not baked into the navigation material.
