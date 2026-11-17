import { connectDB } from './mongodb';
import WebsiteFabric from '@/models/WebsiteFabric';
import { FABRICS } from '@/data/fabrics';
import type { LiveFabric } from '@/types';

export type { LiveFabric };

function cleanDescription(desc: string): string {
  return (desc || '')
    .replace(/\.h+$/i, '.')
    .replace(/[hH]{3,}$/g, '')
    .trim();
}

interface FabricDocumentLike {
  _id?: unknown;
  id?: string;
  name?: string;
  title?: string;
  slug: string;
  subtitle?: string;
  shortDesc?: string;
  description?: string;
  gsmRange?: string;
  applications?: string[];
  features?: string[];
  weaveType?: string;
  finishing?: string[];
  image?: string;
  images?: string[];
  banner?: string;
  isPublished?: boolean;
  showInCatalog?: boolean;
  showInMenu?: boolean;
  showOnHomepage?: boolean;
  showInEnquiry?: boolean;
  displayOrder?: number;
  menuOrder?: number;
}

function mapToLiveFabric(doc: FabricDocumentLike): LiveFabric {
  const staticFound = FABRICS.find((f) => f.slug === doc.slug);
  return {
    id: doc._id ? String(doc._id) : (doc.id || doc.slug),
    name: doc.name || doc.title || staticFound?.title || '',
    title: doc.name || doc.title || staticFound?.title || '',
    slug: doc.slug,
    subtitle: doc.subtitle || staticFound?.subtitle || '',
    shortDesc: doc.shortDesc || staticFound?.shortDesc || '',
    description: cleanDescription(doc.description || staticFound?.description || ''),
    gsmRange: doc.gsmRange || staticFound?.gsmRange || '',
    applications: (doc.applications && doc.applications.length > 0) ? doc.applications : (staticFound?.applications || []),
    features: (doc.features && doc.features.length > 0) ? doc.features : (staticFound?.features || []),
    weaveType: doc.weaveType || staticFound?.weaveType || '',
    finishing: (doc.finishing && doc.finishing.length > 0) ? doc.finishing : (staticFound?.finishing || []),
    image: doc.image || staticFound?.image || '/assets/uploads/2025/09/bsy-fabrics.png',
    images: (doc.images && doc.images.length > 0)
      ? doc.images
      : (doc.image ? [doc.image] : (staticFound?.image ? [staticFound.image] : ['/assets/uploads/2025/09/bsy-fabrics.png'])),
    banner: doc.banner || staticFound?.banner || '/assets/uploads/2025/09/bsy-fabrics-banner.png',
    isPublished: doc.isPublished !== undefined ? doc.isPublished : true,
    showInCatalog: doc.showInCatalog !== undefined ? doc.showInCatalog : true,
    showInMenu: doc.showInMenu !== undefined ? doc.showInMenu : true,
    showOnHomepage: doc.showOnHomepage !== undefined ? doc.showOnHomepage : true,
    showInEnquiry: doc.showInEnquiry !== undefined ? doc.showInEnquiry : true,
    displayOrder: doc.displayOrder || 0,
    menuOrder: doc.menuOrder || 0,
  };
}

function sortFabricsBySequence<T extends FabricDocumentLike>(docs: T[]): T[] {
  return [...docs].sort((a, b) => {
    // If menuOrder is defined and > 0, it takes highest precedence, then displayOrder
    const orderA = (typeof a.menuOrder === 'number' && a.menuOrder > 0)
      ? a.menuOrder
      : ((typeof a.displayOrder === 'number' && a.displayOrder > 0) ? a.displayOrder : 9999);
    const orderB = (typeof b.menuOrder === 'number' && b.menuOrder > 0)
      ? b.menuOrder
      : ((typeof b.displayOrder === 'number' && b.displayOrder > 0) ? b.displayOrder : 9999);

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    const dateA = (a as any).createdAt ? new Date((a as any).createdAt).getTime() : 0;
    const dateB = (b as any).createdAt ? new Date((b as any).createdAt).getTime() : 0;
    return dateB - dateA;
  });
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.data as T;
  }
  return null;
}

