// Arquivos .sql importados como string (esbuild loader "text" no build.mjs).
declare module "*.sql" {
  const sql: string;
  export default sql;
}
