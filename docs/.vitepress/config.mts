import { defineConfig } from "vitepress";

// GitHub Pages project site: https://chavisnguyen.github.io/FiMake/
// The `base` must match the repo name or assets/links break on Pages.
export default defineConfig({
  title: "FiMake",
  description:
    "Let AI agents work directly in your Figma documents — create, edit, organize, and read.",
  base: "/FiMake/",
  // Internal implementation plans live in the repo but not on the site.
  srcExclude: ["plans/**"],
  lang: "en-US",
  lastUpdated: true,
  cleanUrls: false,

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/FiMake/icon.svg" }],
    ["link", { rel: "icon", type: "image/svg+xml", href: "/FiMake/favicon.svg" }],
    ["link", { rel: "icon", type: "image/png", sizes: "32x32", href: "/FiMake/favicon-32x32.png" }],
    ["link", { rel: "icon", type: "image/png", sizes: "16x16", href: "/FiMake/favicon-16x16.png" }],
    ["link", { rel: "apple-touch-icon", sizes: "180x180", href: "/FiMake/apple-touch-icon.png" }],
    ["link", { rel: "manifest", href: "/FiMake/site.webmanifest" }],
    ["meta", { name: "theme-color", content: "#7c3aed" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "FiMake — AI agents inside your Figma documents" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Fimake lets AI agents work directly in your Figma documents — create, edit, organize, and read.",
      },
    ],
    ["meta", { property: "og:url", content: "https://chavisnguyen.github.io/FiMake/" }],
    ["meta", { property: "og:image", content: "https://chavisnguyen.github.io/FiMake/og-image.png" }],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: "FiMake — AI agents inside your Figma documents" }],
    [
      "meta",
      {
        name: "twitter:description",
        content:
          "Fimake lets AI agents work directly in your Figma documents — create, edit, organize, and read.",
      },
    ],
    ["meta", { name: "twitter:image", content: "https://chavisnguyen.github.io/FiMake/og-image.png" }],
  ],

  themeConfig: {
    siteTitle: "FiMake",
    logo: "/icon.svg",

    nav: [
      { text: "Guide", link: "/usage" },
      { text: "Tools", link: "/tools" },
      { text: "Architecture", link: "/architecture" },
      { text: "Troubleshooting", link: "/troubleshooting" },
      { text: "Development", link: "/development" },
      {
        text: "v1.0.x",
        items: [
          {
            text: "Releases",
            link: "https://github.com/chavisnguyen/FiMake/releases",
          },
          {
            text: "Changelog",
            link: "https://github.com/chavisnguyen/FiMake/releases",
          },
        ],
      },
    ],

    sidebar: [
      {
        text: "Start here",
        items: [
          { text: "Introduction", link: "/" },
          { text: "Quickstart", link: "/quickstart" },
          { text: "Usage", link: "/usage" },
          { text: "Troubleshooting", link: "/troubleshooting" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Tools (35)", link: "/tools" },
          { text: "Architecture", link: "/architecture" },
        ],
      },
      {
        text: "Contributing",
        items: [{ text: "Development", link: "/development" }],
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/chavisnguyen/FiMake" }],

    search: { provider: "local" },

    outline: { level: [2, 3], label: "On this page" },

    editLink: {
      pattern: "https://github.com/chavisnguyen/FiMake/edit/master/docs/:path",
      text: "Edit this page on GitHub",
    },

    lastUpdated: { text: "Last updated" },

    docFooter: { prev: "Previous", next: "Next" },

    footer: {
      message: "Released under the Apache-2.0 License.",
      copyright: "Copyright © 2026 FiMake contributors",
    },
  },
});
