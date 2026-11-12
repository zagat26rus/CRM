export type DeviceModelLike = {
  name: string;
  brand?: { name?: string } | null;
};

type SortKey = {
  lineRank: number;
  line: string;
  generation: number;
  subGeneration: number;
  variantRank: number;
  name: string;
};

type ChronologyKey = number | string;

function extractVariantRank(lower: string): number {
  if (/pro\s*max/.test(lower)) return 5;
  if (/\bultra\b/.test(lower)) return 5;
  if (/\bpro\+/.test(lower)) return 4;
  if (/\bpro\b/.test(lower)) return 3;
  if (/\bplus\b/.test(lower) || /\+/.test(lower)) return 2;
  if (/\bmini\b/.test(lower)) return 0;
  if (/\bair\b/.test(lower)) return 2;
  if (/\blite\b/.test(lower) || /\bfe\b/.test(lower)) return 0;
  if (/\bedge\b/.test(lower)) return 3;
  return 1;
}

function normalizeModelName(name: string, brandName = ""): string {
  let lower = (name || "").trim().toLowerCase();
  const brandLower = (brandName || "").trim().toLowerCase();
  if (brandLower && lower.startsWith(brandLower)) {
    lower = lower.slice(brandLower.length).trim();
  }
  return lower.replace(/^iphone\b/, "iphone");
}

function samsungAMYear(num: number, lower: string): number {
  if (lower.includes("a8s")) return 2018;
  if (num < 10) return 2018 + num;
  const tens = Math.floor(num / 10);
  const ones = num % 10;
  if (tens === 8) return 2020;
  if (tens === 7) return 2019 + ones;
  if (tens === 6) return 2019 + (ones ? 1 : 0);
  if (tens === 5) return 2019 + Math.min(ones, 6);
  if (tens === 4) return 2019 + Math.min(ones, 2);
  if (tens === 3) return ones ? 2020 + Math.max(0, ones - 1) : 2020;
  if (tens === 2) return 2019 + Math.min(ones, 5);
  if (tens === 1) return 2019 + Math.min(ones, 6);
  return 2019;
}

function samsungReleaseChronologyKey(modelName: string): ChronologyKey[] {
  const original = (modelName || "").trim();
  const lower = original.toLowerCase();
  const variant = extractVariantRank(lower);

  const explicitYear = original.match(/\b(20\d{2})\b/);
  if (explicitYear) return [Number(explicitYear[1]), 9, 9, variant, lower];

  if (lower === "galaxy fold") return [2019, 1, 1, variant, lower];

  let   m = lower.match(/galaxy\s+fold\s*(\d+)/);
  if (m) {
    const gen = Number(m[1]);
    const years: Record<number, number> = { 7: 2026, 6: 2024, 5: 2023, 4: 2022, 3: 2021, 2: 2020 };
    return [years[gen] ?? 2018 + gen, 1, 1, variant, lower];
  }

  m = lower.match(/galaxy\s+z\s+fold\s*(\d+)?/);
  if (m) {
    const gen = Number(m[1] || "2");
    const years: Record<number, number> = { 2: 2020, 3: 2021, 4: 2022, 5: 2023, 6: 2024, 7: 2026 };
    return [years[gen] ?? 2019 + gen, 1, 2, variant, lower];
  }

  m = lower.match(/galaxy\s+z\s+flip\s*(\d+)?/);
  if (m) {
    const gen = Number(m[1] || "1");
    const years: Record<number, number> = { 1: 2020, 3: 2021, 5: 2023, 6: 2024, 7: 2026 };
    return [years[gen] ?? 2019 + gen, 2, 2, variant, lower];
  }

  m = lower.match(/(?:galaxy\s+)?s(\d+)/);
  if (m && !lower.includes("watch")) {
    const gen = Number(m[1]);
    const year = gen <= 10 ? 2009 + gen : 2000 + gen;
    return [year, 1, 0, variant, lower];
  }

  m = lower.match(/galaxy\s+note\s*(\d+)/);
  if (m) {
    const gen = Number(m[1]);
    const years: Record<number, number> = { 10: 2019, 20: 2020, 8: 2017, 9: 2018, 4: 2014, 5: 2014 };
    return [years[gen] ?? 2014 + Math.floor(gen / 2), 1, 1, variant, lower];
  }

  for (const re of [/galaxy\s+a(\d+)/, /galaxy\s+m(\d+)/]) {
    m = lower.match(re);
    if (m) {
      const num = Number(m[1]);
      return [samsungAMYear(num, lower), 3, 4, num, variant, lower];
    }
  }

  if (/^a17$/.test(lower)) return [2024, 3, 4, 17, variant, lower];
  if (lower.includes("j2")) return [2020, 4, 5, 2, variant, lower];
  if (lower.includes("xcover")) {
    const nums = [...lower.matchAll(/\d+/g)].map((x) => Number(x[0]));
    const gen = nums[0] ?? 4;
    return [2016 + gen, 4, 6, variant, lower];
  }

  const nums = [...lower.matchAll(/\d+/g)].map((x) => Number(x[0]));
  const fallbackYear = 2015 + Math.floor((nums.length ? Math.max(...nums) : 0) / 10);
  return [fallbackYear, 9, 9, variant, lower];
}

