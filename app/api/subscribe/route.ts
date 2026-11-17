import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { connectDB } from '@/lib/mongodb';
import { Subscriber } from '@/models/Subscriber';

function sanitizeInput(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(/\0/g, '') // Strip null bytes
    .replace(/[<>]/g, '') // Strip HTML tags
    .replace(/^\$/, '') // Disallow leading MongoDB operator characters
    .trim();
}

export async function POST(request: Request) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const clientIp = (forwardedFor ? forwardedFor.split(',')[0] : realIp) || '127.0.0.1';

    const limitResult = rateLimit(clientIp.trim(), 5, 60);
    if (!limitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many attempts. Please wait ${limitResult.resetInSeconds} seconds before trying again.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(limitResult.resetInSeconds),
          },
        }
      );
    }

    // Payload size check (reject payload bombs > 10KB immediately)
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > 10_000) {
      return NextResponse.json(
        { success: false, error: 'Payload size exceeds allowable limit.' },
        { status: 413 }
      );
    }

    const body = await request.json();

    // Anti-Bot Honeypot Defense
    if (body?.website || body?.company_fax || body?.url || body?.hp_field) {
      return NextResponse.json({
        success: true,
        message: 'Thank you for subscribing to Viral Fabrics updates.',
        data: { email: 'verified@viralfabrics.com' },
      });
    }

    const rawEmail = body?.email;

    if (!rawEmail) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid email address.' },
        { status: 400 }
      );
    }

    const email = sanitizeInput(String(rawEmail)).toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid email address.' },
        { status: 400 }
      );
    }

    // Try storing in MongoDB if configured
    try {
      if (process.env.MONGODB_URI) {
        await connectDB();
        await Subscriber.findOneAndUpdate(
          { email },
          { email, subscribedAt: new Date(), status: 'active' },
          { upsert: true, new: true }
        );
      }
    } catch (dbErr) {
      console.warn('[SUBSCRIBE] DB persistence skipped or failed:', dbErr);
    }

    console.log('[NEWSLETTER SUBSCRIBER]', {
      email,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Thank you for subscribing to Viral Fabrics updates.',
      data: { email },
    });
  } catch (error) {
    console.error('[SUBSCRIBE ERROR]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process subscription. Please try again.' },
      { status: 500 }
    );
  }
}

