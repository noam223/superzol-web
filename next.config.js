/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.shufersal.co.il',
      },
      {
        protocol: 'https',
        hostname: 'www.rami-levy.co.il',
      },
      {
        protocol: 'https',
        hostname: 'm.pricez.co.il',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
    ],
  },
};

module.exports = nextConfig;
