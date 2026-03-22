const express = require("express");
const axios = require("axios");
const zlib = require("zlib");
const { URL } = require("url");
const NodeCache = require("node-cache");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CONFIGURATION
// ============================================================
const SOURCE_DOMAIN = "www.infoworld.com";
const SOURCE_ORIGIN = `https://${SOURCE_DOMAIN}`;

// Domain mirror
const MIRROR_DOMAIN = process.env.MIRROR_DOMAIN || "infoworld.media";

const CACHE_TTL = parseInt(process.env.CACHE_TTL || "600", 10);
const cache = new NodeCache({ stdTTL: CACHE_TTL, checkperiod: 120, maxKeys: 5000 });

// Regex-ready escaped source domain
const ESCAPED_SOURCE = SOURCE_DOMAIN.replace(/\./g, "\\.");

const HOP_BY_HOP_HEADERS = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade", "host",
  "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor",
  "x-forwarded-for", "x-forwarded-proto", "x-real-ip",
]);

const REWRITABLE_TYPES = [
  "text/html", "text/css",
  "application/javascript", "text/javascript",
  "application/json", "text/xml", "application/xml",
  "application/rss+xml", "application/atom+xml", "text/plain",
];

// ============================================================
// CUSTOM UI THEME — Modern Design Override
// ============================================================

const CUSTOM_BRAND = "InfoWorld";

// Patterns to remove ads and tracking scripts (server-side)
const AD_TRACKING_PATTERNS = [
  /<script[^>]*googletagmanager\.com[^>]*>[\s\S]*?<\/script>/gi,
  /<noscript[^>]*>[\s\S]*?googletagmanager\.com[\s\S]*?<\/noscript>/gi,
  /<script[^>]*google-analytics\.com[^>]*>[\s\S]*?<\/script>/gi,
  /<script[^>]*googlesyndication\.com[^>]*>[\s\S]*?<\/script>/gi,
  /<script[^>]*doubleclick\.net[^>]*>[\s\S]*?<\/script>/gi,
  /<script[^>]*facebook\.net[^>]*>[\s\S]*?<\/script>/gi,
  /<script[^>]*onetrust\.com[^>]*>[\s\S]*?<\/script>/gi,
  /<link[^>]*onetrust\.com[^>]*\/?>/gi,
  /<script[^>]*chartbeat\.com[^>]*>[\s\S]*?<\/script>/gi,
  /<script[^>]*parsely[^>]*>[\s\S]*?<\/script>/gi,
  /<script[^>]*foundrydc\.com[^>]*>[\s\S]*?<\/script>/gi,
  /<script[^>]*hotjar\.com[^>]*>[\s\S]*?<\/script>/gi,
  /<script[^>]*>\s*(?:var|window\.)\s*dataLayer[\s\S]*?<\/script>/gi,
  /<ins\s+class="adsbygoogle"[\s\S]*?<\/ins>/gi,
];

