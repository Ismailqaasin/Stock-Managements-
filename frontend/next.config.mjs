/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false, devIndicators: false, allowedDevOrigins: ['*.e2b.app'],
  experimental: {cpus: 2},
  async rewrites() { return process.env.API_ORIGIN ? [{source:'/api/:path*',destination:`${process.env.API_ORIGIN}/api/:path*`}] : []; }
};
export default config;
