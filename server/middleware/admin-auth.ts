/**
 * server/middleware/admin-auth.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin API guard.
 * Docs: "API admin hiện có chưa thấy kiểm tra đăng nhập tại các handler"
 *
 * Rules:
 *  1. Block /api/admin/** unless ENABLE_ADMIN=true
 *  2. Require X-Admin-Key header to match ADMIN_KEY env if set
 *
 * This is a minimal auth gate suitable for MVP single-org deployment.
 * Production should replace with proper session/JWT middleware.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export default defineEventHandler((event) => {
  const url = event.node.req.url ?? '';

  // Only guard /api/admin/** routes
  if (!url.startsWith('/api/admin')) return;

  const config = useRuntimeConfig();

  // 1. Admin must be explicitly enabled
  if (!config.enableAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin API bị tắt. Set ENABLE_ADMIN=true để kích hoạt.',
    });
  }

  // 2. If ADMIN_KEY is set, require matching header
  if (config.adminKey) {
    const provided = getHeader(event, 'x-admin-key');
    if (provided !== config.adminKey) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Thiếu hoặc sai X-Admin-Key header.',
      });
    }
  }
});