function getCustomCss() {
  return `<style id="mirror-theme">
/* ===== CSS VARIABLES ===== */
:root {
  --m-primary: #1e40af;
  --m-primary-l: #3b82f6;
  --m-primary-d: #1e3a8a;
  --m-accent: #06b6d4;
  --m-accent-l: #22d3ee;
  --m-bg: #f8fafc;
  --m-card: #fff;
  --m-dark: #0f172a;
  --m-text: #1e293b;
  --m-muted: #64748b;
  --m-light: #f1f5f9;
  --m-border: #e2e8f0;
  --m-shadow: 0 1px 3px rgba(0,0,0,.1), 0 1px 2px rgba(0,0,0,.06);
  --m-shadow-lg: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -2px rgba(0,0,0,.05);
  --m-radius: 12px;
  --m-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
}
* { box-sizing: border-box; }
body {
  font-family: var(--m-font) !important;
  background: var(--m-bg) !important;
  color: var(--m-text) !important;
  line-height: 1.7 !important;
  -webkit-font-smoothing: antialiased;
  margin: 0 !important;
}
html { scroll-behavior: smooth !important; }
::selection { background: var(--m-primary-l); color: #fff; }

/* ===== HIDE ORIGINAL CHROME & ADS ===== */
header.site-header, .site-header, #site-header,
[class*="site-header"], [class*="main-header"],
.foundry-header, .masthead, [class*="masthead"] { display: none !important; }

footer.site-footer, .site-footer, #site-footer,
[class*="site-footer"], .foundry-footer,
[class*="footer-wrap"], [class*="idg-footer"] { display: none !important; }

[class*="ad-container"], [class*="ad-slot"], [class*="leaderboard"],
[class*="billboard"], [id*="google_ads"], [class*="dfp-"],
.ad, .ads, .advert,
[class*="newsletter-promo"], [class*="subscribe-promo"],
[id*="onetrust"], [class*="onetrust"],
[class*="cookie-banner"], [class*="consent-banner"],
iframe[src*="ads"], iframe[src*="doubleclick"],
ins.adsbygoogle, [class*="sponsored"], [data-ad], [class*="ad-wrap"],
[class*="social-share"], [class*="share-bar"], [class*="social-bar"] { display: none !important; }

aside, .sidebar, [class*="sidebar"], [class*="right-rail"] { display: none !important; }

/* ===== CUSTOM HEADER ===== */
#m-header {
  background: linear-gradient(135deg, var(--m-primary) 0%, var(--m-primary-d) 100%);
  color: #fff;
  position: sticky;
  top: 0;
  z-index: 10000;
  box-shadow: var(--m-shadow-lg);
}
#m-header .m-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
}
#m-header .m-logo {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -.5px;
  color: #fff !important;
  text-decoration: none !important;
  display: flex;
  align-items: center;
  gap: 8px;
}
#m-header .m-logo b {
  background: var(--m-accent);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: .65em;
  font-weight: 700;
}
#m-header nav a {
  color: rgba(255,255,255,.85) !important;
  text-decoration: none !important;
  margin-left: 24px;
  font-weight: 500;
  font-size: .95rem;
  transition: color .2s;
}
#m-header nav a:hover { color: var(--m-accent-l) !important; }

/* ===== LAYOUT ===== */
main, .main-content, #content, .content-area, [role="main"] {
  max-width: 900px !important;
  margin: 0 auto !important;
  padding: 32px 24px !important;
}
.main-col, [class*="main-col"], .content-col, [class*="content-col"] {
  width: 100% !important;
  max-width: 100% !important;
  flex: 0 0 100% !important;
}

/* ===== TYPOGRAPHY ===== */
h1,h2,h3,h4,h5,h6 {
  font-family: var(--m-font) !important;
  color: var(--m-text) !important;
  font-weight: 700 !important;
  line-height: 1.3 !important;
}
h1 { font-size: 2.25rem !important; margin-bottom: 16px !important; }
h2 { font-size: 1.75rem !important; }
h3 { font-size: 1.375rem !important; }
p { margin-bottom: 1em !important; }
a { color: var(--m-primary-l) !important; text-decoration: none !important; transition: color .2s !important; }
a:hover { color: var(--m-accent) !important; }

/* ===== ARTICLE CARDS ===== */
article, .article-card, [class*="post-card"], .river-item, .article-info {
  background: var(--m-card) !important;
  border-radius: var(--m-radius) !important;
  box-shadow: var(--m-shadow) !important;
  border: 1px solid var(--m-border) !important;
  padding: 24px !important;
  margin-bottom: 24px !important;
  transition: box-shadow .3s, transform .2s !important;
}
article:hover, .article-card:hover, [class*="post-card"]:hover, .river-item:hover {
  box-shadow: var(--m-shadow-lg) !important;
  transform: translateY(-2px) !important;
}
article a h2, article a h3, .article-card a h2, .article-card a h3 { color: var(--m-text) !important; }
article a:hover h2, article a:hover h3 { color: var(--m-primary-l) !important; }

/* ===== IMAGES ===== */
article img, .article-card img, .featured-image img {
  border-radius: 8px !important;
  max-width: 100% !important;
  height: auto !important;
  object-fit: cover !important;
}

/* ===== CODE BLOCKS ===== */
pre, code { font-family: 'JetBrains Mono','Fira Code','SF Mono','Consolas',monospace !important; }
pre {
  background: #1e293b !important;
  color: #e2e8f0 !important;
  border-radius: 8px !important;
  padding: 20px !important;
  overflow-x: auto !important;
  border: 1px solid #334155 !important;
  margin: 24px 0 !important;
}
code { background: #f1f5f9 !important; color: #be185d !important; padding: 2px 6px !important; border-radius: 4px !important; font-size: .9em !important; }
pre code { background: transparent !important; color: #e2e8f0 !important; padding: 0 !important; }

/* ===== TABLES ===== */
table { width: 100% !important; border-collapse: collapse !important; border-radius: 8px !important; overflow: hidden !important; box-shadow: var(--m-shadow) !important; margin: 24px 0 !important; }
th { background: var(--m-primary) !important; color: #fff !important; padding: 12px 16px !important; font-weight: 600 !important; text-align: left !important; }
td { padding: 12px 16px !important; border-bottom: 1px solid var(--m-border) !important; }
tr:nth-child(even) { background: rgba(0,0,0,.02) !important; }

/* ===== BLOCKQUOTE ===== */
blockquote {
  border-left: 4px solid var(--m-accent) !important;
  background: rgba(6,182,212,.05) !important;
  padding: 16px 24px !important;
  margin: 24px 0 !important;
  border-radius: 0 8px 8px 0 !important;
  font-style: italic !important;
  color: var(--m-muted) !important;
}

/* ===== BYLINE & META ===== */
[class*="author"], [class*="byline"] { font-size: .9rem !important; color: var(--m-muted) !important; }
[class*="breadcrumb"] { font-size: .85rem !important; color: var(--m-muted) !important; padding: 8px 0 !important; }

/* ===== BUTTONS ===== */
button, .btn, [class*="button"] { border-radius: 8px !important; font-family: var(--m-font) !important; font-weight: 600 !important; transition: all .2s !important; }

/* ===== FORM INPUTS ===== */
input[type="search"], input[type="text"] {
  border: 2px solid var(--m-border) !important;
  border-radius: 8px !important;
  padding: 10px 16px !important;
  font-family: var(--m-font) !important;
  transition: border-color .2s !important;
}
input[type="search"]:focus, input[type="text"]:focus {
  border-color: var(--m-primary-l) !important;
  outline: none !important;
  box-shadow: 0 0 0 3px rgba(59,130,246,.1) !important;
}

/* ===== PAGINATION ===== */
[class*="pagination"] { display: flex !important; justify-content: center !important; gap: 8px !important; padding: 32px 0 !important; }
[class*="pagination"] a, [class*="pagination"] span { padding: 8px 16px !important; border-radius: 8px !important; border: 1px solid var(--m-border) !important; font-weight: 500 !important; }

/* ===== CUSTOM FOOTER ===== */
#m-footer { background: var(--m-dark); color: var(--m-light); padding: 48px 24px 24px; margin-top: 60px; }
#m-footer .m-inner { max-width: 1200px; margin: 0 auto; text-align: center; }
#m-footer .m-brand { font-size: 1.5rem; font-weight: 800; margin-bottom: 12px; color: #fff; }
#m-footer .m-desc { color: var(--m-muted); font-size: .95rem; margin-bottom: 24px; max-width: 500px; margin-left: auto; margin-right: auto; }
#m-footer .m-links a { color: var(--m-muted) !important; margin: 0 16px; font-size: .9rem; }
#m-footer .m-links a:hover { color: var(--m-accent-l) !important; }
#m-footer .m-copy { margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,.1); color: #475569; font-size: .85rem; }

/* ===== READING PROGRESS BAR ===== */
#m-progress { position: fixed; top: 0; left: 0; height: 3px; background: linear-gradient(90deg, var(--m-accent), var(--m-primary-l)); z-index: 10001; transition: width .1s; width: 0; }

/* ===== BACK TO TOP BUTTON ===== */
#m-top { position: fixed; bottom: 32px; right: 32px; width: 48px; height: 48px; background: var(--m-primary); color: #fff; border: none; border-radius: 50%; font-size: 1.2rem; cursor: pointer; box-shadow: var(--m-shadow-lg); display: none; align-items: center; justify-content: center; z-index: 9999; transition: all .3s; }
#m-top:hover { background: var(--m-primary-d); transform: translateY(-2px); }

/* ===== RESPONSIVE ===== */
@media (max-width: 768px) {
  #m-header .m-inner { flex-direction: column; gap: 8px; padding: 10px 16px; }
  #m-header nav a { margin: 0 12px; font-size: .85rem; }
  h1 { font-size: 1.75rem !important; }
  h2 { font-size: 1.375rem !important; }
  main, .main-content, #content { padding: 16px !important; }
}
</style>`;
}

