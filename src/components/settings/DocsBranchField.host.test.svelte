<script lang="ts">
  import DocsBranchField from './DocsBranchField.svelte';

  // Binds the field's value as the project's settings do, and tells each change.
  let { value: start, onchange }: { value: string; onchange: (v: string) => void } = $props();
  // svelte-ignore state_referenced_locally
  let value = $state(start);
  $effect(() => onchange(value));
</script>

<DocsBranchField bind:value />
