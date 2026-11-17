import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/_next/data/', '/quarantine/'],
      },
      {
        // Block aggressive AI scrapers from draining bandwidth
        userAgent: ['GPTBot', 'CCBot', 'anthropic-ai', 'Claude-Web', 'Bytespider'],
        disallow: ['/api/', '/fabrics/', '/enquiry/'],
      },
    ],
    sitemap: 'https://viralfabrics.com/sitemap.xml',
  };
}