function getCustomHeaderHtml() {
  return `<div id="m-header"><div class="m-inner"><a href="/" class="m-logo">${CUSTOM_BRAND} <b>NEWS</b></a><nav><a href="/">Home</a><a href="/category/application-development/">Dev</a><a href="/category/cloud-computing/">Cloud</a><a href="/category/artificial-intelligence/">AI</a><a href="/category/security/">Security</a><a href="/category/devops/">DevOps</a></nav></div></div>`;
}

function getCustomFooterHtml() {
  return `<div id="m-footer"><div class="m-inner"><div class="m-brand">${CUSTOM_BRAND} News</div><div class="m-desc">Your source for the latest technology news, insights, and analysis.</div><div class="m-links"><a href="/">Home</a><a href="/category/application-development/">Development</a><a href="/category/cloud-computing/">Cloud</a><a href="/category/artificial-intelligence/">AI</a><a href="/category/security/">Security</a></div><div class="m-copy">&copy; 2025 ${CUSTOM_BRAND} News. All rights reserved.</div></div></div>`;
}

function getCustomJs() {
  return `<script id="mirror-theme-js">
(function(){
  var pb=document.createElement('div');pb.id='m-progress';document.body.prepend(pb);
  var bt=document.createElement('button');bt.id='m-top';bt.innerHTML='&#8593;';bt.title='Back to top';document.body.appendChild(bt);
  function onScroll(){
    var st=window.scrollY,dh=document.documentElement.scrollHeight-window.innerHeight;
    if(dh>0)pb.style.width=(st/dh*100)+'%';
    bt.style.display=st>300?'flex':'none';
  }
  window.addEventListener('scroll',onScroll,{passive:true});
  bt.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'})});
  document.addEventListener('DOMContentLoaded',function(){
    var rm=['[class*="ad-container"]','[class*="ad-slot"]','[id*="google_ads"]','ins.adsbygoogle',
      '[id*="onetrust"]','[class*="onetrust"]','[class*="cookie-banner"]','[class*="consent-banner"]',
      '[class*="social-share"]','[class*="share-bar"]','[class*="newsletter-promo"]',
      '[class*="subscribe-promo"]','[class*="sponsored"]','[data-ad]','.ad','.ads'];
    rm.forEach(function(s){try{document.querySelectorAll(s).forEach(function(e){e.remove()})}catch(x){}});
  });
})();
<\/script>`;
}

