/** @type {import('next').NextConfig} */
const nextConfig = {
    // Electron loads the renderer from the filesystem in production, so we
    // export the app as static HTML/JS.  See:
    //   https://nextjs.org/docs/app/guides/static-exports
    output: 'export',
    // The main process expects to find index.html at desktop/out/.
    distDir: '../out',
    // Disable Next's image optimiser — it needs a running server.
    images: { unoptimized: true },
    // Electron loads pages via file://, which has no trailing-slash support.
    trailingSlash: true,
    // We don't want ESLint to fail the build when developing against Electron.
    eslint: { ignoreDuringBuilds: true },
    typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
