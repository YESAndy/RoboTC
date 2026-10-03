/** Shared page-view badge for the public GitHub Pages site. */
export function mountVisitCounter(
  container: HTMLElement,
  location: Pick<Location, "hostname" | "pathname" | "search">,
) {
  const params = new URLSearchParams(location.search);
  const published = location.hostname === "yesandy.github.io" &&
    (location.pathname === "/RoboTC" || location.pathname.startsWith("/RoboTC/"));
  if (!published || params.has("test") || params.has("benchmark")) {
    container.textContent = "Website views · available on the published site";
    return;
  }
  container.textContent = "Website views · loading…";
  const badge = new Image();
  badge.alt = "Website views — total page loads counted by Hits.sh";
  badge.height = 20;
  badge.referrerPolicy = "no-referrer";
  badge.decoding = "async";
  // One image request per page load; no polling or simulator-reset increments.
  badge.onload = () => container.replaceChildren(badge);
  badge.onerror = () => {
    container.textContent = "Website views · temporarily unavailable";
  };
  badge.src = "https://hits.sh/yesandy.github.io/RoboTC.svg?label=Website%20views&color=284c40&labelColor=60736d";
}
