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
    ],
  },
};

module.exports = nextConfig;
