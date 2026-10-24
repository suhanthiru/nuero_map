/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" forces the mock transport even inside Tauri. */
  readonly VITE_MOCK_API?: string;
  /** When > 0, the mock graph is a synthetic clustered graph of this many nodes. */
  readonly VITE_MOCK_GRAPH_SIZE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
