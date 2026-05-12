import { useEffect, useRef } from "react";
import marketingHomeHtml from "./marketing-home.html?raw";
import "../../styles/marketing-home.css";

const homepageDescription =
  "RepSync helps coaches publish profiles, capture leads, deliver training, and keep clients accountable from one connected coaching system.";

function getRouteFromHash() {
  const value = window.location.hash.replace("#", "");
  if (value === "coaches" || value === "clients") return value;
  return "home";
}

export function MarketingHomePage() {
  const pageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.title = "RepSync";

    const description = document.head.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    if (description) {
      description.content = homepageDescription;
    }
  }, []);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const sideSections = page.querySelectorAll<HTMLElement>("[data-side]");
    const routeLinks = page.querySelectorAll<HTMLElement>("[data-route]");
    const captureForms =
      page.querySelectorAll<HTMLFormElement>(".email-capture");

    const setActiveRoute = (route: string) => {
      page.classList.toggle("route-coaches", route === "coaches");
      page.classList.toggle("route-clients", route === "clients");
      sideSections.forEach((section) => {
        section.classList.toggle("is-active", section.dataset.side === route);
      });
    };

    const syncRoute = () => setActiveRoute(getRouteFromHash());

    const routeCleanups = Array.from(routeLinks).map((link) => {
      const onClick = () => {
        const route = link.getAttribute("data-route");
        if (route === "coaches" || route === "clients") setActiveRoute(route);
        if (route === "home") setActiveRoute("home");
      };

      link.addEventListener("click", onClick);
      return () => link.removeEventListener("click", onClick);
    });

    const formCleanups = Array.from(captureForms).map((form) => {
      const onSubmit = (event: SubmitEvent) => {
        event.preventDefault();
        const button = form.querySelector("button");
        if (!button) return;
        button.textContent = "You're in";
        button.setAttribute("aria-live", "polite");
      };

      form.addEventListener("submit", onSubmit);
      return () => form.removeEventListener("submit", onSubmit);
    });

    window.addEventListener("hashchange", syncRoute);
    syncRoute();

    return () => {
      window.removeEventListener("hashchange", syncRoute);
      routeCleanups.forEach((cleanup) => cleanup());
      formCleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  return (
    <div
      ref={pageRef}
      className="marketing-home-page"
      dangerouslySetInnerHTML={{ __html: marketingHomeHtml }}
    />
  );
}
