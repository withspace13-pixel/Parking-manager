/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    if (dev && process.platform === "win32") {
      const ignored = [
        "**/.git/**",
        "**/.next/**",
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
