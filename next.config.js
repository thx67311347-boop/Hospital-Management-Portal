/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true
  },
  serverExternalPackages: ['@img/sharp-wasm32']
}
module.exports = nextConfig
