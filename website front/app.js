const routeLinks = document.querySelectorAll("[data-route]");
const sideSections = document.querySelectorAll("[data-side]");
const captureForms = document.querySelectorAll(".email-capture");

function setActiveRoute(route) {
  document.body.classList.toggle("route-coaches", route === "coaches");
  document.body.classList.toggle("route-clients", route === "clients");
  sideSections.forEach((section) => {
    section.classList.toggle("is-active", section.dataset.side === route);
  });
}

function routeFromHash() {
  const value = window.location.hash.replace("#", "");
  if (value === "coaches" || value === "clients") return value;
  return "home";
}

function syncRoute() {
  const route = routeFromHash();
  setActiveRoute(route);
}

routeLinks.forEach((link) => {
  link.addEventListener("click", () => {
    const route = link.getAttribute("data-route");
    if (route === "coaches" || route === "clients") {
      setActiveRoute(route);
    }
    if (route === "home") {
      setActiveRoute("home");
    }
  });
});

window.addEventListener("hashchange", syncRoute);
syncRoute();

captureForms.forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    if (!button) return;
    button.textContent = "You're in";
    button.setAttribute("aria-live", "polite");
  });
});
