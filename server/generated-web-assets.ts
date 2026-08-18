export type EmbeddedWebAsset = {
  contentType: string;
  body: string;
};

// This placeholder is replaced during `pnpm build` after Expo exports the web
// application. Keeping the source file small lets TypeScript and local dev run
// before a production build has been created.
export const embeddedWebAssets: Record<string, EmbeddedWebAsset> = {};
