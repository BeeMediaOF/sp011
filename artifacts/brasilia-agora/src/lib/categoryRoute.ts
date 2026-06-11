const ROUTE_MAP: Record<string, string> = {
  politica:   "/politica",
  cidade:     "/cidade",
  seguranca:  "/seguranca",
  transporte: "/transporte",
  saude:      "/saude",
  educacao:   "/educacao",
  cultura:    "/cultura",
  esportes:   "/esportes",
  esporte:    "/esportes",
  colunas:    "/colunas",
  brasil:     "/brasil",
  mundo:      "/mundo",
  economia:   "/economia",
  tecnologia: "/tecnologia",
  df:         "/cidade",
  transito:   "/transporte",
};

export function categoryRoute(rawCategory: string): string {
  const key = rawCategory
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return ROUTE_MAP[key] ?? "/";
}