function setCached<T>(key: string, data: T, ttlSeconds: number = 60): void {
  if (memoryCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of memoryCache.entries()) {
      if (now >= v.expiresAt) memoryCache.delete(k);
    }
  }
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Fetch all published fabrics from MongoDB Atlas with in-memory TTL caching and static fallback
 */
export async function getPublishedFabrics(): Promise<LiveFabric[]> {
  const cached = getCached<LiveFabric[]>('fabrics_published');
  if (cached) return cached;

  let result: LiveFabric[] | null = null;
  try {
    if (process.env.MONGODB_URI) {
      await connectDB();
      const docs = await WebsiteFabric.find({ isPublished: true })
        .sort({ menuOrder: 1, displayOrder: 1, createdAt: -1 })
        .lean();

      if (docs && docs.length > 0) {
        result = sortFabricsBySequence(docs).map(mapToLiveFabric);
        setCached('fabrics_published', result, 60);
        return result;
      }
    }
  } catch (error) {
    console.warn('[Fabrics Service] MongoDB query failed, falling back to static catalogue:', error);
  }

  // Graceful fallback to static fabrics
  result = FABRICS.map((f, i) => ({
    id: f.slug,
    name: f.title,
    title: f.title,
    slug: f.slug,
    subtitle: f.subtitle,
    shortDesc: f.shortDesc,
    description: cleanDescription(f.description),
    gsmRange: f.gsmRange,
    applications: f.applications,
    features: f.features,
    weaveType: f.weaveType,
    finishing: f.finishing,
    image: f.image,
    images: [f.image],
    banner: f.banner,
    isPublished: true,
    showInCatalog: true,
    showInMenu: true,
    showOnHomepage: true,
    showInEnquiry: true,
    displayOrder: i + 1,
    menuOrder: i + 1,
  }));

  setCached('fabrics_published', result, 60);
  return result;
}

/**
 * Fetch fabrics for main catalog directory (/fabrics)
 */
export async function getCatalogFabrics(): Promise<LiveFabric[]> {
  const cached = getCached<LiveFabric[]>('fabrics_catalog');
  if (cached) return cached;

  let result: LiveFabric[] | null = null;
  try {
    if (process.env.MONGODB_URI) {
      await connectDB();
      const docs = await WebsiteFabric.find({
        isPublished: true,
        showInCatalog: { $ne: false },
      })
        .sort({ menuOrder: 1, displayOrder: 1, createdAt: -1 })
        .lean();

      if (docs && docs.length > 0) {
        result = sortFabricsBySequence(docs).map(mapToLiveFabric);
        setCached('fabrics_catalog', result, 60);
        return result;
      }
    }
  } catch (error) {
    console.warn('[Fabrics Service] Catalog query failed, falling back to published fabrics:', error);
  }

  const all = await getPublishedFabrics();
  result = all.filter((f) => f.showInCatalog !== false);
  setCached('fabrics_catalog', result, 60);
  return result;
}

/**
 * Fetch fabrics designated for navbar & footer menu dropdown with fallback
 */
export async function getMenuFabrics(): Promise<LiveFabric[]> {
  const cached = getCached<LiveFabric[]>('fabrics_menu');
  if (cached) return cached;

  let result: LiveFabric[] | null = null;
  try {
    if (process.env.MONGODB_URI) {
      await connectDB();
      const docs = await WebsiteFabric.find({ 
        isPublished: true, 
        showInMenu: { $ne: false } 
      })
        .sort({ menuOrder: 1, displayOrder: 1, createdAt: -1 })
        .lean();

      if (docs && docs.length > 0) {
        result = sortFabricsBySequence(docs).map(mapToLiveFabric);
        setCached('fabrics_menu', result, 60);
        return result;
      }
    }
  } catch (error) {
    console.warn('[Fabrics Service] Menu MongoDB query failed, falling back to published fabrics:', error);
  }

  const all = await getPublishedFabrics();
  result = all.filter((f) => f.showInMenu !== false);
  setCached('fabrics_menu', result, 60);
  return result;
}

/**
 * Fetch fabrics for homepage portfolio section
 */
