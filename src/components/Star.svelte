<script lang="ts">
  // The star of a favorite, drawn (a glyph may lack from the font): an outline, filled for a favorite, in the color of
  // its button.
  let { on = false, size = 14 }: { on?: boolean; size?: number } = $props();
</script>

<svg class="star-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
  <path
    d="M12 3.6l2.6 5.27 5.82.85-4.21 4.1.99 5.8L12 16.88l-5.2 2.74.99-5.8-4.21-4.1 5.82-.85z"
    fill={on ? 'currentColor' : 'none'}
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linejoin="round"
  />
</svg>

<style>
  .star-icon {
    display: block;
    flex: none;
  }
</style>
