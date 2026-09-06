import { useEffect } from "react";

export function usePublicMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;

    let meta = document.head.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;
  }, [description, title]);
}