/**
 * Transform HTML for custom UI — remove ads/tracking, inject theme
 */
function transformHtmlUi(content) {
  // Remove ad and tracking scripts
  for (const pattern of AD_TRACKING_PATTERNS) {
    content = content.replace(pattern, "");
  }

  // Keep original title and og:site_name as-is (InfoWorld)

  // Inject custom CSS before </head>
  content = content.replace(/<\/head>/i, getCustomCss() + "\n</head>");

  // Inject custom header after <body...>
  content = content.replace(/(<body[^>]*>)/i, "$1\n" + getCustomHeaderHtml());

  // Inject custom footer and JS before </body>
  content = content.replace(/<\/body>/i, getCustomFooterHtml() + "\n" + getCustomJs() + "\n</body>");

  return content;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getMirrorOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  if (MIRROR_DOMAIN) return `${proto}://${MIRROR_DOMAIN}`;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function getMirrorHost(req) {
  if (MIRROR_DOMAIN) return MIRROR_DOMAIN;
  return req.headers["x-forwarded-host"] || req.headers.host;
}

async function decompressBody(data, encoding) {
  if (!encoding) return data;
  return new Promise((resolve, reject) => {
    switch (encoding) {
      case "gzip":
        zlib.gunzip(data, (err, result) => (err ? reject(err) : resolve(result)));
        break;
      case "deflate":
        zlib.inflate(data, (err, result) => (err ? reject(err) : resolve(result)));
        break;
      case "br":
        zlib.brotliDecompress(data, (err, result) => (err ? reject(err) : resolve(result)));
        break;
      default:
        resolve(data);
    }
  });
}

// ============================================================
// URL REWRITING — Strategi: Relative Paths + Absolute SEO URLs
//
// Resource URLs (CSS, JS, images, links):
//   https://www.infoworld.com/path → /path  (relative)
//   //www.infoworld.com/path      → /path  (relative)
//
// SEO meta tags (canonical, og:url, JSON-LD, dll):
//   → mirrorOrigin + /path  (absolute, penting untuk Google)
// ============================================================

/**
 * Mengubah URL source domain ke path relatif
 * https://www.infoworld.com/article/123 → /article/123
 * //www.infoworld.com/article/123      → /article/123
 * https://www.infoworld.com            → /
 */
function sourceUrlToRelativePath(url) {
  return url.replace(
    new RegExp(`^(https?:)?//${ESCAPED_SOURCE}(.*)$`, "i"),
    (match, proto, path) => path || "/"
  );
}

/**
 * Mengubah URL source domain ke absolute mirror URL
 * https://www.infoworld.com/article/123 → https://infoworld.media/article/123
 */
function sourceUrlToMirrorAbsolute(url, mirrorOrigin) {
  return url.replace(
    new RegExp(`^(https?:)?//${ESCAPED_SOURCE}(.*)$`, "i"),
    (match, proto, path) => mirrorOrigin + (path || "/")
  );
}

/**
 * Rewrite konten — strategi berbeda untuk HTML vs non-HTML
 */
function rewriteContent(body, mirrorOrigin, mirrorHost, contentType) {
  let content = body;

  if (contentType && contentType.includes("text/html")) {
    // === HTML CONTENT ===
    // Step 1: Rewrite SEO meta tags dengan absolute mirror URLs (HARUS DULUAN)
    content = rewriteHtmlMeta(content, mirrorOrigin, mirrorHost);

    // Step 2: Rewrite JSON-LD structured data dengan absolute mirror URLs
    content = content.replace(
      /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
      (match, jsonContent) => {
        const rewritten = jsonContent.replace(
          new RegExp(`(https?:)?//${ESCAPED_SOURCE}`, "gi"),
          mirrorOrigin
        );
        return match.replace(jsonContent, rewritten);
      }
    );

    // Step 3: Remove subscribers notification modal
    content = content.replace(
      /<div\s+class="subscribers-modal[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi,
      ""
    );
    // Remove subscribers SDK script tags
    content = content.replace(
      /<script[^>]*subscribers\.com[^>]*>[\s\S]*?<\/script>/gi,
      ""
    );
    content = content.replace(
      /<link[^>]*subscribers\.com[^>]*>/gi,
      ""
    );

    // Remove announcement bar
    content = content.replace(
      /<div\s+class="section-block--announcementbar[\s\S]*?<\/div>/gi,
      ""
    );

    // Step 4: Convert SEMUA remaining source URLs ke relative paths
    // Ini yang mencegah error ERR_NAME_NOT_RESOLVED
    // https://www.infoworld.com/path → /path
    content = content.replace(
      new RegExp(`(https?:)?//${ESCAPED_SOURCE}(/[^"'<>\\s]*)`, "gi"),
      "$2"
    );
    // Bare domain tanpa path → /
    content = content.replace(
      new RegExp(`(https?:)?//${ESCAPED_SOURCE}(?=["'<>\\s])`, "gi"),
      "/"
    );
    content = content.replace(
      new RegExp(`(https?:)?//${ESCAPED_SOURCE}$`, "gm"),
      "/"
    );

    // Step 5: Apply custom UI theme — remove ads/tracking, inject CSS/JS/header/footer
    content = transformHtmlUi(content);

  } else if (contentType && (contentType.includes("text/xml") || contentType.includes("application/xml") || contentType.includes("application/rss+xml") || contentType.includes("application/atom+xml"))) {
    // === XML CONTENT (Sitemaps, RSS, Atom) ===
    // Sitemaps HARUS pakai absolute URLs (standar sitemap protocol)
    // Rewrite semua source URLs ke absolute mirror URLs
    content = content.replace(
      new RegExp(`(https?:)?//${ESCAPED_SOURCE}(/[^"'<>\\s)\\\\]*)`, "gi"),
      (match, proto, path) => mirrorOrigin + path
    );
    content = content.replace(
      new RegExp(`(https?:)?//${ESCAPED_SOURCE}(?=["'<>\\s])`, "gi"),
      mirrorOrigin
    );
    content = content.replace(
      new RegExp(`(https?:)?//${ESCAPED_SOURCE}$`, "gm"),
      mirrorOrigin
    );
  } else {
    // === CSS, JS, JSON, dll ===
    // Convert semua source URLs ke relative paths
    content = content.replace(
      new RegExp(`(https?:)?//${ESCAPED_SOURCE}(/[^"'<>\\s)\\\\]*)`, "gi"),
      "$2"
    );
    content = content.replace(
      new RegExp(`(https?:)?//${ESCAPED_SOURCE}`, "gi"),
      ""
    );
  }

  // Handle escaped URLs di JS strings: https:\/\/www.infoworld.com\/path → \/path
  const ESCAPED_SOURCE_JS = ESCAPED_SOURCE.replace(/\\\./g, "\\\\\\.");
  content = content.replace(
    new RegExp(`https?:\\\\/\\\\/${ESCAPED_SOURCE_JS}(\\\\/[^"'\\s]*)`, "gi"),
    "$1"
  );
  content = content.replace(
    new RegExp(`https?:\\\\/\\\\/${ESCAPED_SOURCE_JS}`, "gi"),
    "\\/"
  );

  return content;
}

/**
 * Rewrite HTML meta tags untuk SEO — pakai ABSOLUTE mirror URLs
 * Tag ini HARUS absolute URL supaya Google indexing benar
 */
function rewriteHtmlMeta(html, mirrorOrigin, mirrorHost) {
  // Helper: replace href/content attribute in a matched tag
  function replaceAttr(match, attrName, mirrorOrig) {
    const attrRegex = new RegExp(`${attrName}=["']([^"']+)["']`, "i");
    return match.replace(attrRegex, (attrMatch, url) => {
      const newUrl = sourceUrlToMirrorAbsolute(url, mirrorOrig);
      return `${attrName}="${newUrl}"`;
    });
  }

  // 1. Canonical URL — KRITIS untuk anti-duplikat
  html = html.replace(
    /<link\s+([^>]*?)rel=["']canonical["']([^>]*?)>/gi,
    (match) => replaceAttr(match, "href", mirrorOrigin)
  );

  // 2. og:url
  html = html.replace(
    /<meta\s+([^>]*?)property=["']og:url["']([^>]*?)>/gi,
    (match) => replaceAttr(match, "content", mirrorOrigin)
  );

  // 3. alternate/hreflang
  html = html.replace(
    /<link\s+([^>]*?)rel=["']alternate["']([^>]*?)>/gi,
    (match) => replaceAttr(match, "href", mirrorOrigin)
  );

  // 4. sitemap reference
  html = html.replace(
    /<link\s+([^>]*?)rel=["']sitemap["']([^>]*?)>/gi,
    (match) => replaceAttr(match, "href", mirrorOrigin)
  );

  // 5. amphtml
  html = html.replace(
    /<link\s+([^>]*?)rel=["']amphtml["']([^>]*?)>/gi,
    (match) => replaceAttr(match, "href", mirrorOrigin)
  );

  // 6. twitter:url
  html = html.replace(
    /<meta\s+([^>]*?)name=["']twitter:url["']([^>]*?)>/gi,
    (match) => replaceAttr(match, "content", mirrorOrigin)
  );

  // 7. og:image (agar gambar preview benar di social media)
  html = html.replace(
    /<meta\s+([^>]*?)property=["']og:image["']([^>]*?)>/gi,
    (match) => replaceAttr(match, "content", mirrorOrigin)
  );

  // 8. twitter:image
  html = html.replace(
    /<meta\s+([^>]*?)name=["']twitter:image["']([^>]*?)>/gi,
    (match) => replaceAttr(match, "content", mirrorOrigin)
  );

  // 9. Tambahkan robots meta jika belum ada
  if (!/<meta\s+[^>]*name=["']robots["']/i.test(html)) {
    html = html.replace(
      /<head([^>]*)>/i,
      `<head$1>\n<meta name="robots" content="index, follow">`
    );
  }

  return html;
}

/**
 * Rewrite Location header untuk redirect
 */
function rewriteLocationHeader(location, mirrorOrigin) {
  if (!location) return location;
  // Redirect harus pakai relative path supaya browser tetap di mirror domain
  return sourceUrlToRelativePath(location);
}

function buildOriginHeaders(req) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers[key] = value;
    }
  }
  headers["host"] = SOURCE_DOMAIN;
  headers["accept-encoding"] = "gzip, deflate, br";
  if (!headers["user-agent"]) {
    headers["user-agent"] =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }
  return headers;
}

// ============================================================
// CUSTOM ROUTES
// ============================================================

app.get("/robots.txt", (req, res) => {
  const mirrorOrigin = getMirrorOrigin(req);
  const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${mirrorOrigin}/sitemap-index.xml
Sitemap: ${mirrorOrigin}/sitemap-news-en.xml
Sitemap: ${mirrorOrigin}/sitemap-articles-en.xml
Sitemap: ${mirrorOrigin}/sitemap-video-episodes-en.xml
Sitemap: ${mirrorOrigin}/sitemap-video-series.xml
Sitemap: ${mirrorOrigin}/sitemap-pages.xml
Sitemap: ${mirrorOrigin}/sitemap-blog-series.xml
Sitemap: ${mirrorOrigin}/sitemap-profiles.xml
Sitemap: ${mirrorOrigin}/sitemap-brandposts.xml
`;
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(robotsTxt);
});

// ============================================================
// MAIN PROXY HANDLER
// ============================================================

app.use(async (req, res) => {
  const mirrorOrigin = getMirrorOrigin(req);
  const mirrorHost = getMirrorHost(req);
  const targetPath = req.originalUrl;
  const targetUrl = `${SOURCE_ORIGIN}${targetPath}`;
  const cacheKey = `page:${targetPath}`;

  // Cek cache untuk GET requests
  if (req.method === "GET") {
    const cached = cache.get(cacheKey);
    if (cached) {
      for (const [key, value] of Object.entries(cached.headers)) {
        res.set(key, value);
      }
      res.set("X-Cache", "HIT");
      res.status(cached.status).send(cached.body);
      return;
    }
  }

  try {
    const originHeaders = buildOriginHeaders(req);

    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: originHeaders,
      data: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      responseType: "arraybuffer",
      maxRedirects: 0, // Handle redirects manually
      validateStatus: () => true, // Accept all status codes
      timeout: 30000,
    });

    const contentType = (response.headers["content-type"] || "").toLowerCase();
    const contentEncoding = (response.headers["content-encoding"] || "").toLowerCase();
    const statusCode = response.status;

    // Build response headers
    const responseHeaders = {};
    const skipHeaders = new Set([
      "content-encoding",
      "content-length",
      "transfer-encoding",
      "connection",
      "keep-alive",
      "strict-transport-security",
      "content-security-policy",
      "x-frame-options",
      "alt-svc",
      "cf-ray",
      "cf-cache-status",
      "server",
      "set-cookie", // Hindari cookie conflict
    ]);

    for (const [key, value] of Object.entries(response.headers)) {
      if (!skipHeaders.has(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    }

    // Handle redirects - rewrite Location header ke relative path
    if ([301, 302, 303, 307, 308].includes(statusCode)) {
      const location = response.headers["location"];
      if (location) {
        const newLocation = rewriteLocationHeader(location, mirrorOrigin);
        responseHeaders["location"] = newLocation;
      }
      for (const [key, value] of Object.entries(responseHeaders)) {
        res.set(key, value);
      }
      res.status(statusCode).end();
      return;
    }

    // Check apakah content perlu di-rewrite
    const isRewritable = REWRITABLE_TYPES.some((t) => contentType.includes(t));

    if (isRewritable && response.data && response.data.length > 0) {
      // Decompress jika perlu
      let rawBody;
      try {
        rawBody = await decompressBody(response.data, contentEncoding || null);
      } catch {
        rawBody = response.data;
      }

      let bodyString = rawBody.toString("utf-8");

      // Rewrite semua referensi domain
      bodyString = rewriteContent(bodyString, mirrorOrigin, mirrorHost, contentType);

      // Set headers
      for (const [key, value] of Object.entries(responseHeaders)) {
        res.set(key, value);
      }
      res.set("X-Cache", "MISS");
      res.set("X-Mirror-Source", "InfoWorld-Mirror");

      // Cache GET responses
      if (req.method === "GET" && statusCode >= 200 && statusCode < 400) {
        cache.set(cacheKey, {
          status: statusCode,
          headers: responseHeaders,
          body: bodyString,
        });
      }

      res.status(statusCode).send(bodyString);
    } else {
      // Binary content (images, fonts, etc.) - pass through tanpa rewrite
      for (const [key, value] of Object.entries(responseHeaders)) {
        res.set(key, value);
      }
      // Tetap set content-encoding untuk binary content
      if (contentEncoding) {
        res.set("content-encoding", contentEncoding);
      }
      res.set("X-Cache", "MISS");

      // Cache binary GET responses
      if (req.method === "GET" && statusCode >= 200 && statusCode < 400) {
        cache.set(cacheKey, {
          status: statusCode,
          headers: { ...responseHeaders, ...(contentEncoding ? { "content-encoding": contentEncoding } : {}) },
          body: response.data,
        });
      }

      res.status(statusCode).send(response.data);
    }
  } catch (error) {
    console.error(`[ERROR] ${req.method} ${targetPath}:`, error.message);

    if (error.code === "ECONNRESET" || error.code === "ECONNREFUSED") {
      res.status(502).send("Bad Gateway - Origin server unreachable");
    } else if (error.code === "ETIMEDOUT") {
      res.status(504).send("Gateway Timeout");
    } else {
      res.status(500).send("Internal Server Error");
    }
  }
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`================================================`);
  console.log(`  InfoWorld Mirror Server`);
  console.log(`  Listening on port ${PORT}`);
  console.log(`  Source: ${SOURCE_ORIGIN}`);
  console.log(`  Mirror Domain: ${MIRROR_DOMAIN || "(auto-detect from Host header)"}`);
  console.log(`  Cache TTL: ${CACHE_TTL}s`);
  console.log(`================================================`);
});