function iphoneReleaseChronologyKey(modelName: string): ChronologyKey[] {
  const lower = normalizeModelName(modelName, "Apple");
  const variant = extractVariantRank(lower);

  const seYear = lower.match(/se\s*\((\d{4})\)/);
  if (seYear) return [Number(seYear[1]), 3, 10, variant, lower];

  if (/\bse\b/.test(lower)) {
    const year = lower.includes("2022") ? 2022 : lower.includes("2020") ? 2020 : 2016;
    return [year, 3, 10, variant, lower];
  }

  for (const [re, year] of [
    [/iphone\s*xr/, 2018],
    [/iphone\s*xs\s*max/, 2018],
    [/iphone\s*xs/, 2018],
    [/iphone\s*x\b/, 2017],
  ] as const) {
    if (re.test(lower)) return [year, 2, 10, variant, lower];
  }

  const genMatch = lower.match(/iphone\s+(\d+)/);
  if (genMatch) {
    const generation = Number(genMatch[1]);
    const yearMap: Record<number, number> = {
      7: 2016,
      8: 2017,
      11: 2019,
      12: 2020,
      13: 2021,
      14: 2022,
      15: 2023,
      16: 2024,
      17: 2025,
    };
    const year = yearMap[generation] ?? 2007 + generation;
    return [year, 1, 10, generation, variant, lower];
  }

  return [2010, 9, 10, variant, lower];
}

function ipadReleaseChronologyKey(modelName: string): ChronologyKey[] {
  const lower = (modelName || "").trim().toLowerCase();
  const variant = extractVariantRank(lower);

  const yearMatch = modelName.match(/\((20\d{2})\)/);
  if (yearMatch) return [Number(yearMatch[1]), 5, 8, variant, lower];

  const genMatch = lower.match(/(\d+)(?:st|nd|rd|th)\s+gen/);
  if (genMatch) return [2012 + Number(genMatch[1]), 5, 8, variant, lower];

  const nums = [...lower.matchAll(/\d+/g)].map((x) => Number(x[0]));
  const year = 2015 + Math.floor((nums.length ? Math.max(...nums) : 0) / 10);
  return [year, 5, 8, variant, lower];
}

const ROMAN_VALUES: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
};

const XIAOMI_FAMILY_BRANDS = new Set(["xiaomi", "redmi", "poco"]);

function xiaomiFamilyReleaseYear(brandName: string, modelName: string): number | null {
  const brandKey = (brandName || "").trim().toLowerCase();
  const lower = (modelName || "").trim().toLowerCase();
  if (!lower) return null;

  const explicitYear = lower.match(/\b(20\d{2})\b/);
  if (explicitYear) return Number(explicitYear[1]);

  let m = lower.match(/^mi\s+(\d+)/);
  if (m) {
    const num = Number(m[1]);
    return num >= 9 ? 2010 + num : 2011 + num;
  }

  m = lower.match(/black shark\s+(\d+)/);
  if (m) return 2017 + Number(m[1]);
  if (lower.startsWith("black shark")) return 2018;

  m = lower.match(/note\s+(\d+)/);
  if (m) return 2012 + Number(m[1]);

  m = lower.match(/^k(\d+)/);
  if (m) {
    const num = Number(m[1]);
    if (num >= 20) return 2019 + Math.floor((num - 20) / 10);
  }

  if (brandKey === "xiaomi") {
    m = lower.match(/civi\s*(\d+)?/);
    if (m) return 2020 + Number(m[1] || "1");
    m = lower.match(/^(\d{2})(?:t|t pro| pro| ultra|s pro)?$/);
    if (m) return 2010 + Number(m[1]);
  }

  if (brandKey === "redmi") {
    if (lower === "go") return 2018;
    m = lower.match(/^a(\d+)/);
    if (m) return 2018 + Number(m[1]);
    m = lower.match(/^(\d+)(?:\s|$)/);
    if (m) return 2010 + Number(m[1]);
  }

  if (brandKey === "poco") {
    if (lower === "f1") return 2018;
    m = lower.match(/^[a-z]?(\d+)/);
    if (m) {
      const num = Number(m[1]);
      return num <= 6 ? 2018 + num : 2010 + num;
    }
  }

  return null;
}

