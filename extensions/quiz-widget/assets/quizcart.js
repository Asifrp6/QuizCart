(() => {
  let runtimeRequest;

  function boot(source = document) {
    const scope =
      source instanceof Element
        ? source
        : source instanceof Event && source.target instanceof Element
          ? source.target
          : document;
    const roots = [];
    if (scope instanceof Element && scope.matches(".quizcart-root")) {
      roots.push(scope);
    }
    roots.push(...scope.querySelectorAll(".quizcart-root"));
    roots.forEach(loadRuntime);
  }

  function loadRuntime(root) {
    if (root.dataset.runtimeLoading === "true") return;
    const url = root.dataset.runtimeUrl;
    if (!url) {
      showError(root, "The QuizCart script URL is missing.");
      return;
    }

    root.dataset.runtimeLoading = "true";
    if (!runtimeRequest) {
      runtimeRequest = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = url;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => {
          script.remove();
          reject(new Error("The QuizCart script could not be loaded."));
        };
        document.head.append(script);
      }).catch((error) => {
        runtimeRequest = null;
        throw error;
      });
    }

    runtimeRequest.catch((error) => {
      root.dataset.runtimeLoading = "false";
      showError(root, error.message);
    });
  }

  function showError(root, message) {
    root.replaceChildren();
    root.removeAttribute("aria-busy");
    const error = document.createElement("p");
    error.className = "quizcart-error";
    error.setAttribute("role", "alert");
    error.textContent = message;
    root.append(error);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  document.addEventListener("shopify:section:load", boot);
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) boot(node);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
