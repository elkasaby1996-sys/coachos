const header = document.querySelector(".site-header");
const menuButton = document.querySelector(".menu-button");
const mobileNav = document.querySelector(".mobile-nav");
const accessForms = document.querySelectorAll(".access-form");
const revealTargets = document.querySelectorAll(
  ".section__heading, .showcase-main, .showcase-stack article, .workflow-copy, .workflow-step, .coach-panel, .comparison-grid article, .proof-section > div, .quote-wall figure, .demo-section",
);

function setScrolledState() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 12);
}

function closeMenu() {
  if (!menuButton || !mobileNav) return;
  menuButton.setAttribute("aria-expanded", "false");
  mobileNav.classList.remove("is-open");
  document.body.classList.remove("menu-open");
}

menuButton?.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  mobileNav?.classList.toggle("is-open", !isOpen);
  document.body.classList.toggle("menu-open", !isOpen);
});

mobileNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeMenu);
});

window.addEventListener("scroll", setScrolledState, { passive: true });
setScrolledState();

const revealObserver =
  "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          });
        },
        { threshold: 0.14 },
      )
    : null;

revealTargets.forEach((target) => {
  target.classList.add("reveal");
  revealObserver?.observe(target);
});

if (!revealObserver) {
  revealTargets.forEach((target) => target.classList.add("is-visible"));
}

accessForms.forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = form.querySelector("input[type='email']");
    const message = form.querySelector(".form-message");
    const button = form.querySelector("button");

    if (!input || !message || !button) return;

    if (!input.checkValidity()) {
      message.textContent = "Enter a valid email address.";
      input.focus();
      return;
    }

    button.textContent = "Requested";
    button.disabled = true;
    message.textContent =
      "Thanks. Your request is ready to be connected to the production endpoint.";
  });
});
