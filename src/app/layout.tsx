import type { Metadata } from "next";
import Script from "next/script";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArchaeoBase",
  description: "AADR metadata explorer for ancient DNA samples and groups."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const extensionAttributeCleanup = `
    (() => {
      const shouldRemove = (name) =>
        name === "bis_skin_checked" ||
        name === "bis_register" ||
        name.startsWith("__processed_");

      const cleanNode = (node) => {
        if (!node || node.nodeType !== 1) return;
        for (const attr of Array.from(node.attributes)) {
          if (shouldRemove(attr.name)) node.removeAttribute(attr.name);
        }
      };

      const cleanSubtree = (node) => {
        cleanNode(node);
        if (!node || node.nodeType !== 1 || !node.querySelectorAll) return;
        node.querySelectorAll("[bis_skin_checked], [bis_register]").forEach(cleanNode);
        node.querySelectorAll("*").forEach((child) => {
          for (const attr of Array.from(child.attributes)) {
            if (attr.name.startsWith("__processed_")) child.removeAttribute(attr.name);
          }
        });
      };

      const cleanTree = () => {
        cleanNode(document.documentElement);
        cleanNode(document.body);
        document.querySelectorAll("[bis_skin_checked], [bis_register]").forEach(cleanNode);
        document.querySelectorAll("*").forEach((node) => {
          for (const attr of Array.from(node.attributes)) {
            if (attr.name.startsWith("__processed_")) node.removeAttribute(attr.name);
          }
        });
      };

      cleanTree();
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "attributes" && shouldRemove(mutation.attributeName || "")) {
            cleanNode(mutation.target);
          }
          mutation.addedNodes.forEach(cleanSubtree);
        }
      });
      observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
      window.addEventListener("load", cleanTree, { once: true });
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script id="extension-attribute-cleanup" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: extensionAttributeCleanup }} />
        {children}
      </body>
    </html>
  );
}
