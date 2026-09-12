export type ScrapedOffer = {
  price: number;
  url: string;
  title?: string;
  sourceName?: string;
};

export type SourceResult = {
  offer: ScrapedOffer | null;
  error?: string;
};

export type ScanError = { product: string; error: string };

export type ScrapeResult = {
  productName: string;
  prixBas: number;
  prixHaut: number;
  diffPercent: number;
  source: string;
  urlOffre: string;
};

export type RefProduct = {
  name: string;
  ean: string;
  query: string;
  image: string;
  asin?: string;
};

// Produits de référence suivis par le scanner (recherche par EAN/nom)
export const CATALOG: RefProduct[] = [
  { name: "Bosch Perceuse GSB 13 RE", ean: "3165140371940", query: "Bosch GSB 13 RE", image: "https://picsum.photos/seed/gsb13re/80/80" },
  { name: "Dyson V8 Absolute", ean: "5025155025421", query: "Dyson V8 Absolute", image: "https://picsum.photos/seed/dysonv8/80/80" },
  { name: "Karcher K5 Nettoyeur Haute Pression", ean: "4054278608730", query: "Karcher K5", image: "https://picsum.photos/seed/k5/80/80" },
  { name: "Makita DDF485 Perceuse 18V", ean: "0088381860307", query: "Makita DDF485", image: "https://picsum.photos/seed/ddf485/80/80" },
  { name: "Ninja Foodi MAX AF400EU", ean: "0622356261791", query: "Ninja Foodi AF400EU", image: "https://picsum.photos/seed/af400/80/80" },
  { name: "Tefal Ingenio Batterie 10 pièces", ean: "3168430310551", query: "Tefal Ingenio 10 pieces", image: "https://picsum.photos/seed/ingenio/80/80" },
  { name: "Rowenta X-Force Flex 9.60", ean: "3221614006661", query: "Rowenta X-Force Flex 9.60", image: "https://picsum.photos/seed/xforce/80/80" },
  { name: "Philips Hue White E27 x2", ean: "8719514289193", query: "Philips Hue White E27 pack 2", image: "https://picsum.photos/seed/hue/80/80" },
];

// Fiabilité des sources (pondère le score final)
export const SOURCE_RELIABILITY: Record<string, number> = {
  amazon: 20,
  manomano: 15,
  darty: 18,
  fnac: 18,
  boulanger: 16,
  leroymerlin: 17,
  carrefour: 14,
};
