/** A file of public/, under the site's base URL (the root, unless NUXT_APP_BASE_URL says otherwise). */
export function useAsset() {
  const base = useRuntimeConfig().app.baseURL;
  return (path: string) => `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
