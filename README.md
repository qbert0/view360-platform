# @qbert0/view360-platform

Nuxt Layer dùng chung cho các sản phẩm View360. Package này sở hữu:

- Three.js panorama engine, adapter multi-resolution và marker plugins;
- toàn bộ trang `/experience/**` và `/admin/**`;
- viewer/admin/designer components, composables, stores và layouts;
- UI primitives và CSS cần cho viewer/admin.

Ứng dụng thương hiệu chỉ cần kế thừa layer:

```ts
export default defineNuxtConfig({
  extends: ['@qbert0/view360-platform'],
  runtimeConfig: {
    public: { siteId: 'my-site' },
  },
});
```

Trong monorepo hiện tại, app dùng đường dẫn `../../packages/view360-platform` để có
hot reload khi phát triển. Khi tách thành repository/package registry riêng, đổi
dependency sang một version cố định, ví dụ `@qbert0/view360-platform: ^0.2.0`.

Mã trong package dùng alias `#view360/*`; không dùng `~/*` để tránh phụ thuộc vào
source root của app tiêu thụ.
