<script lang="ts">
  import Icon from '../Icon.svelte';

  // A file in a list (search results, « Ouvrir un fichier »): the icon of the app's family, the same for every kind of
  // file (2.0 design; the letters and signs of the 1.x drew icons with characters). The tree draws none, as the design.
</script>

<span class="ficon" aria-hidden="true"><Icon name="file" size={14} /></span>

<style>
  .ficon {
    flex: none;
    display: grid;
    place-items: center;
    width: 16px;
    color: var(--dim);
  }
</style>
