/** @type {import('next').NextConfig} */
const nextConfig = {
  // dev/build 산출물을 분리해 청크 404(매니페스트 불일치)를 줄입니다.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  webpack: (config, { dev }) => {
    if (dev && process.platform === "win32") {
      const ignored = [
        "**/.git/**",
        "**/.next/**",
        "**/.next-dev/**",
        "**/node_modules/**",
        "C:/$Recycle.Bin/**",
        "C:/System Volume Information/**",
        "C:/hiberfil.sys",
        "C:/pagefile.sys",
        "C:/swapfile.sys",
        "C:/DumpStack.log.tmp",
      ];
      config.watchOptions = {
        ...(config.watchOptions || {}),
        ignored,
      };
    }
    return config;
  },
};
module.exports = nextConfig;