function phoneReleaseYear(brandName: string, modelName: string): number | null {
  const brand = (brandName || "").trim().toLowerCase();
  const lower = (modelName || "").trim().toLowerCase();
  if (!lower || brand === "apple" || brand === "samsung") return null;

  const explicitYear = lower.match(/\b(20\d{2})\b/);
  if (explicitYear) return Number(explicitYear[1]);

  if (brand === "google") {
    if (/pixel\s+.*fold/.test(lower)) return 2023;
    const m = lower.match(/pixel\s+(\d+)/);
    if (m) {
      const gen = Number(m[1]);
      const years: Record<number, number> = { 4: 2019, 5: 2020, 6: 2021, 7: 2022, 8: 2023, 9: 2024, 10: 2025 };
      return years[gen] ?? null;
    }
  }

  if (brand === "sony") {
    const m = lower.match(/xperia\s+(\d+)\s+(viii|vii|vi|v|iv|iii|ii|i)\b/);
    if (m) {
      const series = Number(m[1]);
      const roman = ROMAN_VALUES[m[2]] ?? 1;
      if (series === 1 || series === 5) return 2018 + roman;
      if (series === 10) return 2019 + roman;
    }
  }

  if (brand === "oppo") {
    let m = lower.match(/find\s+x(\d+)/);
    if (m) return 2017 + Number(m[1]);
    if (/find\s+n(?:\s|$)/.test(lower) && !/find\s+n5/.test(lower)) return 2021;
    m = lower.match(/reno\s+(\d+)/);
    if (m) return 2010 + Number(m[1]);
    if (/find\s+n5/.test(lower)) return 2025;
  }

  if (brand === "honor") {
    let m = lower.match(/^(\d{3})\b/);
    if (m) {
      const num = Number(m[1]);
      const years: Record<number, number> = { 200: 2024, 300: 2024, 400: 2025, 600: 2026 };
      if (years[num]) return years[num];
    }
    if (/^play\b/.test(lower)) return 2018;
    m = lower.match(/magic\s*v(\d+)/);
    if (m) return 2021 + Number(m[1]);
    m = lower.match(/magic\s*(\d+)/);
    if (m) {
      const gen = Number(m[1]);
      const years: Record<number, number> = { 2: 2018, 3: 2021, 4: 2022, 5: 2023, 6: 2024, 7: 2025 };
      return years[gen] ?? 2016 + gen;
    }
    m = lower.match(/^(\d{2})\b/);
    if (m) {
      const num = Number(m[1]);
      const years: Record<number, number> = { 10: 2018, 20: 2019, 30: 2020, 50: 2020, 70: 2022, 80: 2022, 90: 2022 };
      return years[num] ?? 2008 + num;
    }
    if (/magic\s+v6/.test(lower)) return 2026;
    if (/magic\s+7/.test(lower)) return 2025;
  }

  if (brand === "huawei") {
    if (/mate\s+70/.test(lower)) return 2024;
    if (/pura\s+80/.test(lower)) return 2025;
    if (/nova\s+14/.test(lower)) return 2024;
  }

  if (brand === "oneplus") {
    const m = lower.match(/^(\d{2})[a-z]/) || lower.match(/^(\d{2})\b/);
    if (m) return 2011 + Number(m[1]);
  }

  if (brand === "motorola") {
    const m = lower.match(/(?:edge|razr)\s+(\d+)/);
    if (m) {
      const num = Number(m[1]);
      const years: Record<number, number> = { 30: 2022, 40: 2023, 50: 2024, 60: 2025, 70: 2026 };
      return years[num] ?? 2014 + num;
    }
  }

  if (brand === "vivo") {
    let m = lower.match(/x(\d{3})\b/);
    if (m) {
      const num = Number(m[1]);
      const years: Record<number, number> = { 100: 2023, 200: 2024, 300: 2025 };
      if (years[num]) return years[num];
    }
    if (/v50/.test(lower)) return 2025;
    if (/s20/.test(lower)) return 2025;
    m = lower.match(/y(\d{3})\b/);
    if (m) {
      const num = Number(m[1]);
      const years: Record<number, number> = { 200: 2024, 400: 2025 };
      if (years[num]) return years[num];
    }
  }

  if (brand === "realme") {
    if (/gt\s+7/.test(lower)) return 2025;
    const m = lower.match(/^(\d{2})\b/);
    if (m) return 2010 + Number(m[1]);
  }

  if (brand === "zte") {
    const m = lower.match(/z(\d+)/);
    if (m) {
      const num = Number(m[1]);
      const years: Record<number, number> = { 40: 2022, 50: 2023, 60: 2024, 70: 2025 };
      if (years[num]) return years[num];
    }
  }

  if (brand === "asus") {
    let m = lower.match(/zenfone\s+(\d+)/);
    if (m) return 2013 + Number(m[1]);
    m = lower.match(/rog phone\s+(\d+)/);
    if (m) return 2016 + Number(m[1]);
  }

  if (brand === "infinix") {
    if (/note\s+60/.test(lower) || /hot\s+60/.test(lower)) return 2026;
    if (/note\s+50/.test(lower) || /hot\s+50/.test(lower)) return 2025;
  }

  if (brand === "tecno") {
    if (/spark\s+40/.test(lower) || /camon\s+50/.test(lower)) return 2026;
    if (/spark\s+30/.test(lower) || /camon\s+40/.test(lower)) return 2025;
  }

  if (brand === "htc") {
    const m = lower.match(/u(\d+)/);
    if (m) return 2015 + Number(m[1]);
  }

  return null;
}