export async function getHomepageFabrics(): Promise<LiveFabric[]> {
  const cached = getCached<LiveFabric[]>('fabrics_homepage');
  if (cached) return cached;

  let result: LiveFabric[] | null = null;
  try {
    if (process.env.MONGODB_URI) {
      await connectDB();
      const docs = await WebsiteFabric.find({ 
        isPublished: true, 
        showOnHomepage: { $ne: false } 
      })
        .sort({ menuOrder: 1, displayOrder: 1, createdAt: -1 })
        .lean();

      if (docs && docs.length > 0) {
        result = sortFabricsBySequence(docs).map(mapToLiveFabric);
        setCached('fabrics_homepage', result, 60);
        return result;
      }
    }
  } catch (error) {
    console.warn('[Fabrics Service] Homepage query failed, falling back to published fabrics:', error);
  }

  const all = await getPublishedFabrics();
  result = all.filter((f) => f.showOnHomepage !== false);
  setCached('fabrics_homepage', result, 60);
  return result;
}

/**
 * Fetch fabrics for enquiry form dropdown
 */
export async function getEnquiryFabrics(): Promise<LiveFabric[]> {
  const cached = getCached<LiveFabric[]>('fabrics_enquiry');
  if (cached) return cached;

  let result: LiveFabric[] | null = null;
  try {
    if (process.env.MONGODB_URI) {
      await connectDB();
      const docs = await WebsiteFabric.find({ 
        isPublished: true, 
        showInEnquiry: { $ne: false } 
      })
        .sort({ menuOrder: 1, displayOrder: 1, createdAt: -1 })
        .lean();

      if (docs && docs.length > 0) {
        result = sortFabricsBySequence(docs).map(mapToLiveFabric);
        setCached('fabrics_enquiry', result, 60);
        return result;
      }
    }
  } catch (error) {
    console.warn('[Fabrics Service] Enquiry query failed, falling back to published fabrics:', error);
  }

  const all = await getPublishedFabrics();
  result = all.filter((f) => f.showInEnquiry !== false);
  setCached('fabrics_enquiry', result, 60);
  return result;
}

/**
 * Fetch a single fabric by its slug
 */
export async function getFabricBySlug(slug: string): Promise<LiveFabric | null> {
  // Strict format check: only alphanumeric and hyphens allowed (prevents NoSQL injection / query poisoning)
  if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/i.test(slug.trim())) {
    return null;
  }
  const cleanSlug = slug.trim().toLowerCase();
  const cacheKey = `fabric_slug_${cleanSlug}`;
  const cached = getCached<LiveFabric | null>(cacheKey);
  if (cached !== null) return cached;

  try {
    if (process.env.MONGODB_URI) {
      await connectDB();
      const doc = await WebsiteFabric.findOne({ slug: cleanSlug, isPublished: true }).lean();
      if (doc) {
        const mapped = mapToLiveFabric(doc);
        setCached(cacheKey, mapped, 60);
        return mapped;
      }
    }
  } catch (error) {
    console.warn(`[Fabrics Service] Error fetching slug "${cleanSlug}":`, error);
  }

  const staticFound = FABRICS.find((f) => f.slug === cleanSlug);
  if (staticFound) {
    const fallback: LiveFabric = {
      id: staticFound.slug,
      name: staticFound.title,
      title: staticFound.title,
      slug: staticFound.slug,
      subtitle: staticFound.subtitle,
      shortDesc: staticFound.shortDesc,
      description: cleanDescription(staticFound.description),
      gsmRange: staticFound.gsmRange,
      applications: staticFound.applications,
      features: staticFound.features,
      weaveType: staticFound.weaveType,
      finishing: staticFound.finishing,
      image: staticFound.image,
      banner: staticFound.banner,
      isPublished: true,
      showInCatalog: true,
      showInMenu: true,
      showOnHomepage: true,
      showInEnquiry: true,
      displayOrder: 1,
      menuOrder: 1,
    };
    setCached(cacheKey, fallback, 60);
    return fallback;
  }

  setCached(cacheKey, null, 60);
  return null;
}
