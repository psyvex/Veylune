/// <reference types="vite/client" />

declare const __VEYLUNE_BUILD__: string;

declare module "*.css";

declare module "*.wasm?url" {
  const url: string;
  export default url;
}