function deviceReleaseYear(brandName: string, modelName: string): number | null {
  const brand = (brandName || "").trim().toLowerCase();
  if (!brand || brand === "apple" || brand === "samsung") return null;

  if (XIAOMI_FAMILY_BRANDS.has(brand)) {
    const year = xiaomiFamilyReleaseYear(brandName, modelName);
    if (year !== null) return year;
  }

  return phoneReleaseYear(brandName, modelName);
}

function parseModelSortKey(name: string, brandName = ""): SortKey {
  const original = (name || "").trim();
  const lower = normalizeModelName(original, brandName);

  if (lower.startsWith("iphone")) {
    const seYear = lower.match(/se\s*\((\d{4})\)/);
    if (seYear) {
      return {
        lineRank: 10,
        line: "iphone-se",
        generation: Number(seYear[1]),
        subGeneration: 0,
        variantRank: 1,
        name: original,
      };
    }
    if (/\bse\b/.test(lower)) {
      const year = lower.includes("2022") ? 2022 : lower.includes("2020") ? 2020 : 2016;
      return {
        lineRank: 10,
        line: "iphone-se",
        generation: year,
        subGeneration: 0,
        variantRank: 1,
        name: original,
      };
    }

    const special: Array<[RegExp, number, number]> = [
      [/iphone\s*xs\s*max/, 10, 0.35],
      [/iphone\s*xs/, 10, 0.3],
      [/iphone\s*xr/, 10, 0.25],
      [/iphone\s*x\b/, 10, 0.2],
    ];
    for (const [re, gen, sub] of special) {
      if (re.test(lower)) {
        return {
          lineRank: 10,
          line: "iphone",
          generation: gen,
          subGeneration: sub,
          variantRank: extractVariantRank(lower),
          name: original,
        };
      }
    }

    const genMatch = lower.match(/iphone\s+(\d+)/);
    return {
      lineRank: 10,
      line: "iphone",
      generation: genMatch ? Number(genMatch[1]) : 0,
      subGeneration: 0,
      variantRank: extractVariantRank(lower),
      name: original,
    };
  }

  if (lower.includes("galaxy")) {
    const patterns: Array<[RegExp, number, string]> = [
      [/galaxy\s+z\s+fold\s*(\d+)/, 11, "galaxy-z-fold"],
      [/galaxy\s+z\s+flip\s*(\d+)/, 12, "galaxy-z-flip"],
      [/galaxy\s+s\s*(\d+)/, 10, "galaxy-s"],
      [/galaxy\s+note\s*(\d+)/, 13, "galaxy-note"],
      [/galaxy\s+a\s*(\d+)/, 20, "galaxy-a"],
      [/galaxy\s+m\s*(\d+)/, 25, "galaxy-m"],
    ];
    for (const [re, lineRank, line] of patterns) {
      const m = lower.match(re);
      if (m) {
        return {
          lineRank,
          line,
          generation: Number(m[1]),
          subGeneration: 0,
          variantRank: extractVariantRank(lower),
          name: original,
        };
      }
    }
  }

  const seriesPatterns: Array<[RegExp, number, string]> = [
    [/redmi\s+note\s*(\d+)/, 15, "redmi-note"],
    [/redmi\s+(\d+)/, 16, "redmi"],
    [/poco\s+[a-z]?\s*(\d+)/, 17, "poco"],
    [/(?:mi|xiaomi)\s+(\d+)/, 14, "xiaomi-mi"],
    [/honor\s+(\d+)/, 18, "honor"],
    [/nova\s+(\d+)/, 19, "huawei-nova"],
  ];
  for (const [re, lineRank, line] of seriesPatterns) {
    const m = lower.match(re);
    if (m) {
      return {
        lineRank,
        line,
        generation: Number(m[1]),
        subGeneration: 0,
        variantRank: extractVariantRank(lower),
        name: original,
      };
    }
  }

  const nums = [...lower.matchAll(/\d+/g)].map((m) => Number(m[0]));
  const generation = nums.length ? Math.max(...nums) : 0;
  const line = lower.split(/\s+/).slice(0, 2).join(" ");

  return {
    lineRank: 50,
    line,
    generation,
    subGeneration: 0,
    variantRank: extractVariantRank(lower),
    name: original,
  };
}

