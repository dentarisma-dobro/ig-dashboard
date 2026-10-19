/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Библиотека Telegram (GramJS) работает с сетью напрямую, её нельзя упаковывать вебпаком
    serverComponentsExternalPackages: ["telegram"],
  },
};

module.exports = nextConfig;
