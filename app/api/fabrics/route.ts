import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import {
  getPublishedFabrics,
  getMenuFabrics,
  getHomepageFabrics,
  getEnquiryFabrics,
  getCatalogFabrics
} from '@/lib/fabricsService';

export const dynamic = 'force-dynamic';

export async function GET(request?: NextRequest) {
  try {
    // Anti-scraping rate limiter (max 60 requests per 60s per IP)
    const forwardedFor = request?.headers?.get('x-forwarded-for');
    const realIp = request?.headers?.get('x-real-ip');
    const clientIp = (forwardedFor ? forwardedFor.split(',')[0] : realIp) || '127.0.0.1';

    const limitResult = rateLimit(`fabrics_${clientIp.trim()}`, 60, 60);
    if (!limitResult.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(limitResult.resetInSeconds),
          },
        }
      );
    }

    let mode: 'all' | 'menu' | 'homepage' | 'enquiry' | 'catalog' = 'all';

    if (request && request.url) {
      try {
        const { searchParams } = new URL(request.url);
        if (searchParams.get('menu') === 'true') mode = 'menu';
        else if (searchParams.get('homepage') === 'true') mode = 'homepage';
        else if (searchParams.get('enquiry') === 'true') mode = 'enquiry';
        else if (searchParams.get('catalog') === 'true') mode = 'catalog';
      } catch {
        mode = 'all';
      }
    }

    let fabrics;
    switch (mode) {
      case 'menu':
        fabrics = await getMenuFabrics();
        break;
      case 'homepage':
        fabrics = await getHomepageFabrics();
        break;
      case 'enquiry':
        fabrics = await getEnquiryFabrics();
        break;
      case 'catalog':
        fabrics = await getCatalogFabrics();
        break;
      default:
        fabrics = await getPublishedFabrics();
        break;
    }

    return NextResponse.json(
      { success: true, count: fabrics.length, data: fabrics },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch fabrics';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