function releaseChronologyKey(model: DeviceModelLike): ChronologyKey[] {
  const original = (model.name || "").trim();
  const lower = original.toLowerCase();
  const brandName = model.brand?.name || "";
  const brandLower = brandName.trim().toLowerCase();
  const variant = extractVariantRank(lower);

  const explicitYear = original.match(/\b(20\d{2})\b/);
  if (explicitYear) return [Number(explicitYear[1]), 1, 0, variant, lower];

  if (brandLower === "samsung" || lower.includes("galaxy")) {
    return samsungReleaseChronologyKey(original);
  }

  if (brandLower === "apple" || lower.includes("iphone")) {
    if (lower.includes("ipad")) return ipadReleaseChronologyKey(original);
    if (lower.includes("watch")) {
      const series = lower.match(/series\s*(\d+)/);
      const year = series ? 2015 + Number(series[1]) : 2015;
      return [year, 1, 7, variant, lower];
    }
    if (lower.includes("iphone")) return iphoneReleaseChronologyKey(original);
  }

  const phoneYear = deviceReleaseYear(brandName, original);
  if (phoneYear !== null) {
    return [phoneYear, 1, 0, variant, lower];
  }

  const key = parseModelSortKey(original, brandName);
  const approxYear = 2010 + Math.min(key.generation, 25);
  return [approxYear, key.lineRank, key.line, key.generation, key.subGeneration, key.variantRank, key.name];
}

function compareChronologyKeys(a: ChronologyKey[], b: ChronologyKey[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i];
    const bv = b[i];
    if (av === bv) continue;
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    return String(av).localeCompare(String(bv), "ru", { numeric: true, sensitivity: "base" });
  }
  return 0;
}

/** Старые модели выше: по хронологии выхода (год → линейка → вариант). */
export function compareDeviceModels(a: DeviceModelLike, b: DeviceModelLike): number {
  return compareChronologyKeys(releaseChronologyKey(a), releaseChronologyKey(b));
}

export function sortDeviceModels<T extends DeviceModelLike>(models: T[]): T[] {
  return [...models].sort(compareDeviceModels);
}

/** Сортировка моделей CRM (поле brandName). */
export function sortModelsByRelease<T extends { name: string; brandName?: string }>(models: T[]): T[] {
  return [...models].sort((a, b) =>
    compareDeviceModels(
      { name: a.name, brand: { name: a.brandName || "" } },
      { name: b.name, brand: { name: b.brandName || "" } },
    ),
  );
}
