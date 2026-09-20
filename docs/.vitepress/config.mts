import { defineConfig } from "vitepress";

// GitHub Pages project site: https://chavisnguyen.github.io/FiMake/
// The `base` must match the repo name or assets/links break on Pages.
export default defineConfig({
  title: "FiMake",
  description:
    "Let AI agents work directly in your Figma documents — create, edit, organize, and read.",
  base: "/FiMake/",
  lang: "en-US",
  lastUpdated: true,
  cleanUrls: false,

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/icon.svg" }],
    ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    ["meta", { name: "theme-color", content: "#7c3aed" }],
    [
      "meta",
      {
        name: "og:description",
        content:
          "Fimake lets AI agents work directly in your Figma documents — create, edit, organize, and read.",
      },
    ],
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
        text: "Getting started",
        items: [
          { text: "Introduction", link: "/" },
          { text: "Quickstart (5 min)", link: "/quickstart" },
          { text: "Full usage guide", link: "/usage" },
          { text: "Troubleshooting", link: "/troubleshooting" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Tools (27)", link: "/tools" },
          { text: "Architecture", link: "/architecture" },
          { text: "Security", link: "/architecture#security" },
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
